# Multi-Agent Path Finding (MAPF) via Prioritized Planning on Time-Expanded Graphs

VoxelSwarm implements several distinct search strategies mapped through the `PathFindingStrategy` abstract class. The primary mechanism for collision-free trajectory generation is **Prioritized Planning over Time-Expanded Graphs (Cooperative A*)**.

## 1. Problem Formulation: Multi-Agent Path Finding (MAPF)

Given a set of agents $A = \{a_1, \dots, a_k\}$ and a set of tasks $\mathcal{T}$, the Multi-Agent Path Finding (MAPF) problem instance is formally defined as a tuple $\Sigma = (G, A, \mathcal{T})$. The objective is to find a set of collision-free plans $\Pi = \{\pi_1, \dots, \pi_k\}$ from their respective start locations $S = \{s_1, \dots, s_k\}$ to their goal locations $G_{oal} = \{g_1, \dots, g_k\}$ within a discretized 3D grid environment.

Coupled global $A^*$ approaches model joint configuration spaces, suffering an exponential runtime explosion $O((|V| \cdot T)^k)$. Therefore, VoxelSwarm utilizes a Decoupled, Prioritized formulation to guarantee polynomial-time resolution.

### 1.1 The Environment and Graph Model
The environment is modeled as a directed graph $G(V, E)$, where vertices $V \subset \mathbb{Z}^3$ represent unoccupied voxel coordinates.
For a voxel $v = (x, y, z)$, the valid transition neighborhood $\mathcal{N}(v)$ includes the 6 cardinal directions (Von Neumann neighborhood) and the voxel itself (representing a "wait" action):
$$ \mathcal{N}(v) = \{ u \in V \mid \|u - v\|_1 \le 1 \} $$

### 1.2 Constraints
A valid solution requires that for any two agents $a_i, a_j$:
1. **Vertex Constraint**: $\forall t, \forall i \neq j, \pi_i(t) \neq \pi_j(t)$ (No two agents occupy the same voxel simultaneously).
2. **Edge Constraint**: $\forall t, \forall i \neq j, \neg (\pi_i(t) = \pi_j(t+1) \land \pi_i(t+1) = \pi_j(t))$ (No pass-through/swapping).

## 2. Cooperative A* (Prioritized Planning)

This algorithm serializes path planning. A strict priority index ensures lower-priority agents navigate around the pre-computed routes of higher-priority peers. 

1. Agent $a_1$ plans a path ignoring all other agents.
2. Agent $a_1$'s path is treated as a dynamic obstacle in the **Space-Time Reservation Table** $\mathcal{R}$.
3. Agent $a_2$ plans a path avoiding static obstacles AND any spatiotemporal state $(x,y,z,t) \in \mathcal{R}$.
4. This repeats sequentially for all $a_i$.

### 2.1 Space-Time Reservation Table ($\mathcal{R}$) implementation
The planner projects the grid into continuous time, shifting graph traversal from $V_{3D} \to V_{4D}$. As agent $a_i$ generates the path list $[-n-\dots-n_{final}]$, each state coordinate including its `time` integer is inserted into a distributed hash map.

To achieve $O(1)$ collision checks during node expansion for agent $j (j > i)$, the coordinate tensor is compressed via bitwise shifting:
$$ \text{key} = x \lor (y \ll 6) \lor (z \ll 12) \lor (t \ll 18) $$
$$ \text{if } hash \in \mathcal{R}: \text{prune node from OpenSet} $$

Waiting actions ($x, y, z, t \to x, y, z, t+1$) naturally resolve temporal conflicts, allowing agent $j$ to hover until a corridor opens.

### 2.2 Re-Routing Goal Obstructions
If a target coordinate $g$ overlaps an explicit structural object (like a Pallet), the solver dynamically executes a bounded 5-iteration Breadth-First Search (BFS) to find the nearest unoccupied Von Neumann neighbor $\mathcal{N}(g)$, resolving target blockages $O(b^d)$ immediately.

## 3. Heuristic Implementation and Graph Edge Costs

The $f$-cost function dictates algorithmic search behavior: $f(n) = g(n) + h(n)$.
We utilize the **Manhattan Distance ($\ell_1$ norm)** as our consistent, admissible heuristic $h(n)$.

VoxelSwarm implements two A* variations corresponding to specific cost structures:

### 3.1 Naive/Cooperative A* (Time-Optimal)
Designed to minimize flowtime/time-steps.
$$ g(n) = t $$
$$ Cost(Move) = 1.0, \quad Cost(Wait) = 1.0 $$

### 3.2 Energy Saver A* (Energy-Optimal)
Simulates realistic quadrotor energy dynamics where stationary hovering utilizes significantly less battery capacity than lateral thrust vectors.

$$ g(n) = \sum C_{action} $$
Where $C_{wait} = \beta_{hover} = 0.1$ and $C_{move} = \beta_{fly} = 1.0$.

To maintain admissibility, the Manhattan distance is normalized by the lowest possible energy expenditure required to reach the target:
$$ h_{energy}(n) = \ell_1(\text{pos}, \text{goal}) \times \beta_{fly} $$

This drastically alters swarm emergent behavior. A blocked drone will prefer to wait $10$ seconds to let a corridor clear (cost $1.0$) rather than taking a $4$-step detour (cost $4.0$).

## 4. Complexity Analysis 
* **State Space Size**: $|V| \cdot T$ (where $T = \text{max timesteps}$).
* **Single Path**: $O(|V| \cdot T \log(|V| \cdot T))$.
* **Total Swarm Complexity**: $O(k \cdot |V| \cdot T \log(|V| \cdot T))$.
* **Memory Complexity**: Exploring the Time-Expanded Graph requires maintaining the Reservation Table $\mathcal{R}$ and A* Closed Sets, bottlenecking at $O(k \cdot T)$. Since optimal path lengths roughly correspond to the grid diameter $D$, this approximates to $O(k \cdot D)$.

This predictable linear scaling with relation to $k$ permits the 60 FPS Browser visualization without blocking the main renderer execution thread excessively.

## 5. Algorithmic Limitations

1.  **Incompleteness**: Prioritized planning is theoretically incomplete. A solution may exist, but the greedy reservation by a high-priority agent might permanently block a lower-priority agent (e.g., parking inside a narrow tunnel exit).
2.  **Suboptimality**: The sum of costs (makespan flowtime) is globally suboptimal. High-priority agents possess no intelligence to "cooperate" or yield pathing matrices to clear the way for slower/battery-drained peers.
