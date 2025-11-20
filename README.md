# VoxelSwarm: High-Fidelity 3D Multi-Agent Path Finding Visualizer

**Abstract**

VoxelSwarm is a web-based visualization environment designed to simulate and analyze **Multi-Agent Path Finding (MAPF)** behaviors in discretized 3D spaces. The system employs **Prioritized Planning (Cooperative A*)** on **Time-Expanded Graphs (TEG)** to resolve inter-agent conflicts in polynomial time. It features a custom voxel rendering engine capable of simulating complex environments—ranging from dense urban lattices to subterranean tunnel networks—and provides real-time telemetry on agent kinematics and energy consumption.

## Research Objectives

This platform serves as a testbed for the following computer science concepts:
1.  **Decoupled Path Planning**: Analyzing the trade-offs between optimality and computational tractability in swarm coordination.
2.  **Time-Expanded Search Spaces**: Visualizing 4D (Space-Time) trajectories to solve vertex and edge collision constraints.
3.  **Energy-Constrained Heuristics**: Implementing non-uniform cost functions ($g(n)$) to simulate battery-aware navigation logic.

## Core Capabilities

### 1. Simulation Engine
*   **Algorithm**: Hierarchical Cooperative A* (HCA*) with variable time horizons.
*   **Conflict Resolution**: Space-Time Reservation Tables for dynamic obstacle avoidance.
*   **Heuristics**: $\ell_1$ (Manhattan) Norm with admissibility modifications for energy states.
*   **Complexity**: $O(k \cdot |V| \cdot T \log(|V| \cdot T))$, scaling linearly with agent count ($k$).

### 2. Procedural Environments
The system utilizes stochastic cellular generation to create distinct topological challenges:
*   **$\mathbb{R}^3$ Lattice (City)**: High-density vertical obstacles simulating urban canyons.
*   **Perlin-Noise Analogues (Tunnel)**: Constrained, non-convex navigation spaces.
*   **Sparse Fields**: Testing grounds for long-horizon trajectory optimization.

### 3. Visualization Pipeline
*   **Rendering**: React Three Fiber (WebGL) with InstancedMesh optimization for $O(1)$ draw calls on static geometry.
*   **Telemetry**: Real-time computation of flowtime, makespan, and aggregate energy flux.

## Documentation

For detailed mathematical and technical specifications, please refer to:

*   [**Algorithmic Formulation**](./ALGORITHMIC_FORMULATION.md): Mathematical definitions, graph theory, and complexity analysis.
*   [**System Architecture**](./SYSTEM_ARCHITECTURE.md): Software design patterns, rendering loop, and state management.

## Installation & Execution

```bash
# Install dependencies
npm install

# Initialize development server
npm start
```

## License

MIT License. Designed for educational and research purposes in the field of Autonomous Systems and Swarm Intelligence.
