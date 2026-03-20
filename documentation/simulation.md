# Simulation Environment

## 1. Environment Representation

The simulation environment is fundamentally modeled as a dense, uniform 3D Cartesian grid (Voxels) in $\mathbb{Z}^3$. The boundary dimensions (`GRID_SIZE`) define an enclosed cubic space.

Rather than maintaining a heavy object-oriented grid, the spatial data is flattened into a 1D `Uint8Array`.
The index transformation is handled as:
$$ Index = x + S \cdot (y + S \cdot z) $$
Where $S$ is `GRID_SIZE`. This highly optimized structure allows the $A^*$ heuristic search to perform $O(1)$ block-checks with minimal CPU cache misses.

## 2. Procedural Generation Architectures

The `WorldGenerator` utility employs procedural algorithms to bootstrap varying topological complexities.

### 2.1 The Warehouse Model
The primary testbed models a commercial logistics center. It creates:
*   **Racks**: Vertical pillars spaced with specific `AISLE_WIDTH`.
*   **Spawn Zones**: Dedicated drop-off and deployment areas.
*   **Pallets**: Actionable targets for drone inspection that act as trackable database records (e.g., specific weights, required payload tracking types like RFID or Camera).
*   **Dynamic Obstacles (Forklifts)**: Ground-level Forklifts mapped to predictable, endless looping paths across defined aisles. By computing their $(x, y, z, t)$ vectors and reserving global space-time, the pathfinders natively perform collision deterrence.

### 2.2 Abstract Topologies
To test algorithmic generality, the environment supports:
*   **Open**: Sparse columnar obstacles ($5\%$ density).
*   **City**: High-density ($20\%$) blocked grids representing urban canyons, heavily restricting lower $y$-level transversals.
*   **Tunnel**: Extreme constrained environments generated using structural carves with Perlin-like noise, specifically aimed at stress-testing cooperative pathfinding resolution and deadlock risks.

## 3. Coordinate Systems and Kinematics

*   **Spatial Transitions**: Agents move exclusively using Neumann neighborhood rules (6 cardinal directions). Diagonal movement is prohibited, aligning the mathematical model with the Manhattan Distance ($\ell_1$ norm) heuristic.
*   **Time Discretization**: Time is purely discrete (`tick`). One transition between adjacent voxels $(u \to v)$ requires exactly one time step $\Delta t = 1$. The theoretical velocity is therefore uniform in grid-space.

## 4. Assumptions and Constraints

*   **Perfect State Knowledge**: The environment is fully observable. Path planners have access to the absolute ground truth of the `Uint8Array` world map. There is no Partial Observability or SLAM uncertainty simulated.
*   **Synchronous Movement**: All agents transition between nodes simultaneously at each discrete tick.
*   **Ideal Localization**: Agents never deviate from the planned path (PID control errors, wind turbulence, and motor variances are abstracted away).
