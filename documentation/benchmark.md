# Strategy Benchmark

The benchmark in [`bench/`](../bench) compares the planning strategies (`Naive`, `Cooperative`, `Energy Saver`, `CBS`) on identical, seeded warehouse scenarios across warehouse scales, swarm sizes and mission modes. It writes per-run records and aggregated statistics for analysis and plotting.

## 1. Running

```bash
npm run bench                                   # "quick" preset (seconds)
npm run bench -- --preset standard              # scales x swarm sizes x allocation modes (~20 s)
npm run bench -- --preset full                  # standard + full-coverage missions (~3 min)
npm run bench -- --preset charging              # base only vs. charging stations (see Section 2.1)
npm run bench -- --algos Cooperative,CBS --grids 16,24 --drones 4,8 --alloc Cluster --runs 20 --seed 7
npm run bench -- --preset full --workers auto      # scenarios spread over child processes
npm run bench -- --help
```

| Option | Meaning |
|---|---|
| `--preset` | `quick`, `standard` or `full` (see Section 2) |
| `--runs` | repetitions (distinct seeded scenarios) per configuration |
| `--seed` | base seed; scenario seeds are derived from it |
| `--algos` | comma-separated strategy names |
| `--grids` | grid sizes to include: `12`, `16`, `24`, `32`, `64` |
| `--drones` | swarm sizes |
| `--alloc` | `1-to-1` (Hungarian), `Cluster`, or the one-to-one baselines `Greedy` (cheapest pair first by \(C_{ik}\)), `Nearest` (each drone takes its nearest feasible pallet, in fleet order) and `Random` (a random feasible pallet). The baselines keep the energy feasibility check |
| `--completion` | `count` (fixed missions per drone), `all-pallets` (full coverage) |
| `--missions` | missions per drone in `count` mode |
| `--sites` | charging sites including the base (1 = base only; each extra site is a one-drone station) |
| `--stations` | station placement: `spread` over the map (default) or `coverage` for the battery (Section 2.2) |
| `--rack-levels` | maximum pallets per rack column (default 8, `WAREHOUSE.RACK_LEVELS`). Each column gets 1 to this many levels at random. Left out of the scenario seed, so every height uses the same rack layout |
| `--cluster-radius`, `--cluster-size` | cluster radii and maximum pallets per cluster (defaults 5 and 3). Varied only for the `Cluster` allocation, the other modes run once with the first value, so list the default first to pair them with it. Left out of the scenario seed |
| `--altitude` | flight ceilings, the highest cell y a drone may use (default: the grid size). Pallets sit at y ≤ 6 (S-12, M-16) and y ≤ 7 (L-24), so a ceiling of 8 still reaches every pallet while packing the drones into fewer layers |
| `--charge-rate` | charging speed in % of capacity per tick, or `instant` |
| `--battery` | battery capacity per drone |
| `--drain` | battery drain multiplier (scales `β_fly` and `β_hover`; 1 = nominal) |
| `--no-return` | do not return to the base between tasks (needed for drones to use stations) |
| `--workers` | scenarios run in parallel child processes (default 1, `auto` = cores − 1). Mission metrics and the order of the records are identical for any count. Planning time is not, since the processes share the machine (see Section 3) |
| `--out` | output directory (default `bench-results/<preset>-<timestamp>/`) |

Runtimes above were measured on an Apple M4 Pro with the default 10 repetitions.

## 2. Scenario Matrix

A plan is the cartesian product of its dimensions, repeated `runs` times. The presets are defined in [`bench/scenarios.ts`](../bench/scenarios.ts).

| Scale | Grid | Pallets requested | Forklifts requested |
|---|---|---|---|
| `S-12` | 12³ | 50 | 3 |
| `M-16` | 16³ | 90 | 4 |
| `L-24` | 24³ | 200 | 6 |
| `XL-32` | 32³ | 358 | 8 |
| `XXL-64` | 64³ | 1434 | 16 |

The paper's experiments use 16, 32 and 64 (`PAPER_SCALES`): the side doubles and the pallets keep the density of the smaller scales, 0.35 per floor cell. 64 is the largest grid the space-time keys encode (coordinates 0 to 63).

| Preset | Scales | Drones | Allocation | Completion | Runs |
|---|---|---|---|---|---|
| `quick` | S-12 | 2, 4 | 1-to-1 | count | 5 |
| `standard` | S, M, L | 2, 4, 8 | 1-to-1, Cluster | count | 10 |
| `full` | S, M, L | 2, 4, 8 | 1-to-1, Cluster | count, all-pallets | 10 |
| `charging` | M, L | 2, 4, 8 | 1-to-1 | all-pallets | 5 |
| `e1` to `e5` | M-16, XL-32, XXL-64 | 2, 4, 8, 16, 32 (E5: 8, 16, 32) | see below | all-pallets | 20 (E5: 10) |

The paper presets cross every scale with every swarm size and keep Cooperative as the planner unless the experiment is about planners:

| Preset | Varies | Notes |
|---|---|---|
| `e1` | allocation: 1-to-1, Greedy, Nearest, Random | run twice, the second time with `--no-return` |
| `e2` | 1-to-1 vs Cluster with radius 5, 3, 7 and size 3, 2, 4, 6 | 1-to-1 pairs with radius 5, size 3 |
| `e3` | 1 to 7 charging sites, coverage placement | no return, 2%/tick, battery 30 |
| `e4` | Naive, Cooperative, Energy Saver, CBS | one worker (planning time is a metric) |
| `e5` | Cooperative, CBS | one worker, 10 repetitions |

**Planning horizon.** No path may run past `MAX_TIMESTEPS` (150 000 ticks). Two drones need about 98 000 ticks to cover the 64-grid warehouse. The forklifts' space-time is reserved before each planning cycle up to 5000 ticks past the longest drone path (`FORKLIFT_LOOKAHEAD_TICKS`), so a short mission does not pay for the whole horizon. The collision check uses the forklift routes directly, so a drone that met an unreserved forklift would show up as a drone–forklift collision.

Fixed parameters are: 3 missions per drone, round trips, 100% battery with constraints enabled, instant charging at the base only (so results stay comparable with earlier runs), mixed task priorities (\(\pi_k\) drawn uniformly from 0.10 to 1.00), deployment from the warehouse dock, a flight ceiling equal to the grid size, and a cluster radius of 5 with at most 3 pallets per cluster.

### 2.1 Charging Preset

The `charging` preset measures what charging stations add. It uses full-coverage missions, "Return" off (drones only go to a charger when they need to), a charge rate of 2% per tick, a battery capacity of 30 (with 100, four drones cover a 24³ warehouse on one charge, so nobody ever recharges), and 1, 2, 3 or 5 charging sites (the base plus 0–4 stations). Station placement uses no randomness, so a scenario keeps its seed, and its warehouse, for every site count: the comparison across site counts is paired.

Results (5 runs per configuration, Cooperative and CBS pooled; mean makespan in ticks, and in brackets the paired change against base only with its 95% interval). All 240 runs had 100% coverage and no collisions, battery deaths or stranded drones:

| Scale | Drones | Base only | Base + 1 | Base + 2 | Base + 4 |
|---|---|---|---|---|---|
| M-16 | 2 | 554 | 538 (-3% ± 1) | 521 (-6% ± 2) | 473 (-14% ± 6) |
| M-16 | 4 | 286 | 263 (-8% ± 7) | 250 (-13% ± 4) | 231 (-19% ± 4) |
| M-16 | 8 | 160 | 139 (-12% ± 7) | 135 (-14% ± 7) | 133 (-16% ± 6) |
| L-24 | 2 | 2063 | 1625 (-21% ± 4) | 1558 (-24% ± 3) | 1475 (-28% ± 4) |
| L-24 | 4 | 1063 | 866 (-19% ± 2) | 815 (-23% ± 2) | 770 (-28% ± 3) |
| L-24 | 8 | 530 | 460 (-12% ± 5) | 446 (-15% ± 5) | 418 (-20% ± 6) |

Stations shorten full-coverage missions by 14–28% with four stations, more in the large warehouse, where the base is farther from most pallets. A single station helps least in the medium warehouse with two drones (-3%).

With `--drain 3` the same 240 runs plan in about 40 s in total (at most 0.5 s per run), with no incidents. Mean coverage is 70%, limited by reach: with a capacity of 30, the triple drain and the absolute 20-unit safety margin, many pallets cannot be reached from any charger (in the scenario we traced, none of the pallets left over could).

### 2.2 Station Placement for Coverage

By default (`spread`) the stations are spread over the map by farthest-point sampling: the first goes to the free floor cell farthest from the base, each next one to the cell farthest from the base and the stations already placed. This ignores the battery. With battery 30 the stations go to the corners of the 32 and 64 warehouses, and the pallets between them stay out of reach: base plus one spread station covered 49% of the 64 warehouse in the E3 smoke run (8 drones), and base plus two 66%.

With `--stations coverage` (preset `e3`) the stations are placed for the battery. A pallet counts as covered when a drone leaving some charger on a full battery can scan it and still reach the nearest charger with the safety margin left, the same energy check as the allocation (Eq. 13 and 14, from the nearest dock of the base). Each station goes to the free floor cell that covers the most pallets not yet covered (greedy maximum coverage). Once every pallet is covered, each further station goes to the cell that most shortens the pallets' distance to their nearest charger. Stations must be reachable from the base on one full battery. The placement for n stations is the prefix of the same sequence, so a scenario's stations only grow with the site count, and the comparison stays paired.

`minChargingSites` records the sites (base included) after which every pallet is covered. With battery 30 (25 scenarios per scale, 2 to 32 drones) it is 1 for M-16, 2 for XL-32, and 4 for XXL-64 (5 in 2 scenarios). Smoke run (3 Nov 2026, Cooperative, 1 repetition, 2, 8 and 32 drones): coverage was 100% exactly from `minChargingSites` on, and below it at most 98%. There were no collisions, battery deaths or stranded drones. Makespan beyond the minimum, XXL-64 with 8 drones: 6299 ticks with 4 sites, 5498 with 5 and 5058 with 6 (5 spread sites: 6091). With 32 drones: 4119, 2493, 2203.

**E3 results** (3 Nov 2026, preset `e3`, 2100 runs, Cooperative, 20 repetitions, 241 s with 13 workers). No failures, collisions, battery deaths or stranded drones. `minChargingSites` was 1 for all M-16 scenarios, 2 for all XL-32, and 4 for 91 of 100 XXL-64 (5 for the rest). Base-only coverage: 100%, 84–89% and 23–27%. Paired makespan change with three stations beyond the minimum (mean, 95% interval within ±4%):

| Drones | M-16 | XL-32 | XXL-64 |
|---|---|---|---|
| 2 | -17% | -7% | -4% |
| 4 | -7% | -15% | -7% |
| 8 | -2% | -15% | -17% |
| 16 | 0% | -9% | -28% |
| 32 | 0% | -9% | -46% |

In the small warehouse the gain falls with the swarm size (with 16 and 32 drones the stations are almost unused), in the large one it grows with it. Energy follows makespan, by up to -16% in XL-32 and XXL-64.

**Forklifts.** Each forklift drives up and down one aisle along z, over the whole length of the warehouse (an aisle beside the dock starts after it), so it passes every rack row. Its path is exactly one round trip and is replayed with `t % length`. The generator places forklifts only in aisles where `x % 4 === 0`, which caps them at 1 (12³), 2 (16³) and 3 (24³), regardless of the requested count. The benchmark records the counts actually generated.

## 3. Reproducibility

All randomness in the simulation core goes through [`utils/Random.ts`](../utils/Random.ts). The app uses `Math.random`. The benchmark installs a seeded Mulberry32 generator.

- **Scenario seed.** Each scenario's seed is a hash of the base seed and the scenario coordinates (scale, drones, completion, repetition). A scenario therefore keeps its seed when other dimensions are added or removed. The allocation method, the number of charging sites, the flight ceiling and the cluster settings are left out, so all of them run on the same warehouse and their comparisons are paired.
- **Same scenario for every strategy.** The world and swarm are built once per scenario. Every strategy is then run on that same scenario, with the random source re-seeded before each run, so in-run randomness (e.g. cluster seeding) is identical too.
- **What is reproducible.** Every mission metric is bit-for-bit reproducible for a given seed; this is covered by the tests. Planning time depends on the machine.
- **Parallel runs.** With `--workers n` each child process runs whole scenarios with its own random source, and the records are put back in scenario order, so `runs.csv` matches a one-worker run except for `planningMs` (covered by the tests). On the M4 Pro the `full` preset with Cooperative only took 42 s with one worker and 9 s with 13, and the mean planning time per run went from 112 ms to 273 ms (2.45×). Report planning times from one-worker runs only. `summary.json` records the worker count.

## 4. Metrics

Each row of `runs.csv` is one strategy on one scenario. Besides the scenario coordinates it records `chargingSites`, `stationPlacement`, `chargeRate` (`Infinity` = instant) and `drainMultiplier`.

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
| `energyConsumed` | battery used by flight (`β_fly` per move) and hover (`β_hover` per wait), times the drain multiplier, summed over drones; recharging is not subtracted |
| `distance` | grid cells travelled, summed over drones |
| `stationVisits` | charging sessions at charging stations |
| `stationTicks` | ticks drones spent waiting on charging stations |
| `minChargingSites` | coverage placement only: sites, base included, from which every pallet is affordable from some charger (empty if no count covers all) |
| `legEnergyRatio` | battery used on the leg into each scan (from the previous scan or the last wait on a charger) over β_fly times the leg's grid (Manhattan) distance, averaged over scans. The allocation's estimate assumes γ (1.1) |
| `meanScanTime` | mean tick at which a pallet is first scanned, over the scanned pallets |
| `priorityScanTime` | the same, weighted by priority: \(\sum \pi_k t_k / \sum \pi_k\). Below `meanScanTime` when urgent pallets are scanned earlier |
| `legsAboveGamma` | share of those legs whose ratio exceeds γ, i.e. legs the allocation's estimate underestimated |
| `cbsNodesExpanded`, `cbsFallbacks` | CBS only: constraint-tree nodes expanded, and legs handed to the fallback planner |

Collisions are detected after planning. A drone destroyed in a collision stops at that point, so `Naive` can show a *shorter* makespan and *lower* energy than the collision-free planners. Read those columns together with `collisions`, `lostDrones` and `palletCoverage`.

## 5. Outputs

| File | Content |
|---|---|
| `runs.csv` | one row per strategy and scenario, with every field in Section 4 |
| `summary.csv` | one row per configuration and strategy: `runs`, `successRate`, and for each metric `_mean`, `_std` (sample, n − 1), `_ci95` (normal-approximation half-width 1.96·s/√n), `_median`, `_min`, `_max` |
| `tests.csv` | paired Wilcoxon signed-rank tests (`pairedTests`). For each factor that varies in the run (algorithm, allocation mode, charging sites, ceiling, rack levels), runs with the same seed and otherwise equal configuration are paired, and each pair of levels is tested on makespan, energy, sum of costs, priority-weighted scan time and planning time. Columns: the configuration, levels `a` and `b`, pairs, means, median of b − a, non-zero pairs, the statistic and the two-sided p. The p-value is exact up to 50 non-zero pairs (with ties too) and normal beyond; checked against `scipy.stats.wilcoxon`. With n pairs the smallest possible p is 2/2ⁿ (0.002 for 10) |
| `summary.json` | the resolved plan, the code version (`environment`: commit hash, whether the tree had uncommitted changes, Node version) and the same summaries, for scripted analysis |

The console prints one table per configuration, with the mean ± 95% CI for collisions, stranded drones, coverage, makespan, energy and planning time.

## 6. Code Structure

| File | Responsibility |
|---|---|
| `bench/scenarios.ts` | plan and scale definitions, presets, scenario expansion and seeding |
| `bench/runScenario.ts` | builds one seeded scenario and runs every strategy on it |
| `bench/metrics.ts` | computes mission metrics from a planned result |
| `bench/stats.ts` | descriptive statistics |
| `bench/report.ts` | grouping, CSV/JSON output, console tables |
| `bench/parallel.ts`, `bench/worker.ts` | runs the scenarios in order, or over child processes with `--workers` |
| `bench/run_benchmark.ts` | command-line entry point |

To add a metric: compute it in `metrics.ts` and list it in `SUMMARY_METRICS` in `report.ts`. To add a strategy: register it in `SimulationManager` and add its name to a preset or pass it with `--algos`.
