<p align="center">
  <a href="https://nextarc.eu/">
    <img src="public/nextarc-logo.png" alt="NexTArc Logo" width="110"/>
  </a>
</p>

# NexTArc (UC2 - Multi-Agent UAV Warehouse Inspection)

[NexTArc](https://nextarc.eu/) **Use Case 2 (UC2)** is a browser-based simulator and visualizer for centralized multi-drone task allocation and grid-based multi-agent path planning (MAPF) in discretized 3D warehouse environments. The project combines a TypeScript simulation core with a React and Three.js frontend so that planning, allocation, playback, and incident inspection can be studied from the same executable artifact.

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
- Four path planners:
  - `Naive`
  - `Cooperative`
  - `Energy Saver`
  - `CBS` (Conflict-Based Search)
  The first three are implemented in [`classes/PathPlanner.ts`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/classes/PathPlanner.ts); CBS is in [`classes/CBSPlanner.ts`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/classes/CBSPlanner.ts).
- Centralized allocation with `munkres-js`; see [`classes/CostModel.ts`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/classes/CostModel.ts).
- Optional clustered missions built from a KD-tree neighborhood query and an intra-cluster tour ordered from the assigned drone's position; see [`utils/KDTree.ts`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/utils/KDTree.ts) and [`classes/TaskCluster.ts`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/classes/TaskCluster.ts).
- Deterministic playback from precomputed paths, including battery depletion, recharging, and crash/fall visualization; see [`classes/Drone.ts`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/classes/Drone.ts).
- Charging at the base (every drone at once) and at optional charging stations (one drone each), instantly or at a set rate in % per tick. Drones that cannot afford any task get a recharge job at the charger where they are ready soonest; see [`documentation/task_allocation.md`](documentation/task_allocation.md).
- Console-driven experiment helpers for Monte Carlo allocation sweeps and a simplified fault-injection timing scenario; see [`classes/SimulationManager.ts`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/classes/SimulationManager.ts).

## Important Scope Notes

The earlier documentation overstated several aspects of the implementation. The revised documentation in [`documentation/`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/documentation) now matches the code more closely.

In particular:

- cluster formation is greedy (priority-seeded); tours are exact only for clusters of up to 6 pallets;
- the `Cooperative` and `Energy Saver` planners reserve both vertices and directed edges in space-time, but planning is prioritized and therefore incomplete; `CBS` plans the drones of each leg jointly and is conflict-free within a leg, but it is optimal per leg only (not over the whole mission) and falls back to prioritized A* when its search budget runs out;
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
- [`documentation/benchmark.md`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/documentation/benchmark.md): reproducible strategy benchmark, metrics and outputs
- [`documentation/limitations.md`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/documentation/limitations.md): current limitations and concrete future work

## Running The Project

```bash
npm install
npm run dev
```

The default Vite dev server runs locally and the experiments can be triggered from the control panel. Their output is written to the browser console.

To run the test suite and the strategy benchmark:

```bash
npm test
npm run bench -- --preset standard
```

The benchmark compares all strategies on identical seeded scenarios across warehouse scales and swarm sizes, and writes CSV/JSON statistics to `bench-results/`; see [`documentation/benchmark.md`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/documentation/benchmark.md).
