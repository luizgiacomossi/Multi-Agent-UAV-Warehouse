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
