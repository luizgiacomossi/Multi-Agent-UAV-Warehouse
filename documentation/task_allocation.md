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
\lVert s_i - g_k \rVert_2 + \lVert g_k - p_{base} \rVert_2
\right)

+ \beta_{hover} t_k^{hover},
\]

where:

- \(s_i\) is `drone.start`,
- \(g_k\) is `task.target`,
- \(p_{base}\) is the warehouse origin if present, otherwise \((0,0,0)\),
- \(\beta_{fly}\), \(\beta_{hover}\), and \(\gamma\) come from [`SimulationConfig.ts`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/SimulationConfig.ts).

This is implemented by `calculate_e_req(...)`.

A task is feasible only if:

1. the drone supports the required payload type, and
2. `drone.battery >= e_req + DELTA_SAFE`.

Otherwise the matrix entry is set to a large penalty

\[
\Omega = 10^9.
\]

## 3. Implemented Scalar Cost

For feasible assignments, the matrix entry is built from two terms.

### 3.1 Distance term

\[
c_{dist}(i,k)=\frac{\lVert s_i - g_k \rVert_2}{D_{max}}.
\]

In `CostModel` this is Euclidean distance divided by a caller-supplied normalization constant.

Important implementation note:

- the runtime allocator in `SimulationManager` does not use the `D_MAX` constant from [`SimulationConfig.ts`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/SimulationConfig.ts);
- it currently uses the approximation `world.size * 2`.

### 3.2 Battery term

\[
c_{batt}(i)=\exp\left(-\lambda(B_i-\delta_{safe})\right).
\]

This is a drone-only penalty term, so for a fixed drone it is identical across all candidate tasks in the same allocation round.

### 3.3 Final task cost

\[
C_{ik} = \left(w_1 c_{dist}(i,k) + w_2 c_{batt}(i)\right)\pi_k.
\]

This is implemented by `calculate_C_ik(...)`.

## 4. Cluster Allocation

Cluster allocation uses the same Hungarian structure but replaces a single task with a `TaskCluster`.

For a cluster \(\kappa\), the code computes:

- a centroid,
- a greedy intra-cluster tour sequence,
- a scalar `tourCost`.

The required-energy estimate becomes

\[
e_{req}^{cluster}(i,\kappa)
=
\beta_{fly}\gamma
\left(
\lVert s_i - g_{\kappa}^{first} \rVert_2 +
\lVert g_{\kappa}^{last} - p_{base} \rVert_2
\right)
 + c_{\kappa}^{tour},
\]

where \(c_{\kappa}^{tour}\) is accumulated from Manhattan inter-task motion and hover costs inside the cluster.

The cost matrix then uses centroid distance rather than full tour distance:

\[
c_{dist}^{cluster}(i,\kappa)=
\frac{\lVert s_i - centroid(\kappa) \rVert_2}{D_{max}}.
\]

This is a heuristic bidding rule, not a globally exact clustered routing objective.

## 5. Important Behavior Of The Current Runtime

The most important implementation detail is in [`classes/SimulationManager.ts`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/classes/SimulationManager.ts).

In 1-to-1 mode, the runtime does not allocate over all remaining tasks. Instead it constructs:

\[
\texttt{pendingTasks} = \texttt{unscanned.slice(0, idleDrones.length)}.
\]

So the Hungarian step is globally optimal only over that truncated candidate subset, not over the full set of remaining pallets.

That is mathematically and experimentally significant. Any paper or thesis text describing the current implementation should state this explicitly.
