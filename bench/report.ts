import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { RunRecord } from './runScenario';
import { Summary, summarize, wilcoxonSignedRank } from './stats';
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
  'legEnergyRatio',
  'legsAboveGamma',
  'meanScanTime',
  'priorityScanTime',
  'stationVisits',
  'stationTicks',
  'minChargingSites',
  'cbsNodesExpanded',
  'cbsFallbacks',
] as const satisfies readonly (keyof RunRecord)[];

type SummaryMetric = typeof SUMMARY_METRICS[number];

const GROUP_KEYS = ['scale', 'gridSize', 'pallets', 'forklifts', 'drones', 'allocationMode', 'completionMode', 'chargingSites', 'maxAltitude', 'rackLevels', 'clusterRadius', 'maxClusterSize', 'chargeRate', 'drainMultiplier', 'algorithm'] as const;

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
        chargingSites: first.chargingSites,
        maxAltitude: first.maxAltitude,
        rackLevels: first.rackLevels,
        clusterRadius: first.clusterRadius,
        maxClusterSize: first.maxClusterSize,
        chargeRate: first.chargeRate,
        drainMultiplier: first.drainMultiplier,
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
  'chargingSites', 'stationPlacement', 'maxAltitude', 'rackLevels', 'clusterRadius', 'maxClusterSize', 'chargeRate', 'drainMultiplier', 'repetition', 'seed', 'algorithm', 'ok', 'error', ...SUMMARY_METRICS,
];
const STAT_FIELDS: (keyof Summary)[] = ['mean', 'std', 'ci95', 'median', 'min', 'max'];

/** Factors whose levels can be compared on the same scenarios (same seed, all else equal). */
const PAIRED_FACTORS = ['algorithm', 'allocationMode', 'chargingSites', 'maxAltitude', 'rackLevels', 'clusterRadius', 'maxClusterSize'] as const;
/** Metrics compared by the paired tests. */
const TESTED_METRICS = ['makespan', 'energyConsumed', 'sumOfCosts', 'priorityScanTime', 'planningMs'] as const;
/** Configuration columns that identify the comparison (pallet and forklift counts follow the scale). */
const CONTEXT_KEYS = GROUP_KEYS.filter(k => k !== 'pallets' && k !== 'forklifts');

/** A paired comparison of two levels of one factor on one configuration, for one metric. */
export interface PairedTest {
  factor: typeof PAIRED_FACTORS[number];
  context: Partial<Record<typeof CONTEXT_KEYS[number], RunRecord[typeof CONTEXT_KEYS[number]]>>;
  a: string;
  b: string;
  metric: typeof TESTED_METRICS[number];
  /** Paired runs (same seed) with the metric for both levels. */
  pairs: number;
  meanA: number;
  meanB: number;
  /** Median of b − a over the pairs. */
  medianDiff: number;
  /** Wilcoxon signed-rank test of b − a (pairs with a zero difference are dropped). */
  nonZero: number;
  statistic: number;
  p: number;
}

/**
 * Paired Wilcoxon signed-rank tests. For every factor that takes more than one level in the run,
 * runs are paired by seed with all other configuration equal (every level of a factor runs on the
 * same warehouse, see expandScenarios), and each pair of levels is tested on each metric.
 */
export function pairedTests(records: RunRecord[]): PairedTest[] {
  const ok = records.filter(r => r.ok);
  const tests: PairedTest[] = [];
  for (const factor of PAIRED_FACTORS) {
    const levels = [...new Set(ok.map(r => String(r[factor])))];
    if (levels.length < 2) continue;
    const contextKeys = CONTEXT_KEYS.filter(k => k !== factor);
    const groups = new Map<string, RunRecord[]>();
    for (const r of ok) {
      const key = contextKeys.map(k => r[k]).join('|');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
    for (const runs of groups.values()) {
      const bySeed = new Map<string, Map<number, RunRecord>>();
      for (const r of runs) {
        const level = String(r[factor]);
        if (!bySeed.has(level)) bySeed.set(level, new Map());
        bySeed.get(level)!.set(r.seed, r);
      }
      const present = levels.filter(l => bySeed.has(l));
      const context = Object.fromEntries(contextKeys.map(k => [k, runs[0][k]]));
      for (let i = 0; i < present.length; i++) {
        for (let j = i + 1; j < present.length; j++) {
          const [a, b] = [present[i], present[j]];
          for (const metric of TESTED_METRICS) {
            const pairs: [number, number][] = [];
            for (const [seed, ra] of bySeed.get(a)!) {
              const rb = bySeed.get(b)!.get(seed);
              const va = ra[metric], vb = rb?.[metric];
              if (typeof va === 'number' && typeof vb === 'number') pairs.push([va, vb]);
            }
            if (pairs.length === 0) continue;
            const diffs = pairs.map(([x, y]) => y - x);
            const test = wilcoxonSignedRank(diffs);
            tests.push({
              factor, context, a, b, metric, pairs: pairs.length,
              meanA: summarize(pairs.map(p => p[0])).mean,
              meanB: summarize(pairs.map(p => p[1])).mean,
              medianDiff: summarize(diffs).median,
              nonZero: test.n, statistic: test.statistic, p: test.p,
            });
          }
        }
      }
    }
  }
  return tests;
}

/** Writes runs.csv, summary.csv, tests.csv and summary.json into `outDir`. */
export function writeReports(outDir: string, plan: BenchmarkPlan, records: RunRecord[], summaries: GroupSummary[], workers = 1): void {
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

  const tests = pairedTests(records);
  const testHeader = ['factor', ...CONTEXT_KEYS, 'a', 'b', 'metric', 'pairs', 'meanA', 'meanB', 'medianDiff', 'nonZero', 'statistic', 'p'];
  writeFileSync(join(outDir, 'tests.csv'), toCsv(testHeader, tests.map(t => [
    t.factor, ...CONTEXT_KEYS.map(k => k === t.factor ? '' : t.context[k]), t.a, t.b, t.metric,
    t.pairs, t.meanA, t.meanB, t.medianDiff, t.nonZero, t.statistic,
    Number.isNaN(t.p) ? undefined : t.p < 1e-4 ? t.p.toExponential(2) : t.p.toFixed(4),
  ])));

  writeFileSync(join(outDir, 'summary.json'), JSON.stringify({ plan, generatedAt: new Date().toISOString(), environment: { ...runEnvironment(), workers }, summaries }, null, 2));
}

/** Code version and runtime of a benchmark run, so every result can be traced back to a commit. */
export function runEnvironment(): { commit: string; dirty: boolean; node: string } {
  const git = (args: string) => {
    try {
      return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      return '';
    }
  };
  return { commit: git('rev-parse HEAD') || 'unknown', dirty: git('status --porcelain --untracked-files=no') !== '', node: process.version };
}

// ─── Console ──────────────────────────────────────────────────────────────────

const fmt = (s: Summary | undefined, digits = 1) =>
  s ? `${s.mean.toFixed(digits)} ±${s.ci95.toFixed(digits)}` : '–';

/** Prints one comparison table per scenario configuration (algorithms as rows). */
export function printSummary(summaries: GroupSummary[]): void {
  const byConfig = new Map<string, GroupSummary[]>();
  for (const s of summaries) {
    const g = s.group;
    const key = `${g.scale} (${g.gridSize}³, ~${g.pallets} pallets, ${g.forklifts} forklifts) · ${g.drones} drones · ${g.allocationMode}${g.allocationMode === 'Cluster' ? ` (r ${g.clusterRadius}, ≤ ${g.maxClusterSize})` : ''} · ${g.completionMode} · ${g.chargingSites === 1 ? 'base only' : `base + ${g.chargingSites - 1} station(s)`} · charge ${Number.isFinite(g.chargeRate) ? `${g.chargeRate}%/tick` : 'instant'}${g.maxAltitude < g.gridSize ? ` · ceiling y ≤ ${g.maxAltitude}` : ''} · racks ≤ ${g.rackLevels} levels${g.drainMultiplier !== 1 ? ` · drain ×${g.drainMultiplier}` : ''}`;
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
