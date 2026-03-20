# Communication & Swarm Coordination

Unlike decentralized, ad-hoc reactive models typical in multi-robot systems (where nodes implement peer-to-peer data interchange mechanisms like ROS2 DDS or mesh UDP), **VoxelSwarm is inherently architected as a Centralized Control Simulator.**

Because the primary objective involves evaluating computational pathing overhead ($A^*$ heuristics and Centralized Bipartite Matching models), simulating true $n$-to-$n$ asynchronous network protocols would obfuscate the specific structural metrics the research aims to quantify.

## 1. Implicit Information Exchange

The "Communication" among drone actors is fundamentally abstracted. Agents share knowledge implicitly via a globally readable construct: the **Space-Time Reservation Table ($ \mathcal{R} $)**.

When Agent $\alpha_1$ identifies its $1000$-tick optimal route across the warehouse format, it "broadcasts" the projected indices directly to $\mathcal{R}$. Agent $\alpha_{j > 1}$ operates under the assumption it maintains absolute, unimpeded access to this trajectory graph subset.

### 1.1 Analogs to Real-World Swarm Intelligence
In a physically deployed environment based heavily on this codebase's control pipeline, this logic mirrors a **Centralized Cloud/Ground Station Controller**. 
1. Real physical drones transmit latency-buffered positional telemetry to the Fleet Manager server.
2. The central node calculates the Time-Expanded Cooperative iterations.
3. The resultant array sequences $\pi_1 \dots \pi_k$ are packaged as discrete waypoint streams and transmitted downstream directly to the individual flight controllers (e.g., PX4/Mavlink via WiFi/LTE).

## 2. Coordination and Deadlock Mitigation

By maintaining deterministic centralization, the framework automatically bypasses classic decentralized consensus flaws, notably **Liveline Deadlocks** (e.g., two drones approaching symmetrically, stopping to re-calculate, and moving identically leading to indefinite cycling).

The priority strictness ($\alpha_i > \alpha_j \implies A_i$ moves flawlessly, $A_j$ yields fully) prevents cyclical dependencies in the decision loop geometry.

### 2.1 Environmental Restrictions
If a target vector involves highly non-convex routing (e.g., internal Tunneled architecture algorithms), $A_j$ relies on the implicit $h(n)$ loop expansion cost (A* Wait Edge $t \to t+1$) to coordinate passing behaviors. Agent $j$ mathematically realizes hovering indefinitely causes a cheaper $f$-cost than penetrating the dynamically-sealed spatiotemporal nodes published by $A_i$.

## 3. Fault-Tolerant Reallocation Comms
During catastrophic component simulations (Execution Pipeline Experiment 3: fault injection via `battery = 10`), the centralized Simulation Manager loop detects failure directly on the `calculateStateAt(tick)` validation tick. 
The Swarm Coordinator universally "hears" the drop, dynamically strips the orphaned task from the corrupted subset tree, and iteratively runs the core `CostModel.ts` allocation to re-evaluate the closest unassigned (or healthy returning) neighboring module.
