# VoxelSwarm

VoxelSwarm is a browser-based simulator and visualizer for centralized multi-drone task allocation and grid-based multi-agent path planning in discretized 3D environments. The project combines a TypeScript simulation core with a React and Three.js frontend so that planning, allocation, playback, and incident inspection can be studied from the same executable artifact.

The repository is best understood as an experimental platform for:

- centralized task allocation using the Hungarian algorithm,
- prioritized multi-agent path planning on a time-expanded voxel grid,
- battery-aware mission feasibility screening,
- clustered warehouse inspection missions,
- replayable execution traces with post hoc collision and battery incident analysis.

## What The Current Implementation Actually Contains

The codebase implements the following major mechanisms.

- A 3D voxel world stored in a flattened `Uint8Array`; see [`classes/World.ts`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/classes/World.ts).
- Procedural world generation for warehouse, city, tunnel, open, and random themes; see [`classes/WorldGenerator.ts`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/classes/WorldGenerator.ts).
- Three path planners:
  - `Naive`
  - `Cooperative`
  - `Energy Saver`
  These are implemented in [`classes/PathPlanner.ts`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/classes/PathPlanner.ts).
- Centralized allocation with `munkres-js`; see [`classes/CostModel.ts`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/classes/CostModel.ts).
- Optional clustered missions built from a KD-tree neighborhood query and a greedy intra-cluster tour heuristic; see [`utils/KDTree.ts`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/utils/KDTree.ts) and [`classes/TaskCluster.ts`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/classes/TaskCluster.ts).
- Deterministic playback from precomputed paths, including battery depletion, recharging, and crash/fall visualization; see [`classes/Drone.ts`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/classes/Drone.ts).
- Console-driven experiment helpers for Monte Carlo allocation sweeps and a simplified fault-injection timing scenario; see [`classes/SimulationManager.ts`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/classes/SimulationManager.ts).

## Important Scope Notes

The earlier documentation overstated several aspects of the implementation. The revised documentation in [`documentation/`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/documentation) now matches the code more closely.

In particular:

- clustered missions are implemented, but cluster tours are greedy nearest-neighbor heuristics, not exact TSP solutions;
- the planner uses vertex-time reservation, but it does not explicitly reserve drone edge swaps, so the classical full MAPF edge-conflict model is not fully implemented;
- the `Energy Saver` planner changes the A* objective, but the other planners still optimize time steps rather than a full energy objective;
- the 1-to-1 allocator applies Hungarian matching only to a truncated subset of currently available pallets, not to the full remaining task set;
- the experiment utilities are useful, but they are not full benchmark suites with all baselines implemented.

## Documentation Map

- [`documentation/overview.md`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/documentation/overview.md): project scope and research framing
- [`documentation/architecture.md`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/documentation/architecture.md): software architecture and execution flow
- [`documentation/simulation.md`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/documentation/simulation.md): world model and procedural environments
- [`documentation/task_allocation.md`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/documentation/task_allocation.md): implemented cost model and assignment logic
- [`documentation/path_planning.md`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/documentation/path_planning.md): implemented planners and reservation mechanics
- [`documentation/agent_model.md`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/documentation/agent_model.md): drone state, mission controller, and battery dynamics
- [`documentation/communication.md`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/documentation/communication.md): centralized coordination model
- [`documentation/control_and_execution.md`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/documentation/control_and_execution.md): planning, playback, and incident timing
- [`documentation/algorithms.md`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/documentation/algorithms.md): auxiliary algorithms and experiment helpers
- [`documentation/design_decisions.md`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/documentation/design_decisions.md): design rationale and tradeoffs
- [`documentation/limitations.md`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/documentation/limitations.md): current limitations and concrete future work

## Running The Project

```bash
npm install
npm run dev
```

The default Vite dev server runs locally and the experiments can be triggered from the control panel. Their output is written to the browser console.
