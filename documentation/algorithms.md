# Auxiliary Algorithms and Experiment Helpers

## 1. Blocked-Goal Repair With Bounded BFS

Warehouse pallets occupy blocked rack voxels. To route a drone to a pallet, the planner uses `nearestFreeNeighbor(...)` in [`classes/PathPlanner.ts`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/classes/PathPlanner.ts).

This algorithm performs a breadth-first search from the blocked target until it finds a free neighboring voxel. The search is bounded to at most 200 visited states.

The method is useful because it converts "target embedded inside obstacle geometry" into "inspect from the nearest reachable adjacent cell."

## 2. KD-Tree Local Clustering

Cluster mode uses a 3D KD-tree implemented in [`utils/KDTree.ts`](/Users/lgr03/Documents/MDU_PhD/dev/Multi-Drone-Path-Planner-Visualizer-/utils/KDTree.ts).

For a randomly selected seed pallet, the runtime:

1. queries all pallets within a Manhattan radius,
2. sorts them by distance to the seed,
3. truncates to `maxClusterSize`,
4. removes those pallets from the pool,
5. creates a `TaskCluster`.

This is a locality heuristic, not a globally optimal clustering formulation such as k-median, k-means with constraints, or exact set partitioning.

## 3. Greedy Intra-Cluster Tour Construction

`TaskCluster.calculateTour()` constructs the internal inspection order greedily:

1. choose the task nearest the rounded centroid,
2. repeatedly choose the nearest unvisited task by Manhattan distance,
3. accumulate inter-task move cost and hover cost.

Thus the cluster execution order is a nearest-neighbor TSP heuristic.

## 4. Monte Carlo Allocation Helper

`SimulationManager.runMonteCarloAllocations(...)` generates synthetic drones and synthetic tasks, runs the Hungarian allocator, and prints summary statistics to the console.

What it currently does:

- randomizes start locations, battery levels, and payload capabilities,
- allocates with the Hungarian model,
- computes approximate residual-battery and makespan-style summaries,
- outputs a table to the browser console.

What it does not currently do:

- compare against implemented greedy and random baselines,
- run full route planning for each allocation,
- use exact battery dynamics from the mission planner.

The code itself contains a `TODO` noting the missing baselines.

## 5. Fault-Tolerance Timing Helper

`SimulationManager.runFaultToleranceScenario()` is a simplified timing experiment:

1. create five drones and five tasks,
2. perform an initial Hungarian assignment,
3. inject a battery failure into drone `FT_D2` at simulated time \(T=60\) s,
4. reassign only the orphaned task to healthy drones,
5. record the reassignment latency with `performance.now()`.

This is a useful instrumentation scaffold, but it is not a full online mission-recovery simulation.
