/**
 * Strategy benchmark: runs every selected planning strategy on identical, seeded warehouse
 * scenarios across scales and swarm sizes, then writes per-run and aggregated statistics.
 *
 *   npm run bench                              # "quick" preset
 *   npm run bench -- --preset standard
 *   npm run bench -- --preset full --runs 20 --seed 7
 *   npm run bench -- --algos Cooperative,CBS --grids 12,24 --drones 4,8 --alloc Cluster
 *   npm run bench -- --preset full --workers auto   # scenarios spread over child processes
 *
 * Output: bench-results/<preset>-<timestamp>/{runs.csv, summary.csv, tests.csv, summary.json}
 */
import { join } from 'path';
import { BenchmarkPlan, PRESETS, SCALES, AllocationMode, expandScenarios } from './scenarios';
import { RunRecord } from './runScenario';
import { defaultWorkers, runScenarios } from './parallel';
import { printSummary, summarizeRecords, writeReports } from './report';
import { MissionCompletionMode } from '../types';

interface CliOptions {
  preset: string;
  overrides: Partial<BenchmarkPlan>;
  outDir?: string;
  workers: number;
}

const HELP = `Usage: npm run bench -- [options]
  --preset <name>     ${Object.keys(PRESETS).join(' | ')} (default: quick)
  --runs <n>          repetitions per scenario
  --seed <n>          base seed (scenario seeds are derived from it)
  --algos <a,b>       strategies, e.g. Naive,Cooperative,"Energy Saver",CBS
  --grids <n,n>       grid sizes, from: ${Object.values(SCALES).map(s => s.gridSize).join(', ')}
  --drones <n,n>      swarm sizes
  --alloc <m,m>       1-to-1 (Hungarian) | Cluster | Greedy | Nearest | Random
  --completion <m,m>  count | all-pallets
  --missions <n>      missions per drone (count mode)
  --sites <n,n>       charging sites incl. the base (1 = base only; extra sites are one-drone stations)
  --stations <p>      station placement: spread (over the map) | coverage (for the battery)
  --altitude <n,n>    flight ceilings, highest cell y a drone may use (default: the grid size)
  --rack-levels <n,n> maximum pallets per rack column (default: 8)
  --cluster-radius <n,n>  cluster radii (Cluster allocation only, default 5)
  --cluster-size <n,n>    maximum pallets per cluster (Cluster allocation only, default 3)
  --charge-rate <r>   charging speed in % of capacity per tick, or "instant"
  --battery <n>       battery capacity per drone
  --drain <x>         battery drain multiplier (1 = nominal β_fly / β_hover)
  --no-return         do not return to the base between tasks (lets drones use charging stations)
  --workers <n|auto>  scenarios run in parallel child processes (default 1; auto = cores - 1).
                      Mission metrics are identical for any count, planning time is not
  --out <dir>         output directory`;

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { preset: 'quick', overrides: {}, workers: 1 };
  const list = (v: string) => v.split(',').map(s => s.trim()).filter(Boolean);
  const numbers = (v: string) => list(v).map(Number);

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    const needValue = () => {
      if (value === undefined) throw new Error(`Missing value for ${flag}`);
      i++;
      return value;
    };

    switch (flag) {
      case '--preset': options.preset = needValue(); break;
      case '--runs': options.overrides.repetitions = Number(needValue()); break;
      case '--seed': options.overrides.baseSeed = Number(needValue()); break;
      case '--algos': options.overrides.algorithms = list(needValue()); break;
      case '--drones': options.overrides.droneCounts = numbers(needValue()); break;
      case '--missions': options.overrides.missionsPerDrone = Number(needValue()); break;
      case '--alloc': options.overrides.allocationModes = list(needValue()) as AllocationMode[]; break;
      case '--completion': options.overrides.completionModes = list(needValue()) as MissionCompletionMode[]; break;
      case '--sites': options.overrides.chargingSites = numbers(needValue()); break;
      case '--stations': {
        const placement = needValue();
        if (placement !== 'spread' && placement !== 'coverage') throw new Error(`--stations needs spread or coverage, got ${placement}`);
        options.overrides.stationPlacement = placement;
        break;
      }
      case '--altitude': options.overrides.maxAltitudes = numbers(needValue()); break;
      case '--rack-levels': options.overrides.rackLevels = numbers(needValue()); break;
      case '--cluster-radius': options.overrides.clusterRadii = numbers(needValue()); break;
      case '--cluster-size': options.overrides.clusterSizes = numbers(needValue()); break;
      case '--charge-rate': {
        const rate = needValue();
        options.overrides.chargeRate = rate === 'instant' ? Infinity : Number(rate);
        break;
      }
      case '--no-return': options.overrides.roundTrip = false; break;
      case '--battery': options.overrides.batteryCapacity = Number(needValue()); break;
      case '--drain': options.overrides.drainMultiplier = Number(needValue()); break;
      case '--grids': {
        options.overrides.scales = numbers(needValue()).map(size => {
          const scale = Object.values(SCALES).find(s => s.gridSize === size);
          if (!scale) throw new Error(`No warehouse scale for grid ${size}`);
          return scale;
        });
        break;
      }
      case '--out': options.outDir = needValue(); break;
      case '--workers': {
        const workers = needValue();
        options.workers = workers === 'auto' ? defaultWorkers() : Number(workers);
        if (!Number.isInteger(options.workers) || options.workers < 1) throw new Error(`--workers needs a positive integer or "auto", got ${workers}`);
        break;
      }
      case '--help': case '-h': console.log(HELP); process.exit(0);
      default: throw new Error(`Unknown option ${flag}\n\n${HELP}`);
    }
  }
  return options;
}

function resolvePlan({ preset, overrides }: CliOptions): BenchmarkPlan {
  const base = PRESETS[preset];
  if (!base) throw new Error(`Unknown preset "${preset}". Available: ${Object.keys(PRESETS).join(', ')}`);
  return { ...base, ...overrides };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const plan = resolvePlan(options);
  const scenarios = expandScenarios(plan);
  const totalRuns = scenarios.length * plan.algorithms.length;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = options.outDir ?? join('bench-results', `${plan.name}-${stamp}`);

  console.log(`Benchmark "${plan.name}": ${scenarios.length} scenarios × ${plan.algorithms.length} strategies = ${totalRuns} runs`);
  console.log(`Strategies: ${plan.algorithms.join(', ')} · scales: ${plan.scales.map(s => s.label).join(', ')} · drones: ${plan.droneCounts.join(', ')}`);
  if (options.workers > 1) console.log(`Workers: ${options.workers} (planning times share the machine, use 1 worker to measure them)`);

  const started = performance.now();
  const records: RunRecord[] = await runScenarios(scenarios, plan, options.workers, scenariosDone => {
    const done = scenariosDone * plan.algorithms.length;
    const elapsed = (performance.now() - started) / 1000;
    process.stdout.write(`\r  ${done}/${totalRuns} runs · ${elapsed.toFixed(0)}s elapsed · ETA ${(elapsed / done * (totalRuns - done)).toFixed(0)}s   `);
  });
  process.stdout.write('\n');

  const failures = records.filter(r => !r.ok);
  if (failures.length > 0) {
    console.warn(`${failures.length} run(s) failed: ${[...new Set(failures.map(f => `${f.algorithm}: ${f.error}`))].join('; ')}`);
  }

  const summaries = summarizeRecords(records);
  printSummary(summaries);
  writeReports(outDir, plan, records, summaries, options.workers);
  console.log(`\nResults written to ${outDir}/ (runs.csv, summary.csv, tests.csv, summary.json)`);
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
