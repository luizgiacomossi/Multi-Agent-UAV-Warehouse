import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { RunRecord } from './runScenario';
import { Summary, summarize } from './stats';
import { BenchmarkPlan } from './scenarios';

/** Numeric per-run fields that are aggregated into the summary. */
export const SUMMARY_METRICS = [
  'planningMs',
  'makespan',
  'sumOfCosts',
  'scans',
  'palletCoverage',
  'collisionsDroneDrone',
  'collisionsDroneForklift',
  'lostDrones',
  'batteryDeaths',
  'strandedDrones',
  'energyConsumed',
  'distance',
  'cbsNodesExpanded',
  'cbsFallbacks',
] as const satisfies readonly (keyof RunRecord)[];

type SummaryMetric = typeof SUMMARY_METRICS[number];

const GROUP_KEYS = ['scale', 'gridSize', 'pallets', 'forklifts', 'drones', 'allocationMode', 'completionMode', 'algorithm'] as const;

/** Aggregated statistics of one algorithm on one scenario configuration (across repetitions). */
export interface GroupSummary {
  group: Pick<RunRecord, typeof GROUP_KEYS[number]>;
  runs: number;
  successRate: number;
  metrics: Partial<Record<SummaryMetric, Summary>>;
}

export function summarizeRecords(records: RunRecord[]): GroupSummary[] {
  const groups = new Map<string, RunRecord[]>();
  for (const record of records) {
    // Pallet/forklift counts can differ slightly per seed; group on the configured scale instead
    const key = GROUP_KEYS.filter(k => k !== 'pallets' && k !== 'forklifts').map(k => record[k]).join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(record);
  }

  return [...groups.values()].map(runs => {
    const succeeded = runs.filter(r => r.ok);
    const metrics: GroupSummary['metrics'] = {};
    for (const metric of SUMMARY_METRICS) {
      const values = succeeded.map(r => r[metric]).filter((v): v is number => typeof v === 'number');
      if (values.length > 0) metrics[metric] = summarize(values);
    }
    const first = runs[0];
    return {
      group: {
        scale: first.scale,
        gridSize: first.gridSize,
        pallets: Math.round(summarize(runs.map(r => r.pallets)).mean),
        forklifts: Math.round(summarize(runs.map(r => r.forklifts)).mean),
        drones: first.drones,
        allocationMode: first.allocationMode,
        completionMode: first.completionMode,
        algorithm: first.algorithm,
      },
      runs: runs.length,
      successRate: succeeded.length / runs.length,
      metrics,
    };
  });
}

// ─── Files ────────────────────────────────────────────────────────────────────

function toCsv(header: string[], rows: (string | number | boolean | undefined)[][]): string {
  const escape = (v: string | number | boolean | undefined) => {
    if (v === undefined || (typeof v === 'number' && Number.isNaN(v))) return '';
    const s = typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(4) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header, ...rows].map(row => row.map(escape).join(',')).join('\n') + '\n';
}

const RUN_COLUMNS: (keyof RunRecord)[] = [
  'scale', 'gridSize', 'pallets', 'forklifts', 'drones', 'allocationMode', 'completionMode',
  'repetition', 'seed', 'algorithm', 'ok', 'error', ...SUMMARY_METRICS,
];
const STAT_FIELDS: (keyof Summary)[] = ['mean', 'std', 'ci95', 'median', 'min', 'max'];

/** Writes runs.csv, summary.csv and summary.json into `outDir`. */
export function writeReports(outDir: string, plan: BenchmarkPlan, records: RunRecord[], summaries: GroupSummary[]): void {
  mkdirSync(outDir, { recursive: true });

  writeFileSync(join(outDir, 'runs.csv'), toCsv(RUN_COLUMNS, records.map(r => RUN_COLUMNS.map(c => r[c]))));

  const summaryHeader = [
    ...GROUP_KEYS, 'runs', 'successRate',
    ...SUMMARY_METRICS.flatMap(m => STAT_FIELDS.map(s => `${m}_${s}`)),
  ];
  const summaryRows = summaries.map(s => [
    ...GROUP_KEYS.map(k => s.group[k]), s.runs, s.successRate,
    ...SUMMARY_METRICS.flatMap(m => STAT_FIELDS.map(f => s.metrics[m]?.[f])),
  ]);
  writeFileSync(join(outDir, 'summary.csv'), toCsv(summaryHeader, summaryRows));

  writeFileSync(join(outDir, 'summary.json'), JSON.stringify({ plan, generatedAt: new Date().toISOString(), summaries }, null, 2));
}

// ─── Console ──────────────────────────────────────────────────────────────────

const fmt = (s: Summary | undefined, digits = 1) =>
  s ? `${s.mean.toFixed(digits)} ±${s.ci95.toFixed(digits)}` : '–';

/** Prints one comparison table per scenario configuration (algorithms as rows). */
export function printSummary(summaries: GroupSummary[]): void {
  const byConfig = new Map<string, GroupSummary[]>();
  for (const s of summaries) {
    const g = s.group;
    const key = `${g.scale} (${g.gridSize}³, ~${g.pallets} pallets, ${g.forklifts} forklifts) · ${g.drones} drones · ${g.allocationMode} · ${g.completionMode}`;
    if (!byConfig.has(key)) byConfig.set(key, []);
    byConfig.get(key)!.push(s);
  }

  for (const [config, rows] of byConfig) {
    console.log(`\n${config}`);
    console.table(Object.fromEntries(rows.map(s => [s.group.algorithm, {
      'ok %': Math.round(s.successRate * 100),
      'collisions': fmt(sumSummaries(s.metrics.collisionsDroneDrone, s.metrics.collisionsDroneForklift), 2),
      'stranded': fmt(s.metrics.strandedDrones, 2),
      'coverage %': s.metrics.palletCoverage ? (s.metrics.palletCoverage.mean * 100).toFixed(1) : '–',
      'makespan': fmt(s.metrics.makespan),
      'energy': fmt(s.metrics.energyConsumed),
      'plan ms': fmt(s.metrics.planningMs, 0),
    }])));
  }
}

/** Mean-only combination of two summaries (for display; CI of the sum is approximated). */
function sumSummaries(a?: Summary, b?: Summary): Summary | undefined {
  if (!a || !b) return a ?? b;
  return { ...a, mean: a.mean + b.mean, ci95: Math.sqrt(a.ci95 ** 2 + b.ci95 ** 2) };
}
