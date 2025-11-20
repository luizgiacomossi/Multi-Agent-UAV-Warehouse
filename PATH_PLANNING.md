
# Multi-Agent Path Finding (MAPF) via Prioritized Planning on Time-Expanded Graphs

## 1. Introduction

The core algorithmic challenge in VoxelSwarm AI is the **Multi-Agent Path Finding (MAPF)** problem. The objective is to find a set of collision-free paths for a team of agents $\{a_1, a_2, \dots, a_k\}$ from their respective start locations $S = \{s_1, \dots, s_k\}$ to their goal locations $G = \{g_1, \dots, g_k\}$ within a discretized 3D grid environment.

This simulation utilizes a **Decoupled, Prioritized Planning** approach (often referred to as **Cooperative A***). Unlike Coupled approaches (e.g., A* in the joint configuration space) which suffer from exponential complexity $O(|V|^{k})$, Prioritized Planning offers a pragmatic trade-off, solving the problem in polynomial time relative to the number of agents, albeit without guaranteeing global optimality (makespan minimization).

## 2. Mathematical Formulation

### 2.1 The Environment
The environment is modeled as a directed graph $G(V, E)$, where vertices $V \subset \mathbb{Z}^3$ represent unoccupied voxel coordinates, and edges $E$ represent valid transitions between adjacent voxels.

For a voxel $v = (x, y, z)$, the neighborhood $\mathcal{N}(v)$ includes the 6 cardinal directions (Von Neumann neighborhood) and the voxel itself (representing a "wait" action):

$$
\mathcal{N}(v) = \{ u \in V \mid \|u - v\|_1 \le 1 \}
$$

### 2.2 The Time-Expanded Graph
To handle dynamic collision avoidance, we extend the spatial graph into the temporal dimension. A state is defined as a tuple $n = (x, y, z, t)$, representing a specific location at a specific discrete time step $t$.

The search space effectively becomes a **Time-Expanded Graph (TEG)**, where directed edges exist from state $(u, t)$ to $(v, t+1)$ if and only if $v \in \mathcal{N}(u)$ and neither $u$ nor $v$ are blocked by static obstacles.

### 2.3 Constraints
A valid solution requires that for any two agents $a_i, a_j$ with paths $\pi_i, \pi_j$:

1.  **Vertex Collision Constraint**:
    $$ \forall t: \pi_i(t) \neq \pi_j(t) $$
    No two agents may occupy the same voxel at the same time step.

2.  **Edge Collision Constraint (Swapping)**:
    $$ \forall t: \neg (\pi_i(t) = \pi_j(t+1) \land \pi_i(t+1) = \pi_j(t)) $$
    Agents cannot traverse the same edge in opposite directions simultaneously.

## 3. Algorithm: Prioritized Planning (Cooperative A*)

The implementation solves the MAPF problem by assigning a strict priority ordering to agents (currently based on index $1 \dots k$). Paths are planned sequentially:

1.  Agent $a_1$ plans a path ignoring all other agents.
2.  Agent $a_1$'s path is treated as a dynamic obstacle in the **Space-Time Reservation Table** $\mathcal{R}$.
3.  Agent $a_2$ plans a path avoiding static obstacles AND any state $(x,y,z,t) \in \mathcal{R}$.
4.  This repeats for all $a_i$.

### 3.1 Single-Agent Solver: A* Search

For each agent, we employ the A* search algorithm on the Time-Expanded Graph.

**Cost Function $f(n)$**:
$$ f(n) = g(n) + h(n) $$
*   $g(n) = t$: The cost to reach node $n$ is simply the elapsed time.
*   $h(n)$: The heuristic estimate of the remaining cost.

**Heuristic $h(n)$**:
We use the Manhattan Distance ($\ell_1$ norm) as an admissible and consistent heuristic for the 3D grid:
$$ h(n) = |n.x - goal.x| + |n.y - goal.y| + |n.z - goal.z| $$

### 3.2 Space-Time Reservation Logic

The reservation table $\mathcal{R}$ is implemented as a Hash Set for $O(1)$ lookups.
$$ \mathcal{R} = \{ \text{hash}(x, y, z, t) \mid \exists j < i, \pi_j(t) = (x, y, z) \} $$

During the expansion of a node $u$ at time $t$ to neighbor $v$ at time $t+1$:
1.  Check if $v$ is a static obstacle.
2.  Check if $\text{hash}(v, t+1) \in \mathcal{R}$ (Vertex collision).
3.  (Optional depending on resolution) Check edge constraints.

### 3.3 Conflict Resolution: Waiting vs. Re-routing
Because the search graph includes self-loops (waiting at the current voxel), the A* solver naturally handles conflict resolution. If the optimal path is blocked by a higher-priority agent at time $t$, the solver will explore the "wait" edge $(u, t) \to (u, t+1)$, effectively pausing the agent until the path clears, provided $f(u_{wait})$ remains the lowest in the open set.

## 4. Complexity Analysis

Let:
*   $N$: Total number of voxels in the grid ($GridSize^3$).
*   $T$: Maximum time horizon for path planning.
*   $k$: Number of agents.

The Time-Expanded Graph has size $O(N \cdot T)$.
A single A* search expands at most $O(N \cdot T)$ nodes.
With $k$ agents, the total complexity is:

$$ O(k \cdot (N \cdot T) \log(N \cdot T)) $$

This is significantly more efficient than the coupled approach complexity of $O((N \cdot T)^k)$.

## 5. Limitations & Future Improvements

1.  **Incompleteness**: Prioritized planning is incomplete. A solution may exist, but the greedy reservation by a high-priority agent might permanently block a lower-priority agent (e.g., blocking a narrow corridor).
2.  **Suboptimality**: The sum of costs (flowtime) is not guaranteed to be minimal. High-priority agents do not "cooperate" to clear the way for others.
3.  **Deadlocks**: While rare in open spaces, deadlocks can occur in highly constrained tunnel environments where $a_i$ blocks $a_j$ and $a_j$ blocks $a_i$ (though strictly hierarchical priority usually prevents circular dependencies, geometry can still trap agents).

## 6. Energy-Aware Path Planning ("Energy Saver" Strategy)

Real-world drones are constrained by battery life, where physical movement consumes significantly more energy than hovering in place. The **Energy Saver** strategy modifies the A* cost function to optimize for power consumption rather than pure travel time.

### 6.1 Energy Cost Model
Unlike the standard planner where $g(n) = time$, this strategy defines $g(n)$ as the accumulated energy consumption:

$$
g(n) = \sum_{i=0}^{t} Cost(action_i)
$$

The simulation uses differential costs for actions:
*   **Move Cost ($C_{move} = 1.0$)**: High energy consumption for moving to an adjacent voxel.
*   **Wait Cost ($C_{wait} = 0.1$)**: Low energy consumption for hovering (idling) in the same voxel.

### 6.2 Heuristic Adaptation
To maintain A* admissibility (ensuring optimality), the heuristic $h(n)$ is scaled to match the minimum possible energy cost to reach the goal:
$$ h(n) = (\text{ManhattanDist}) \times C_{move} $$

### 6.3 Behavioral Differences
This change in cost function radically alters agent behavior in congested environments:

*   **Time-Optimal Agent**: If a corridor is blocked for 10 seconds, but a 5-second detour exists, the agent takes the detour ($5 < 10$).
*   **Energy-Optimal Agent**: The agent compares the energy cost.
    *   Energy(Detour) = $5 \text{ steps} \times 1.0 = 5.0$ units.
    *   Energy(Wait) = $10 \text{ steps} \times 0.1 = 1.0$ units.
    *   The agent chooses to **wait** because it consumes less battery, even though it takes longer.

### 6.4 Battery Constraints
A hard constraint is applied during the search. Any node $n$ where $g(n) > MaxBattery$ is pruned from the search tree. If no path reaches the goal within the battery budget, the agent enters an `out_of_battery` state.
