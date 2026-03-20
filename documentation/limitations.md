# Theoretical Limitations and Future Work

While the VoxelSwarm architecture provides a robust, $O(k \cdot |V| \cdot T \log(|V| \cdot T))$ scalable environment for evaluating Multi-Agent Path Finding (MAPF) and centralized task allocation, certain mathematically necessary abstractions separate the simulated results from physical deployment realities. 

For the purposes of academic validation, it is critical to explicitly bound the scope of the simulation. The following sections detail the current technical and algorithmic limitations, outlining pathways for future research.

---

## 1. Kinematics, Rigid-Body Dynamics, and Low-Level Control

### 1.1 The Discrete Point-Mass Abstraction
**Current Implementation**: Drones are simulated as holonomic point-masses transitioning instantaneously between discrete $\mathbb{Z}^3$ voxels. The temporal resolution is fixed ($\Delta t = 1$), implying uniform velocity and instantaneous acceleration.
**Limitation**: This abstraction ignores Newtonian physics. In reality, quadrotors represent underactuated systems in $SE(3)$. Physical flight controllers (e.g., PX4) must evaluate PID loops compensating for inertia, angular momentum, and jerk. 
**Future Work**: Integrating a physics sub-step solver to map the $A^*$ discrete paths into smooth continuous-time trajectories (e.g., using Minimum Snap Trajectory Generation) before execution.

---

## 2. Payload-Coupled Energy Degradation

### 2.1 Uniform Battery Heuristics
**Current Implementation**: The energy consumption model relies on static penalty weights ($\beta_{fly}$ and $\beta_{hover}$) multiplied by pathing distance ($\gamma$).
**Limitation**: Real-world power draw is heavily coupled to **mass** ($m$). A drone deployed with a heavy physical package or computationally expensive sensor suite (RGB-D + LiDAR) inherently requires greater rotor thrust to maintain altitude. Eq. 13 conceptually treats all agents similarly, irrespective of their specific assigned `req_payload`.
**Future Work**: Formulate $E_{req}$ as a multivariate function of both trajectory length and dynamically loaded mass: $E_{req} = f(d_{Eucl}, t_{hover}, m_{payload})$.

---

## 3. Predictive "Mid-Flight" Reallocation and Traffic Delays

### 3.1 Static Feasibility Filtering
**Current Implementation**: The Bipartite Matching constraints drop agents ($w_{ik} \to \Omega$) if their *pre-flight* energy calculation falls below $\delta_{safe}$. 
**Limitation**: Because Prioritized Planning forces yielding, lower-priority agents may be forced to hover indefinitely while higher-priority swarms clear a constrained tunnel. This unexpected hovering burns actual battery. An agent might mathematically cross the $\delta_{safe}$ threshold *during* a mission due to traffic density, but the system currently lacks a predictive, mid-flight re-bidding structure.
**Future Work**: Implement a Receding Horizon Controller capable of monitoring real-time $f$-cost inflation. If an agent detects traffic delays threatening theoretical viability, it should abort the mission leg dynamically and trigger a global Munkres matrix recalculation.

---

## 4. Perception, SLAM, and Observability

### 4.1 Perfect Global State Knowledge
**Current Implementation**: The pathfinders operate with absolute ground-truth knowledge. Drones have $O(1)$ access to the location of all static racks, pallets, and dynamically moving Forklift entities via the centralized `Uint8Array`.
**Limitation**: Autonomous nodes suffer from Partial Observability. They rely on restricted Field of View (FOV) sensors and suffer from occlusion. A physical drone does not "know" a forklift is in the aisle until it enters sensor range.
**Future Work**: Restrict the Planner's access to the global matrix. Implement simulated raycasting (e.g., a pseudo-LiDAR point cloud) requiring drones to execute Simultaneous Localization and Mapping (SLAM) and recalculate A* paths dynamically upon "discovering" dynamic obstacles.

---

## 5. Algorithmic Incompleteness and Deadlock Resolution

### 5.1 Prioritized Planning Constraints
**Current Implementation**: The system resolves MAPF utilizing Prioritized Planning (Cooperative A*), sequentially reserving space-time nodes.
**Limitation**: Prioritized Planning is mathematically *Incomplete*. In highly constrained spaces (like a single-voxel wide Tunnel), if a high-priority drone secures a path that prevents lower-priority drones from passing, the lower-priority drone will fail to route and enter a `'STRANDED'` state—even if a globally optimal, cooperative solution exists involving the high-priority drone yielding momentarily.
**Future Work**: When the Prioritized baseline returns a failure heuristic, trigger a fallback to a complete algorithmic solver such as **Conflict-Based Search (CBS)** to resolve complex inter-agent deadlocks.
