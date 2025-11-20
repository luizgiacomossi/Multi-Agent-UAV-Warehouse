# System Architecture: VoxelSwarm

## 1. Architectural Overview

VoxelSwarm is architected as a **Single Page Application (SPA)** utilizing a specialized separation of concerns between the **Simulation Layer** (Logic) and the **Presentation Layer** (Rendering). This decoupling ensures that heavy algorithmic computation (pathfinding) does not block the main thread's rendering capabilities, maintaining 60 FPS during visualization playback.

### High-Level Stack
*   **Runtime**: Browser / V8 Engine
*   **View Layer**: React 19 (DOM), React Three Fiber (WebGL)
*   **Logic Layer**: TypeScript (Strict Mode)
*   **State Management**: Hybrid (React State for UI + Mutable Classes for Physics)

---

## 2. Core Subsystems

### 2.1 The Simulation Kernel (`SimulationManager`)
The `SimulationManager` acts as the singleton controller for the environment. It orchestrates:

1.  **World Generation**: Utilizing Cellular Automata and Noise functions to populate `Uint8Array` voxel grids.
2.  **Agent Initialization**: Factory patterns for instantiating `Drone` objects and `MissionController` logic.
3.  **Solver Execution**: Strategy pattern implementation allowing runtime switching between `NaivePlanner`, `CooperativePlanner`, and `EnergySaverPlanner`.

**Design Pattern: Strategy**
```typescript
interface PathFindingStrategy {
  planLeg(swarm: Swarm, world: World, ...): void;
}
```
This allows the application to hot-swap algorithmic approaches (e.g., switching from Time-Optimal to Energy-Optimal) without reconstructing the simulation state.

### 2.2 The Agent Model
Agents (`Drone.ts`) are modeled as state machines containing:
*   **Kinematic History**: `path: Position3D[]`. A discrete array of positions over time.
*   **Mission Logic**: `MissionController.ts`. Handles state transitions (`IDLE` -> `OUTBOUND` -> `RETURNING`).
*   **Physics Simulation**: `calculateStateAt(tick)`. A deterministic method that reconstructs battery voltage, package status, and vertical velocity (falling physics) based on the discrete timeline.

### 2.3 The Rendering Pipeline
We utilize **React Three Fiber (R3F)** to bridge React's declarative state model with Three.js's imperative scene graph.

**Optimization: InstancedMesh**
Rendering thousands of static obstacles individually causes excessive draw calls ($O(N)$). We implement `THREE.InstancedMesh` to render the entire obstacle field in a single draw call ($O(1)$), manipulating the `InstanceMatrix` buffer directly.

**Optimization: Reactive Frame Loop**
Instead of React state driving the animation loop (which would trigger Reconciler thrashing), we use the `useFrame` hook from R3F. This binds directly to `requestAnimationFrame`, allowing us to interpolate agent positions and update scene graph transforms without React re-renders.

---

## 3. Data Flow

1.  **Configuration**: User modifies parameters (Grid Size, Agent Count) via `ControlPanel`.
2.  **Compute Phase**:
    *   `App.tsx` triggers `SimulationManager.runPathfinding()`.
    *   The planner executes A* iterations (potentially blocking main thread for <200ms, or yielding via `setTimeout` partitioning).
    *   Result: A dense array of `incidents` and updated `Agent` paths.
3.  **Playback Phase**:
    *   `App.tsx` runs a timer incrementing the global `tick`.
    *   `VoxelWorld` receives `tick`.
    *   `AgentDrone` components compute derived state (Position, Battery, Rotation) based on `path[tick]`.
    *   Scene updates.

---

## 4. Collision & Incident Detection

Collision detection is performed *post-planning* (or during planning for Cooperative mode) using a **Space-Time Hash Map**.

$$ Key = t \cdot M_{time} + z \cdot M_z + y \cdot M_y + x $$

Where $M$ are bit-shift multipliers. This allows $O(1)$ verification of overlap.

*   **Visualizing Incidents**: Incidents are stored as `SimulationIncident` objects. The `VoxelWorld` filters these based on `incident.time <= currentTick` to reveal collision markers dynamically as time progresses.

---

## 5. Extensibility

The architecture supports future expansion into:
*   **WebWorkers**: The `SimulationManager` is purely logic-based (no DOM/Three.js dependencies), making it trivial to move to a WebWorker for background pathfinding.
*   **Continuous Space**: The `Drone` class could be subclassed to support float-based coordinates, with the Planner using Theta* instead of A*.
