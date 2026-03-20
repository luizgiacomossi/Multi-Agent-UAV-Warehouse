# Agent Model and Behavior Structures

The agent entities represented in VoxelSwarm (`Drone`) act as finite state automata encapsulating discrete spatial tracking, physical battery simulation, and decoupled objective pipelines.

## 1. Kinematic Arrays and Structural Physics

Rather than processing real-time object positions via delta-time Newtonian integrations (typical of continuous engine models like Unity), VoxelSwarm utilizes a **Deterministic History Array**.

When Pathfinding resolves iteratively, the solution expands a simple continuous array `drone.path: Position3D[]`.
Playback interpolation acts explicitly as array reading mechanism defined by the simulation clock context (`globalTick` $\in \mathbb{N}$).

```typescript
const agentPosition = (tick < path.length) ? path[tick] : start_or_goal;
```

### 1.1 Structural Fall Physics (Energy Depletion)
An explicit exception to linear route adherence occurs during complete battery exhaustion (`deathTick`). The `Drone.calculateStateAt(tick)` function processes the entire path historically:
*   If theoretical battery drain $\Sigma (C_{fly} + C_{hover})$ forces the integral state to $0$, the `deathTick` is permanently flagged.
*   Instead of reading the planned path index, rendering calculates gravitational fall: $y(t_{post\_death}) = \max(0, \text{pos}_y - t \cdot 0.8)$. 

## 2. Decision Making Pipeline (MissionController)

The internal logic flow representing the deliberative layer is executed via the `MissionController` class.

### 2.1 State Sub-graph
The primary mission logic relies on reactive transition bindings governed strictly by operational task status:
*   **`IDLE`**: Awaiting tasks. Will generally path back to $p_{base}$ or loiter depending on configuration (`mustReturnToBase`).
*   **`OUTBOUND`**: Navigating utilizing resolved `PathPlanner` metrics. Validates progress and checks if global time coordinate alignment aligns with `goal` nodes.
*   **`RETURNING`**: Milk-Run optimization. Agent completed the forward objective matrix, triggering subsequent planning passes to the closest charging terminal node.
*   **`COMPLETED` / `STRANDED`**: Terminal status branches halting loop hooks.

### 2.2 Leg Iterators
Path execution involves "Legs" processed symmetrically. When `MissionController.completeLeg()` returns `true`, it informs the `SimulationManager` orchestration loop that the `Drone` memory is contextually free to be mapped via the Hungarian Matrix to a new subset task identifier, enabling essentially limitless simulated cycles (Infinite Mode scenarios).

## 3. Battery Degredation Mechanism

Energy levels are updated incrementally. At time step $t$, the cost to execute action $v_{t-1} \to v_t$:

1. Ensure the agent bounds align with defined Station Coordinates. If `Waiting` on a station, $Battery = M_{cap}$ immediately.
2. Deduct $C_{fly}$ if geometrically advancing ($\Delta x \lor \Delta y \lor \Delta z$).
3. Deduct $C_{hover}$ if spatial indices are static.
