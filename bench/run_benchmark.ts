/**
 * Strategy benchmark: runs every selected planning strategy on identical, seeded warehouse
 * scenarios across scales and swarm sizes, then writes per-run and aggregated statistics.
 *
 *   npm run bench                              # "quick" preset
 *   npm run bench -- --preset standard
 *   npm run bench -- --preset full --runs 20 --seed 7
 *   npm run bench -- --algos Cooperative,CBS --grids 12,24 --drones 4,8 --alloc Cluster
 *
 * Output: bench-results/<preset>-<timestamp>/{runs.csv, summary.csv, summary.json}
 */
import { join } from 'path';
import { BenchmarkPlan, PRESETS, SCALES, AllocationMode, expandScenarios } from './scenarios';
import { RunRecord, runScenario } from './runScenario';
import { printSummary, summarizeRecords, writeReports } from './report';
import { MissionCompletionMode } from '../types';

interface CliOptions {
  preset: string;
  overrides: Partial<BenchmarkPlan>;
  outDir?: string;
}

const HELP = `Usage: npm run bench -- [options]
  --preset <name>     ${Object.keys(PRESETS).join(' | ')} (default: quick)
  --runs <n>          repetitions per scenario
  --seed <n>          base seed (scenario seeds are derived from it)
  --algos <a,b>       strategies, e.g. Naive,Cooperative,"Energy Saver",CBS
  --grids <n,n>       grid sizes, from: ${Object.values(SCALES).map(s => s.gridSize).join(', ')}
  --drones <n,n>      swarm sizes
  --alloc <m,m>       1-to-1 | Cluster
  --completion <m,m>  count | all-pallets
  --missions <n>      missions per drone (count mode)
  --out <dir>         output directory`;

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { preset: 'quick', overrides: {} };
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
      case '--grids': {
        options.overrides.scales = numbers(needValue()).map(size => {
          const scale = Object.values(SCALES).find(s => s.gridSize === size);
          if (!scale) throw new Error(`No warehouse scale for grid ${size}`);
          return scale;
        });
        break;
      }
      case '--out': options.outDir = needValue(); break;
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

  const records: RunRecord[] = [];
  const started = performance.now();
  for (const [index, scenario] of scenarios.entries()) {
    records.push(...await runScenario(scenario, plan));
    const done = (index + 1) * plan.algorithms.length;
    const elapsed = (performance.now() - started) / 1000;
    process.stdout.write(`\r  ${done}/${totalRuns} runs · ${elapsed.toFixed(0)}s elapsed · ETA ${(elapsed / done * (totalRuns - done)).toFixed(0)}s   `);
  }
  process.stdout.write('\n');

  const failures = records.filter(r => !r.ok);
  if (failures.length > 0) {
    console.warn(`${failures.length} run(s) failed: ${[...new Set(failures.map(f => `${f.algorithm}: ${f.error}`))].join('; ')}`);
  }

  const summaries = summarizeRecords(records);
  printSummary(summaries);
  writeReports(outDir, plan, records, summaries);
  console.log(`\nResults written to ${outDir}/ (runs.csv, summary.csv, summary.json)`);
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
