# Task Allocation and Decision Logic

The VoxelSwarm architecture assigns $N$ agents to $M$ spatially distributed tasks utilizing a centralized, globally optimal bipartite matching approach. The assignment logic is implemented within `CostModel.ts` and triggered by the `SimulationManager` when evaluating mission sets.

## 1. Problem Definition (Linear Assignment Problem)

Given a set of identical parallel task structures (e.g., Inventory scanning) with variable geographic targets and required payloads, the system maps Drone $i \in \{1 \dots N\}$ to Task $k \in \{1 \dots M\}$ such that global cost is minimized.

This is fundamentally a **balanced bipartite graph matching problem**.
VoxelSwarm utilizes the **Hungarian Algorithm** (via `munkres-js`) to achieve deterministic minimum-weight bipartite matching in computational complexity $O(\max(N,M)^3)$.

## 2. Multi-Objective Cost Formulation

Each weight $w_{ik}$ in the underlying $N \times M$ matrix comprises distance parameters normalized against exponential battery penalty constraints. 

### 2.1 The Required Energy ($E_{req}$)
Prior to validating assignment feasibility, the operational energy required to process a task and retreat successfully to a base vector is resolved linearly:
$$ E_{req} = \beta_{fly} \cdot \gamma (\|p_i - p_k\|_2 + \|p_k - p_{base}\|_2) + \beta_{hover} \cdot t_{task} $$
Where:
*   $\beta_{fly}$: Default drain rate for linear movement.
*   $\gamma = 1.3$: Real-world non-convex pathing approximation (A* detours).
*   $t_{task}$: Hover latency executing the scan/mission payload.

### 2.2 Task Feasibility Filtering ($\Omega$ Penalties)
If an agent cannot physically achieve $E_{req}$ while retaining a strict structural safety buffer defined as $\delta_{safe} = 20\%$, the edge cost $w_{ik}$ is saturated to an arbitrarily large float ($\Omega = 1e9$), effectively pruning branch assignment.
$$ B_i - E_{req} < \delta_{safe} \implies w_{ik} = \Omega $$

### 2.3 Normalized Spatial Deviation Cost
Minimizes total trajectory makespan flow:
$$ c_{dist\_ik} = \frac{\|p_i - p_k\|}{D_{max}} $$
Where $D_{max}$ normalizes metrics to $[0,1]$ according to the environment bounds.

### 2.4 Unilateral Battery Penalties
Agents suffering acute discharge ($< 35\%$ remain) map exponentially sharper cost slopes. Utilizing a continuous barrier function $\lambda$:
$$ c_{batt\_i} = \exp(-\lambda (B_i(t) - \delta_{safe})) $$

### 2.5 The Final Edge Weight $w_{ik}$
The global assignment cell $(i,k)$ represents:
$$ C_{ik} = \left( \Phi_1 \cdot c_{dist\_ik} + \Phi_2 \cdot c_{batt\_i} \right) \cdot \pi_k $$
Where $\Phi_1, \Phi_2 = 0.5$ (configurable priority weights), and $\pi_k$ represents extrinsic payload/target priority values.

## 3. Execution Pipeline in VoxelSwarm

1. `SimulationManager` aggregates `Pending` tasks.
2. `filter()` maps agents not possessing `Payload` compatibilities to $\Omega$.
3. Matrix size mapping: the code internally manages asymmetric $N \neq M$ assignments natively via padding.
4. Hungarian matches invoke `MissionController.assignNewMission(goal, ... )`. 
