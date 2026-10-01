# Limitations and Future Work

## 1. The Current Documentation Boundary

The revised documentation is now closer to the code, but the implementation still has several substantive modeling and algorithmic limitations. These are not cosmetic issues; they affect what can be claimed in a thesis or paper.

## 2. Windowed vs Full-Set Allocation

In 1-to-1 mode, `SimulationManager` constructs a candidate task pool scaled dynamically with swarm size:

\[
\min\left(|\text{unscanned}|, \max(4 \cdot |\text{idleDrones}|, 20)\right),
\]

screened to match the payload types supported by the active idle drones.

While this prevents starvation caused by sensor mismatches and keeps runtime performance snappy, it is a windowed matching rather than a global Hungarian match over the entirety of hundreds of remaining pallets simultaneously.

Future work:
- evaluate the optimality gap between windowed candidate allocation and full-warehouse matching,
- investigate hierarchical spatial bisection for multi-bay warehouses.

## 3. Dynamic Battery Horizon and Recharging Integration

The path planners now bound search using true residual battery calculated at dispatch time (`drone.calculateStateAt(...)`).

Future work:
- integrate automated en-route detour to charging pads directly inside A* search when remaining battery is insufficient for a return journey,
- optionally plan in a fully coupled hybrid state space \((x,y,z,t,B)\).

## 4. Prioritized Planning vs Coupled MAPF

The cooperative planners enforce both vertex reservations and directed edge reservations \((u \to v, t)\), preventing head-on swap conflicts by construction across drones and dynamic forklifts.

However, prioritized planning is fundamentally incomplete. When a leg has no path, the drone hovers in place for `RETRY_WAIT_TICKS` and re-plans on the next cycle. After `MAX_LEG_RETRIES` failed attempts, a drone with a pallet task abandons it: the pallet returns to the pool, and one abandoned `MAX_PALLET_ABANDONS` times is marked unreachable. A drone that cannot get home is stranded. Goal cells occupied by drones parked at the end of the search horizon are skipped when resolving hover targets.

The prioritized planners only check that a goal is free on arrival, not that the drone can stay there. This is safe as long as the drone's next leg leaves before other committed traffic passes. It can still fail if that next leg cannot be planned and the drone has to hover in place to retry. No such collision appeared in the benchmark (432 runs), but it is not excluded by construction. The `CBS` planner also checks that a goal can be held (see `path_planning.md`, Section 4.4). Any collision is caught post hoc by `CollisionAnalyzer`.

CBS is optimal per planning leg only. Legs are still planned cycle by cycle against committed traffic, so the mission as a whole is not jointly optimal. Its worst-case runtime is exponential, which is bounded by a node and time budget with a fallback to prioritized A*.

Future work:
- add a bounded-suboptimal variant (ECBS/EECBS) to scale CBS to larger swarms,
- support priority re-ordering or dynamic priority inversion when lower-priority drones become trapped.

## 5. Cluster Routing Is Heuristic

Cluster tours are ordered exactly from the assigned drone's position for clusters of up to 6 pallets (the default maximum is 3). Larger clusters fall back to nearest neighbour, which has no approximation guarantee. Cluster formation itself is greedy (priority-seeded, one cluster at a time), and the Hungarian cost still uses the distance to the cluster centroid and the average priority rather than the full tour cost.

Future work:

- use insertion heuristics or 2-opt for large clusters,
- include the tour cost in \(C_{ik}\), and form clusters jointly with the assignment.

## 6. Experimentation Coverage

The strategy benchmark (`npm run bench`, see `benchmark.md`) compares the planners on seeded, reproducible scenarios across warehouse scales and swarm sizes. It records route-level metrics with confidence intervals.

The in-app Monte Carlo helper still evaluates only the Hungarian allocation path, without greedy or random allocation baselines. The warehouse generator also caps forklifts at one per 4-cell aisle stride (1, 2 and 3 on 12³, 16³ and 24³ grids), whatever count is requested.

Future work:

- implement baseline allocators and add them to the benchmark,
- lift the forklift placement cap in `WorldGenerator`.

## 7. Fault Tolerance Experiment Is Simplified

The fault-injection experiment times reassignment of one orphaned task, but it does not replay the entire multi-agent system under online replanning.

Future work:

- integrate fault injection into the main mission loop,
- preserve actual in-flight states at failure time,
- compare recovery quality as well as latency.

## 8. Physical Modeling Is Minimal

Drones are point masses on a voxel grid with instantaneous transitions and a stylized fall animation after battery death.

Future work:

- continuous trajectory smoothing,
- rigid-body flight dynamics,
- actuator and controller constraints,
- payload-mass-dependent power models.

## 9. Implementation Constraints

- Space-time reservation keys are packed as \(x + 64y + 4096z + 262144t\) (see `SpaceTimeReservations` in `classes/PathPlanner.ts`). This is only collision-free for grid side lengths \(S \le 64\); larger worlds would produce aliased reservations.
- `runPathfinding(...)` runs synchronously on the browser main thread. The only guard against a frozen UI is the per-leg A* timeout (`PATHFINDER_TIMEOUT_MS`, 10 s).

Future work:

- widen the key encoding (e.g. `BigInt` or a string key) or derive multipliers from the world size,
- move planning into a Web Worker.

## 10. Perception And Observability Are Idealized

The planner has full access to the global map and deterministic forklift trajectories.

Future work:

- partial observability,
- sensor-range limits,
- map uncertainty,
- online obstacle discovery.
