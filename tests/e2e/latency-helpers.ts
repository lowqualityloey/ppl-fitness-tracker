/**
 * Shared latency-statistics helpers for the e2e performance gates.
 *
 * The percentile is nearest-rank, identical to the three copies this file replaced in
 * `sla` / `sync-latency` / `session-runner`. Nearest-rank has a documented degeneracy: for
 * n ≤ 19, `ceil(0.95·n) − 1 = n − 1`, so the 95th percentile *is* the largest observation.
 * That means a single slow tap can decide the whole gate — exactly the #121 defect on G-M3-2,
 * where a run with median 15.3 ms went red at p95 66.1 ms because 66.1 was the maximum of
 * 17 samples.
 *
 * The guard against trusting the label is `aboveP95`: how many samples are strictly greater
 * than `p95`. When it is 0 the "p95" equals the maximum and the statistic is meaningless; a
 * gate must not pass on it. We deliberately do NOT relabel the percentile (e.g. switch to an
 * interpolating method) to paper over the degeneracy — that would be moving the measurement.
 * Instead the *caller* pins a sample count large enough that `aboveP95 > 0` holds by
 * construction (#121: fix the denominator, not the statistic).
 */
export interface LatencySummary {
  n: number;
  median: number;
  p95: number;
  max: number;
  /** Count of samples strictly greater than `p95`. 0 means p95 collapsed to the maximum. */
  aboveP95: number;
  /** true when `p95 === max`, i.e. the percentile is decided by a single observation. */
  degenerate: boolean;
}

export function percentile(sortedAscending: number[], p: number): number {
  if (sortedAscending.length === 0) return Number.NaN;
  const index = Math.ceil((p / 100) * sortedAscending.length) - 1;
  return sortedAscending[Math.max(0, Math.min(index, sortedAscending.length - 1))]!;
}

export function latencySummary(samples: number[]): LatencySummary {
  const sorted = [...samples].sort((a, b) => a - b);
  const median = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);
  const max = sorted[sorted.length - 1] ?? Number.NaN;
  const aboveP95 = sorted.filter((s) => s > p95).length;
  return { n: sorted.length, median, p95, max, aboveP95, degenerate: aboveP95 === 0 };
}
