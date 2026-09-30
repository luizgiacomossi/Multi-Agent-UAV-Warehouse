# Strategy Benchmark

The benchmark in [`bench/`](../bench) compares the planning strategies (`Naive`, `Cooperative`, `Energy Saver`, `CBS`) on identical, seeded warehouse scenarios across warehouse scales, swarm sizes and mission modes. It writes per-run records and aggregated statistics for analysis and plotting.

## 1. Running

```bash
npm run bench                                   # "quick" preset (seconds)
npm run bench -- --preset standard              # scales x swarm sizes x allocation modes (~20 s)
npm run bench -- --preset full                  # standard + full-coverage missions (~3 min)
npm run bench -- --algos Cooperative,CBS --grids 16,24 --drones 4,8 --alloc Cluster --runs 20 --seed 7
npm run bench -- --help
```

| Option | Meaning |
|---|---|
| `--preset` | `quick`, `standard` or `full` (see Section 2) |
| `--runs` | repetitions (distinct seeded scenarios) per configuration |
| `--seed` | base seed; scenario seeds are derived from it |
| `--algos` | comma-separated strategy names |
| `--grids` | grid sizes to include: `12`, `16`, `24` |
| `--drones` | swarm sizes |
| `--alloc` | `1-to-1`, `Cluster` |
| `--completion` | `count` (fixed missions per drone), `all-pallets` (full coverage) |
| `--missions` | missions per drone in `count` mode |
| `--out` | output directory (default `bench-results/<preset>-<timestamp>/`) |

Runtimes above were measured on an Apple M4 Pro with the default 10 repetitions.

## 2. Scenario Matrix

A plan is the cartesian product of its dimensions, repeated `runs` times. The presets are defined in [`bench/scenarios.ts`](../bench/scenarios.ts).

| Scale | Grid | Pallets requested | Forklifts requested |
|---|---|---|---|
| `S-12` | 12³ | 50 | 3 |
| `M-16` | 16³ | 90 | 4 |
| `L-24` | 24³ | 200 | 6 |

| Preset | Scales | Drones | Allocation | Completion | Runs |
|---|---|---|---|---|---|
| `quick` | S-12 | 2, 4 | 1-to-1 | count | 5 |
| `standard` | S, M, L | 2, 4, 8 | 1-to-1, Cluster | count | 10 |
| `full` | S, M, L | 2, 4, 8 | 1-to-1, Cluster | count, all-pallets | 10 |

Fixed parameters are: 3 missions per drone, round trips, 100% battery with constraints enabled, mixed task priorities, deployment from the warehouse dock, a flight ceiling equal to the grid size, and a cluster radius of 5 with at most 3 pallets per cluster.

**Generator limits.** The warehouse generator places forklifts only in aisles where `x % 4 === 0`. That caps them at 1 (12³), 2 (16³) and 3 (24³), regardless of the requested count. The benchmark records the counts actually generated.

## 3. Reproducibility

All randomness in the simulation core goes through [`utils/Random.ts`](../utils/Random.ts). The app uses `Math.random`. The benchmark installs a seeded Mulberry32 generator.

- **Scenario seed.** Each scenario's seed is a hash of the base seed and the scenario coordinates (scale, drones, allocation, completion, repetition). A scenario therefore keeps its seed when other dimensions are added or removed.
- **Same scenario for every strategy.** The world and swarm are built once per scenario. Every strategy is then run on that same scenario, with the random source re-seeded before each run, so in-run randomness (e.g. cluster seeding) is identical too.
- **What is reproducible.** Every mission metric is bit-for-bit reproducible for a given seed; this is covered by the tests. Planning time depends on the machine.

## 4. Metrics

Each row of `runs.csv` is one strategy on one scenario.

| Field | Definition |
|---|---|
| `ok`, `error` | whether planning completed (a timeout or exception sets `ok=false`) |
| `planningMs` | wall-clock time of `runPathfinding` for the whole mission |
| `makespan` | ticks until the last drone finishes |
| `sumOfCosts` | sum of the drones' path durations (ticks) |
| `scans` | completed pallet scans; scans planned after a drone was lost are not counted |
| `palletCoverage` | distinct pallets scanned divided by pallets in the warehouse |
| `collisionsDroneDrone` | drone–drone vertex and swap collisions (`CollisionAnalyzer`) |
| `collisionsDroneForklift` | drone–forklift collisions |
| `lostDrones` | drones destroyed in a collision |
| `batteryDeaths` | drones whose battery reached 0 |
| `strandedDrones` | drones left without a path, neither crashed nor out of battery |
| `energyConsumed` | battery used by flight (`β_fly` per move) and hover (`β_hover` per wait), summed over drones; recharging is not subtracted |
| `distance` | grid cells travelled, summed over drones |
| `cbsNodesExpanded`, `cbsFallbacks` | CBS only: constraint-tree nodes expanded, and legs handed to the fallback planner |

Collisions are detected after planning. A drone destroyed in a collision stops at that point, so `Naive` can show a *shorter* makespan and *lower* energy than the collision-free planners. Read those columns together with `collisions`, `lostDrones` and `palletCoverage`.

## 5. Outputs

| File | Content |
|---|---|
| `runs.csv` | one row per strategy and scenario, with every field in Section 4 |
| `summary.csv` | one row per configuration and strategy: `runs`, `successRate`, and for each metric `_mean`, `_std` (sample, n − 1), `_ci95` (normal-approximation half-width 1.96·s/√n), `_median`, `_min`, `_max` |
| `summary.json` | the resolved plan and the same summaries, for scripted analysis |

The console prints one table per configuration, with the mean ± 95% CI for collisions, stranded drones, coverage, makespan, energy and planning time.

## 6. Code Structure

| File | Responsibility |
|---|---|
| `bench/scenarios.ts` | plan and scale definitions, presets, scenario expansion and seeding |
| `bench/runScenario.ts` | builds one seeded scenario and runs every strategy on it |
| `bench/metrics.ts` | computes mission metrics from a planned result |
| `bench/stats.ts` | descriptive statistics |
| `bench/report.ts` | grouping, CSV/JSON output, console tables |
| `bench/run_benchmark.ts` | command-line entry point |

To add a metric: compute it in `metrics.ts` and list it in `SUMMARY_METRICS` in `report.ts`. To add a strategy: register it in `SimulationManager` and add its name to a preset or pass it with `--algos`.
