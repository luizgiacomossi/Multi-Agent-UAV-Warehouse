# Limitations and Future Work

## 1. The Current Documentation Boundary

The revised documentation is now closer to the code, but the implementation still has several substantive modeling and algorithmic limitations. These are not cosmetic issues; they affect what can be claimed in a thesis or paper.

## 2. Allocation Is Not Over The Full Remaining Task Set

In 1-to-1 mode, `SimulationManager` truncates candidate pallets to the first `idleDrones.length` unscanned items before calling the Hungarian solver.

Therefore the runtime is not solving

\[
\min_{\text{matching over all remaining tasks}} \sum C_{ik},
\]

but a smaller subproblem chosen by list order.

Future work:

- allocate over all currently available tasks,
- or justify a deliberate candidate-pruning policy mathematically.

## 3. Planner Battery Bounds Use Full Capacity Rather Than True Residual Charge

The path planners currently bound search with `drone.maxBattery`, not exact residual battery after previously planned legs.

Future work:

- propagate true residual energy into each leg planner,
- integrate recharge events directly into feasibility and path planning,
- optionally plan in a hybrid state space \((x,y,z,t,B)\).

## 4. No Explicit Drone-Drone Edge Conflict Prevention

The cooperative planners reserve vertex-time states, but they do not explicitly reserve traversed edges. Thus classical edge-swap conflicts between drones are not prevented by construction.

Future work:

- reserve directed edges \((u,v,t)\),
- or adopt CBS or another conflict-resolution framework.

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
