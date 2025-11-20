# Algorithmic Formulation: Cooperative Multi-Agent Path Finding in $\mathbb{Z}^3$

## 1. Problem Definition

The Multi-Agent Path Finding (MAPF) problem instance is defined as a tuple $\Sigma = (G, A, \mathcal{T})$, where:

*   $G = (V, E)$ is an undirected graph representing the discretized environment.
    *   $V \subseteq \mathbb{Z}^3$ is the set of unblocked voxels.
    *   $E = \{ (u, v) \in V \times V \mid \|u - v\|_1 \leq 1 \}$ represents valid transitions (including self-loops for waiting).
*   $A = \{a_1, a_2, \dots, a_k\}$ is a set of $k$ autonomous agents.
*   $\mathcal{T} = \{ (s_1, g_1), \dots, (s_k, g_k) \}$ is the set of tasks, where $s_i \in V$ is the start location and $g_i \in V$ is the goal location for agent $a_i$.

The objective is to find a set of plans $\Pi = \{ \pi_1, \dots, \pi_k \}$, where plan $\pi_i$ is a sequence of states $(v_0, v_1, \dots, v_T)$, such that constraints $C_{vertex}$ and $C_{edge}$ are satisfied.

### 1.1 Constraints

1.  **Vertex Collision Constraint ($C_{vertex}$)**:
    No two agents may occupy the same voxel at the same discrete time step $t$.
    $$ \forall i \neq j, \forall t: \pi_i[t] \neq \pi_j[t] $$

2.  **Edge Collision Constraint ($C_{edge}$)**:
    No two agents may traverse the same edge in opposite directions simultaneously (preventing pass-through).
    $$ \forall i \neq j, \forall t: \neg (\pi_i[t] = \pi_j[t+1] \land \pi_i[t+1] = \pi_j[t]) $$

---

## 2. Approach: Decoupled Prioritized Planning

Optimal MAPF is known to be **NP-Hard** (Yu & LaValle, 2013) when minimizing flowtime (sum of costs). To achieve computational tractability suitable for real-time visualization, this system implements a **Decoupled Approach** utilizing **Prioritized Planning** (also known as Cooperative A*).

### 2.1 Priority Ordering
We define a strict priority ordering $\prec$ over $A$, such that $a_1 \prec a_2 \prec \dots \prec a_k$.
Paths are computed sequentially:
$$ \pi_i = \text{FindPath}(a_i, G, \bigcup_{j=1}^{i-1} \pi_j) $$

Lower-priority agents treat the space-time trajectories of higher-priority agents as dynamic obstacles.

### 2.2 Time-Expanded Graph (TEG) Search

We perform A* search on a **Time-Expanded Graph** $G_{\tau}$.
A node in $G_{\tau}$ is defined as $n = (x, y, z, t)$.

#### State Transitions
From state $u = (x, y, z)$ at time $t$, the valid successor states $v$ at $t+1$ are:
$$ \mathcal{N}(u) = \{ v \in V \mid \|u - v\|_1 \leq 1 \land \text{IsFree}(v, t+1) \} $$

Where $\text{IsFree}(v, t)$ returns false if any higher-priority agent occupies $v$ at $t$.

#### Reservation Table ($\mathcal{R}$)
To perform $O(1)$ collision checks, we utilize a hashing function $\phi: V \times \mathbb{N} \to \mathbb{S}$ mapping space-time coordinates to a reserved set.
$$ \phi(x, y, z, t) = (x) \lor (y \ll 6) \lor (z \ll 12) \lor (t \ll 18) $$
(Note: Bit-shifting constants are derived from grid dimensions).

---

## 3. Heuristics and Cost Functions

We define the A* cost function $f(n) = g(n) + h(n)$.

### 3.1 Standard Heuristic ($\ell_1$ Norm)
For standard time-optimal pathfinding, we use the Manhattan Distance, which is admissible and consistent for grid graphs:
$$ h(n) = \| n_{pos} - g_{pos} \|_1 = |n_x - g_x| + |n_y - g_y| + |n_z - g_z| $$
$$ g(n) = t $$

### 3.2 Energy-Aware Cost Model
To simulate battery dynamics, we modify $g(n)$ to represent energy flux rather than time. Let $\mathcal{A}$ be the set of actions $\{ \text{MOVE}, \text{WAIT} \}$.

$$ g(n) = \sum_{i=0}^{t} \text{Cost}(action_i) $$

Where:
*   $\text{Cost}(\text{MOVE}) = 1.0$ (Kinetic work required)
*   $\text{Cost}(\text{WAIT}) = 0.1$ (Avionics/Hover overhead only)

**Admissibility**:
To maintain optimality with respect to energy, the heuristic must be scaled:
$$ h_{energy}(n) = h_{standard}(n) \times \min(\text{Cost}(\text{MOVE})) $$
Since $\text{Cost}(\text{MOVE}) = 1.0$, the heuristic remains purely geometric.

**Impact on Behavior**:
In congested scenarios, agents utilizing this model will prefer **waiting** ($Cost=0.1$) over **detouring** ($Cost \geq 1.0 \times \text{PathLength}$) if the detour length exceeds the wait time by a factor of 10. This emerges organically from the $f(n)$ minimization.

---

## 4. Complexity Analysis

Let $|V|$ be the number of voxels in the grid and $T$ be the maximum time horizon.

### 4.1 State Space Size
The size of the Time-Expanded Graph is $|V| \cdot T$.

### 4.2 Computational Complexity
For a single agent, A* expands at most $O(|V| \cdot T)$ states.
With a binary heap open list, each expansion takes $O(\log(|V| \cdot T))$.
For $k$ agents, the total complexity is:

$$ O(k \cdot |V| \cdot T \cdot \log(|V| \cdot T)) $$

This linear scaling with $k$ ($O(k)$) contrasts sharply with Coupled A* approaches, which scale as $O((|V| \cdot T)^k)$.

### 4.3 Memory Complexity
The primary memory consumer is the Reservation Table $\mathcal{R}$ and the Closed Sets for each search.
$$ O(k \cdot T) $$
Since path length roughly corresponds to grid diameter $D$, this is approximately $O(k \cdot D)$.

---

## 5. Limitations

1.  **Incompleteness**: Prioritized Planning is incomplete. It is possible for a high-priority agent to inadvertently block a narrow corridor required by a low-priority agent, causing the low-priority agent to fail even if a joint solution exists.
2.  **Sub-optimality**: The solution minimizes the cost of agents sequentially, not the global Makespan ($\max_i T_i$) or Flowtime ($\sum T_i$).
