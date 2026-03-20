# VoxelSwarm: Distributed Multi-Agent Path Finding & Centralized Task Allocation Visualizer

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Three.js](https://img.shields.io/badge/Three.js-black?style=for-the-badge&logo=three.js&logoColor=white)

## 📖 Abstract

**VoxelSwarm** is a rigorous, math-driven simulation framework and visualizer designed for analyzing **Multi-Agent Path Finding (MAPF)** and **Centralized Task Allocation** in complex $\mathbb{Z}^3$ environments (e.g., automated warehouse setups).  

Built with a strictly decoupled architecture, the logic kernel operates independently from the React-Three-Fiber WebGL rendering engine. The simulation relies on polynomial-time **Prioritized Planning on Time-Expanded Graphs (Cooperative A*)** coupled with optimal **Hungarian (Munkres) Bipartite Assignments**, providing an executable testbed for PhD-level autonomous systems research, fault-tolerance benchmarking, and swarm intelligence.

---

## ✨ Core Features & Research Implementations

### 1. Mathematical Cost Integrations
The solver utilizes non-linear cost formulas evaluated prior to node dispatching:
*   **Energy Requirements**: Calculates continuous flight ($\beta_{fly}$) and hovering ($\beta_{hover}$) penalty weights via route compensation factor ($\gamma$).
*   **Feasibility Filters**: Drops unfeasible drones with insufficient batteries to an infinite assignment threshold ($\Omega$).
*   **Battery Constraints**: Dynamic cost matrices ($\Phi_1, \Phi_2$) weight absolute distance linearly against exponential battery barriers, enforcing safe-return padding ($\delta_{safe}$).

### 2. Task Allocation Integrity
The system implements the **Hungarian Munkres algorithm** natively evaluated across a dynamically sizing $N \times M$ padding tensor. This guarantees that drones calculate mathematically perfect global-minima task assignments (e.g., Pallet scanning) prior to disembarking, bypassing local-minima traps inherent to greedy heuristic solvers.

### 3. Procedural Warehouse Synthesizer
*   **Physical Tracking**: Actionable targets (Pallets) function as trackable database records handling varying payloads (RFID, Camera) and specific weights scattered procedurally across Volumetric Storage Racks in parameterized aisles.
*   **Dynamic Obstacles**: The environment simulates looping ground-level Forklifts. Pathfinders predictively map these continuous $(x,y,z,t)$ vectors to proactively reserve global space-time indices, ensuring deterministically safe routing.

---

## 🔬 Experimental Benchmarking (DevTools Export)

The Control Panel GUI natively supports automated testing loops that trace metrics (Makespan matrices, energy deviations, crash logs) directly to the browser DevTools console natively formatted for MATLAB/Python extraction.

*   **Experiment 2 (Monte Carlo Loop)**: Triggers $50$ randomized execution iterations. Spawns synthetic drones evaluating initial battery loads ($50-100\%$) and randomized payloads against 50 targeted warehouse tasks. Benchmarks standard deviations of energy draw and overall operational flowtime.
*   **Experiment 3 (Fault Injection Trigger)**: Evaluates autonomous recovery capability. Injects an instantaneous catastrophic battery collapse into Drone 2 exactly at $T=60s$. The framework benchmarks $t_{recovery}$ algorithms (in milliseconds) as the central `CostModel` dynamically strips the failed agent and natively re-executes the Bipartite Matching to orchestrate the remaining swarm.

---

## 🛠️ Architecture and Stack

*   **Logic Layer**: Pure TypeScript, implementing object-oriented Models (`Drone.ts`, `CostModel.ts`) and Strategy Patterns (`PathPlanner.ts`).
*   **Presentation Layer**: **React 19** paired with **React Three Fiber (R3F)**. Employs optimized `THREE.InstancedMesh` logic mapping GPU buffers directly to the discrete Time-Expanded Graph, effortlessly maintaining a 60 FPS playback on dense agent counts. 

---

## 📚 PhD-Level Documentation

An exhaustive breakdown of algorithmic derivations, complexity metrics, and physical limitations is available in the [`/documentation`](./documentation/) directory.

*   [`overview.md`](./documentation/overview.md) - Context and broad design.
*   [`architecture.md`](./documentation/architecture.md) - System layout, React-Decoupling, and Data Flow.
*   [`simulation.md`](./documentation/simulation.md) - $\mathbb{Z}^3$ Space formulation and Procedural Generation.
*   [`task_allocation.md`](./documentation/task_allocation.md) - Exact mathematical cost matrix implementation (Munkres constraints).
*   [`path_planning.md`](./documentation/path_planning.md) - Prioritized Planning heuristics, Energy constraints, and $A^*$ optimization.
*   [`agent_model.md`](./documentation/agent_model.md) - Deterministic tracking and physical battery simulations.
*   [`communication.md`](./documentation/communication.md) - Implicit space-time reservation methodologies.
*   [`control_and_execution.md`](./documentation/control_and_execution.md) - Pre-computation asynchronous loops vs. WebGL ticking.
*   [`algorithms.md`](./documentation/algorithms.md) - Monte Carlo arrays, Goal-Unblocking BFS, and Fault Tolerance. 
*   [`limitations.md`](./documentation/limitations.md) - Formal identification of system abstractions (e.g., continuous rigid-body dynamics, partial SLAM observability).

---

## 🚀 Installation & Execution

Ensure you have Node.js and NPM installed on your machine.

1.  **Clone the Repository**
2.  **Install Dependencies**:
    ```bash
    npm install
    ```
3.  **Run Development Server**:
    ```bash
    npm run dev
    ```
4.  **View Interface**: Navigate to the local URL (typically `http://localhost:5173`).
5.  **View Experiment Logs**: Open your browser's Developer Console (e.g., `Cmd+Option+J` on Mac/Chrome) to monitor runtime task allocation constraints and Monte Carlo statistical payloads.

---

## ⚖️ License
MIT License. Designed strictly for educational and academic research contexts.
