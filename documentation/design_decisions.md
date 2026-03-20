# Architectural Design Decisions and Rationale

The development of VoxelSwarm required balancing theoretical mathematical modeling with practical browser-based computational limits. Key design decisions and their rationale are detailed below.

## 1. Prioritized (Decoupled) vs. Coupled Space-Time Search

**Decision**: Implementing Prioritized Planning (Cooperative A*) instead of Coupled configuration space search.

*   **Context**: A Coupled $A^*$ models the global configuration space of all agents simultaneously. While guaranteeing Makespan/Flowtime theoretical optimality, the branching factor scales exponentially.
*   **Trade-off**: Browser/V8 runtimes enforce strict single-thread blocking execution limits. Solving an optimal graph for $k=8$ agents on a 24x24x24 grid via a Coupled approach easily causes runtime failures. Prioritized Planning explicitly trades total swarm optimality for a guaranteed polynomial timeline $O(k \cdot |V| \cdot T)$, forcing the heuristic algorithm to sequentially treat previous peers as dynamic spatiotemporal bounds.

## 2. Centralized Simulation over Distributed Node-Agents

**Decision**: Modeling VoxelSwarm centrally instead of replicating individual UDP/WebSocket based communicative actors.

*   **Context**: While true multi-agent robot testing implies distributed decision networking, the mathematical goals evaluating Map-Allocation matrices and cost-barriers ($c_{ik}$) heavily index optimal mathematical baselines.
*   **Rationale**: Distributing nodes logically introduces networking packet constraints, clock-skews, and latency artifacts that convolute the measurable outcomes of the cost functions. VoxelSwarm functions as the centralized Ground-station logic component dictating the swarm parameters downward.

## 3. Flat Arrays vs Linked Node Graphs

**Decision**: The Cartesian $\mathbb{Z}^3$ world is mapped to an intrinsic 1D `Uint8Array`.

*   **Context**: Typical pedagogical implementations of graphs maintain node objects containing array sub-lists representing linked structural vertices.
*   **Rationale**: Javascript Garbage Collection heavily penalizes millions of allocated micro-objects spanning graph evaluations. Flattening the topological matrices ensures CPU cache locality. The cost structure of evaluating $(x,y,z) \to Index$ via multiplicative shifting is computationally trivial compared to recursively chasing pointer references.

## 4. Non-Uniform Cost Implementation (Energy Saver)

**Decision**: The A* function differentiates explicit wait action penalties.

*   **Context**: Navigational shortest-time metrics uniformly weight movement vs station holding as $Cost=1$.
*   **Rationale**: Operational Quadrotors (or equivalently modeled VTOL assets) incur drastic battery decay mapping lateral movement against rotational hovering. Modifying the edge heuristic where spatial transition costs $1.0$ and temporal idling costs $0.1$ inherently re-trains the pathfinding engine to prioritize battery preservation over speed, simulating organic swarm grid-locks and natural waiting cascades naturally without hard-coding queue systems.
