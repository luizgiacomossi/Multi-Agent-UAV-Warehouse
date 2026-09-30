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

However, prioritized planning is fundamentally incomplete and can result in lower-priority drones becoming stranded if high-priority reservations block all paths within `maxTimeSteps`.

Future work:
- implement Conflict-Based Search (CBS) or ECBS for scenarios with extreme space-time congestion,
- support priority re-ordering or dynamic priority inversion when lower-priority drones become trapped.

## 5. Cluster Routing Is Heuristic

Cluster tours are constructed with greedy nearest-neighbor search. That is fast, but it is not optimal and has no approximation guarantee in this implementation.

Future work:

- compare greedy tours with exact small-cluster TSP,
- or use insertion heuristics, 2-opt, or beam search.

## 6. Monte Carlo Experimentation Is Partial

The Monte Carlo helper currently evaluates only the Hungarian allocation path, despite comments suggesting future comparison against greedy and random baselines.

Future work:

- implement baseline allocators,
- use reproducible random seeds,
- log full route-level metrics rather than approximate summaries only.

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

## 9. Perception And Observability Are Idealized

The planner has full access to the global map and deterministic forklift trajectories.

Future work:

- partial observability,
- sensor-range limits,
- map uncertainty,
- online obstacle discovery.
