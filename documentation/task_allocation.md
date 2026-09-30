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
2. `drone.battery >= e_req + DELTA_SAFE`.

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

In `CostModel` this evaluates Euclidean distance from the drone's current location \(p_i(t)\) divided by the maximum warehouse travel distance.

### 3.2 Battery term

\[
c_{batt}(i)=\exp\left(-\lambda(B_i-\delta_{safe})\right).
\]

This is a drone-only penalty term representing battery degradation/scarcity, penalizing drones close to the critical threshold \(\delta_{safe}\).

### 3.3 Final task cost

Because the Hungarian algorithm (Munkres) minimizes total assignment cost, higher-priority tasks (higher \(\pi_k \in (0, 1]\)) must produce lower assignment cost so that they are matched first. The implemented cost formula divides by priority:

\[
C_{ik} = \frac{w_1 c_{dist}(i,k) + w_2 c_{batt}(i)}{\max(0.01, \pi_k)}.
\]

This is implemented by `calculate_C_ik(...)`.

## 4. Cluster Allocation

Cluster allocation uses the same Hungarian structure but replaces a single task with a `TaskCluster`.

For a cluster \(\kappa\), the code computes:

- a centroid,
- a greedy intra-cluster tour sequence,
- a scalar `tourCost`.

The required-energy estimate evaluates flight from the drone's current position to the start of the tour, internal tour execution, and return from the final task to base:

\[
e_{req}^{cluster}(i,\kappa)
=
\beta_{fly}\gamma
\left(
\lVert p_i(t) - g_{\kappa}^{first} \rVert_2 +
\lVert g_{\kappa}^{last} - p_{base} \rVert_2
\right)
 + c_{\kappa}^{tour},
\]

where \(c_{\kappa}^{tour}\) is accumulated from Manhattan inter-task motion and hover costs inside the cluster.

The cost matrix then uses centroid distance from \(p_i(t)\):

\[
c_{dist}^{cluster}(i,\kappa)=
\frac{\lVert p_i(t) - centroid(\kappa) \rVert_2}{D_{max}}.
\]

The average priority of the cluster's tasks is used in \(C_{ik}\).

## 5. Candidate Task Pool and Payload Filtering

In [`classes/SimulationManager.ts`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/classes/SimulationManager.ts), the allocation loop queries unscanned pallets and constructs candidate tasks for Munkres:

1. **Payload Compatibility Screening:** The candidate pool filters available pallets by matching them against the union of active idle drones' payloads (`camera` vs `rfid`), preventing drones from stalling when leading pallets require sensors they lack.
2. **Expanded Search Window:** The allocation window provides a wider candidate pool:
   \[
   \min\left(|\text{unscanned}|, \max(4 \cdot |\text{idleDrones}|, 20)\right).
   \]
   This ensures the Hungarian solver has diverse spatial options across different aisles while keeping computation bounded and snappy in the browser.
