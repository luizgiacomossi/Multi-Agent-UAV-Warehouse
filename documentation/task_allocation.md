# Task Allocation and Cost Model

## 1. Implemented Assignment Problem

The current allocation layer solves a linear assignment problem between a set of idle drones and a candidate set of tasks or task clusters. The solver is the Hungarian algorithm provided by `munkres-js`; see [`classes/CostModel.ts`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/classes/CostModel.ts).

Given drones \(\mathcal{A} = \{a_1,\dots,a_N\}\) and tasks \(\mathcal{T} = \{\tau_1,\dots,\tau_M\}\), the code constructs a dense matrix

\[
C \in \mathbb{R}^{N \times M},
\]

then returns a minimum-cost matching on that matrix.

## 2. Required-Energy Screening

For a drone \(a_i\) and task \(\tau_k\), the code computes

\[
e_{req}(i,k)
=
\beta_{fly}\gamma
\left(
\lVert p_i(t) - g_k \rVert_2 + \lVert g_k - p_{base} \rVert_2
\right)

+ \beta_{hover} t_k^{hover},
\]

where:

- \(p_i(t)\) is the drone's current physical location (`getDroneCurrentPosition(drone)`: `drone.path[drone.path.length - 1] || drone.start`),
- \(g_k\) is `task.target`,
- \(p_{base}\) is the warehouse origin if present, otherwise \((0,0,0)\),
- \(\beta_{fly}\), \(\beta_{hover}\), and \(\gamma\) come from [`SimulationConfig.ts`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/SimulationConfig.ts).

This is implemented by `calculate_e_req(...)`.

A task is feasible only if:

1. the drone supports the required payload type (`drone.payload.includes(task.req_payload)`), and
2. the drone's actual residual battery (synchronized dynamically from `calculateStateAt`) satisfies `currentBattery >= e_req + DELTA_SAFE`.

Otherwise the matrix entry is set to a large penalty

\[
\Omega = 10^9.
\]

## 3. Implemented Scalar Cost

For feasible assignments, the matrix entry is built from two terms.

### 3.1 Distance term

\[
c_{dist}(i,k)=\frac{\lVert p_i(t) - g_k \rVert_2}{D_{max}}.
\]

In `CostModel` this evaluates Euclidean distance from the drone's current location \(p_i(t)\) divided by a normalisation constant \(D_{max}\) supplied by the caller:

- the main mission loop (`SimulationManager.runPathfinding`) uses \(D_{max} = 2S\), where \(S\) is the grid side length;
- the Monte Carlo and fault-tolerance experiments use \(D_{max} = \sqrt{3}\,S\) (the grid diagonal).

The `D_MAX` constant in `SimulationConfig.ts` (the diagonal of the default grid) is currently not used by either path.

### 3.2 Battery term

\[
c_{batt}(i)=\exp\left(-\lambda(B_i(t)-\delta_{safe})\right).
\]

This is an exponential barrier term representing battery scarcity, evaluated using the drone's true residual battery \(B_i(t)\) at the current leg start tick. It steeply penalizes drones approaching the critical margin \(\delta_{safe}\).

### 3.3 Final task cost

Because the Hungarian algorithm (Munkres) minimizes total assignment cost, higher-priority tasks (higher \(\pi_k \in (0, 1]\)) must produce lower assignment cost so that they are matched first. The implemented cost formula divides by priority:

\[
C_{ik} = \frac{w_1 c_{dist}(i,k) + w_2 c_{batt}(i)}{\max(0.01, \pi_k)}.
\]

This is implemented by `calculate_C_ik(...)`.

## 4. Cluster Allocation

Cluster allocation uses the same Hungarian structure but replaces a single task with a `TaskCluster`.

Clusters are formed greedily, one per idle drone. Each cluster is seeded with the highest-priority remaining pallet (ties go to the pallet with the most compatible pallets within the cluster radius, then to pool order), so urgent pallets anchor full clusters instead of being left over as singletons. The seed's nearest compatible neighbours within the radius complete the cluster, up to the maximum cluster size. Seeding is deterministic.

For a cluster \(\kappa\), the code computes:

- a centroid,
- an intra-cluster tour sequence, ordered per drone (`TaskCluster.planTour`): the order minimising the Manhattan route \(p_i(t) \to g_1 \to \dots \to g_{|\kappa|} \to p_{base}\), found by enumerating all orders for clusters of up to 6 pallets and by nearest neighbour from \(p_i(t)\) beyond that,
- a scalar `tourCost` incorporating both structural hover and translational flight scaled by \(\beta_{fly} \cdot \gamma\):
  \[
  c_{\kappa}^{tour} = \sum_{j=1}^{|\kappa|-1} \beta_{fly} \gamma \lVert g_j - g_{j+1} \rVert_1 + \sum_{j=1}^{|\kappa|} \beta_{hover} t_j^{hover}.
  \]

The required-energy estimate evaluates flight from the drone's current position to the start of the tour that drone would fly, internal tour execution, and return from the final task to base. Once Munkres assigns the cluster, the tour is fixed to that same order (`orderTourFrom`), so the drone flies exactly the order the feasibility check accepted:

\[
e_{req}^{cluster}(i,\kappa)
=
\beta_{fly}\gamma
\left(
\lVert p_i(t) - g_{\kappa}^{first} \rVert_2 +
\lVert g_{\kappa}^{last} - p_{base} \rVert_2
\right)
 + c_{\kappa}^{tour}.
\]

The cost matrix then uses centroid distance from \(p_i(t)\):

\[
c_{dist}^{cluster}(i,\kappa)=
\frac{\lVert p_i(t) - centroid(\kappa) \rVert_2}{D_{max}}.
\]

The average priority of the cluster's tasks is used in \(C_{ik}\).

## 5. Recharge Jobs and Charging Stations

**Feasibility with stations.** In the energy check of Sections 2–4, the return term is the distance to the nearest charger, the base or a charging station, instead of the base (`CostModel.distanceToNearestCharger`):

\[
e_{req}(i,k) = \beta_{fly}\gamma\left(\lVert p_i - g_k \rVert_2 + \min_{c \in \{p_{base}\} \cup S} \lVert g_k - c \rVert_2\right) + \beta_{hover} t_k^{hover}.
\]

Stations \(S\) are only counted when "Return" is off. With "Return" on, every task ends at the base anyway.

All energy terms are multiplied by the drone's drain multiplier \(m\) (see `agent_model.md`).

**Recharge job.** After allocation, an idle drone that got no task is checked by `ChargingPolicy.chooseCharger` ([`classes/ChargingPolicy.ts`](../classes/ChargingPolicy.ts)): if some open pallet needs its payload but none of the pallets offered in this round (the candidate pool of Section 6) passes the energy check from where the drone is, it is sent to a charger. Pallets outside the pool do not count: the drone could not have been given them, so they must not keep it from charging. Candidates are its dock and the free stations, excluding the one it stands on. A charger from which some open pallet is affordable on a full battery is preferred; among those, the one where the drone is fully charged soonest wins (travel time plus `ticksToFullCharge` of the battery left on arrival). Chargers the drone cannot reach on its battery are skipped.

This also covers **staging**: a fully charged drone that cannot afford any open pallet from where it is (e.g. pallets far from the base) moves to a station from which one is affordable. Pallets out of reach from every charger, even on a full battery, are left unscanned, and the drones land instead of flying out of their safety margin.

- **Base:** one dock per drone, so it is always available; the drone flies home and charges on the dock.
- **Station:** holds one drone. A station is booked from dispatch until its drone leaves (the policy's bookings), and booked stations are not offered to other drones. Drones plan at different clocks, so a station must also be free in time: it is not offered if another drone has reserved its cell at any tick from the requesting drone's current tick on. Without this, a drone that was behind was sent to a station others used later; it could never park there, and CBS searched for minutes for a slot that did not exist. Drones never queue: a drone that would have to wait for a station uses another site, so it never hovers in the air waiting.

On arrival, the drone charges to full by waiting on the station (`chargeInPlace`). Each charging tick is reserved for it in the space-time reservations, so no other drone plans through the station meanwhile. The drone is then idle and is allocated as usual. A recharge is not a mission: it does not count towards the drone's mission count. If a station stays unreachable after `MAX_LEG_RETRIES` plans, the drone charges on its dock instead (`cancelRecharge`).

Charging is always to full. Partial charging would save charging time but add trips to chargers, and with one-drone stations a known slot length keeps the booking simple.

## 6. Candidate Task Pool and Payload Filtering

In [`classes/SimulationManager.ts`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/classes/SimulationManager.ts), the allocation loop queries unscanned pallets and constructs candidate tasks for Munkres:

1. **Payload Compatibility Screening:** The candidate pool filters available pallets by matching them against the union of active idle drones' payloads (`camera` vs `rfid`), preventing drones from stalling when leading pallets require sensors they lack.
2. **Payload-Homogeneous Clustering:** During cluster formation, spatial range queries are filtered to only group pallets sharing the seed's `payload_type`. This ensures clusters never demand conflicting payloads that single-payload drones cannot service.
3. **Dynamic Battery Synchronization:** At each dispatch cycle, all idle drones synchronize their residual battery level from their actual flight history (`calculateStateAt(...)`) before constructing the Hungarian matrix.
4. **Docking Base Preservation:** Drones spawned at arbitrary positions (`deployFromBase: false`) retain the explicit warehouse docking station location for round-trip returns (`isRoundTrip: true`).
5. **Expanded Search Window:** The allocation window provides a wider candidate pool:
   \[
   \min\left(|\text{unscanned}|, \max(4 \cdot |\text{idleDrones}|, 20)\right).
   \]
   This ensures the Hungarian solver has diverse spatial options across different aisles while keeping computation bounded and snappy in the browser.
6. **Reachable Pallets For Stranded Drones:** The window holds the first open pallets in list order, not the nearest ones. A drone far from them (for example, staged at a charging station across the warehouse with a small battery) may be able to do none of them. For each idle drone that cannot do any pooled pallet (payload and energy check from where it is), its nearest feasible open pallets, at most 4 (`EXTRA_CANDIDATES_PER_DRONE`), are added to the pool. Without this, such a drone was sent from charger to charger for pallets it was never offered, until the time limit. When every drone can do some pooled pallet nothing is added, so results with a large battery are unchanged.
