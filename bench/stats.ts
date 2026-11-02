/** Descriptive statistics of a sample. */
export interface Summary {
  n: number;
  mean: number;
  std: number;
  /** Half-width of the normal-approximation 95% confidence interval of the mean. */
  ci95: number;
  median: number;
  min: number;
  max: number;
}

export function summarize(values: number[]): Summary {
  const n = values.length;
  if (n === 0) return { n: 0, mean: NaN, std: NaN, ci95: NaN, median: NaN, min: NaN, max: NaN };

  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((sum, v) => sum + v, 0) / n;
  // Sample standard deviation (n - 1)
  const std = n > 1 ? Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1)) : 0;
  const mid = Math.floor(n / 2);
  const median = n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  return { n, mean, std, ci95: 1.96 * std / Math.sqrt(n), median, min: sorted[0], max: sorted[n - 1] };
}

/** Result of a two-sided Wilcoxon signed-rank test on paired differences. */
export interface WilcoxonResult {
  /** Pairs with a non-zero difference (zero differences are dropped). */
  n: number;
  /** The smaller of the positive and negative rank sums. */
  statistic: number;
  /** Two-sided p-value; NaN when every difference is zero. */
  p: number;
  /** 'exact' (n ≤ 50) or 'normal' (normal approximation with tie correction, n > 50). */
  method: 'exact' | 'normal';
}

/**
 * Two-sided Wilcoxon signed-rank test of `differences` (b − a for each pair) against a zero median.
 * Zeros are dropped and tied magnitudes get their average rank, as in scipy.stats.wilcoxon. For up
 * to 50 pairs the p-value is exact: the null distribution is built from the actual ranks, so it
 * stays exact with ties. Beyond that it comes from the normal approximation with tie correction.
 */
export function wilcoxonSignedRank(differences: number[]): WilcoxonResult {
  const d = differences.filter(x => x !== 0);
  const n = d.length;
  if (n === 0) return { n: 0, statistic: 0, p: NaN, method: 'exact' };

  // Average ranks of |d|, and the sizes of the tie groups
  const order = d.map((x, i) => [Math.abs(x), i] as const).sort((a, b) => a[0] - b[0]);
  const ranks = new Array<number>(n);
  const tieSizes: number[] = [];
  for (let i = 0; i < n;) {
    let j = i;
    while (j + 1 < n && order[j + 1][0] === order[i][0]) j++;
    for (let k = i; k <= j; k++) ranks[order[k][1]] = (i + j) / 2 + 1;
    tieSizes.push(j - i + 1);
    i = j + 1;
  }
  const positive = d.reduce((sum, x, i) => sum + (x > 0 ? ranks[i] : 0), 0);
  const statistic = Math.min(positive, n * (n + 1) / 2 - positive);

  if (n <= 50) {
    // Exact null distribution: every sign pattern of the actual ranks is equally likely. Ranks are
    // doubled so that average ranks of ties (x.5) become integers.
    const doubled = ranks.map(r => Math.round(2 * r));
    const maxSum = doubled.reduce((a, b) => a + b, 0);
    let counts = new Array<number>(maxSum + 1).fill(0);
    counts[0] = 1;
    for (const r of doubled) {
      const next = [...counts];
      for (let s = r; s <= maxSum; s++) next[s] += counts[s - r];
      counts = next;
    }
    let below = 0;
    for (let s = 0; s <= Math.round(2 * statistic); s++) below += counts[s];
    return { n, statistic, p: Math.min(1, 2 * below / 2 ** n), method: 'exact' };
  }

  const mean = n * (n + 1) / 4;
  const variance = n * (n + 1) * (2 * n + 1) / 24 - tieSizes.reduce((sum, t) => sum + (t ** 3 - t), 0) / 48;
  const z = (statistic - mean) / Math.sqrt(variance);
  return { n, statistic, p: Math.min(1, 2 * normalCdf(-Math.abs(z))), method: 'normal' };
}

/** Standard normal CDF (Abramowitz and Stegun 7.1.26, absolute error below 1.5e-7). */
function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}
