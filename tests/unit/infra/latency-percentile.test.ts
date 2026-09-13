import { describe, expect, it } from 'vitest';
import { latencySummary, percentile } from '../../e2e/latency-helpers.js';

/**
 * #121 — G-M3-2's p95 was decided by a single slow tap because the nearest-rank percentile
 * collapses to the maximum for any n ≤ 19. These tests pin that property and prove the
 * degeneracy guard (`aboveP95 === 0`) catches it, per STATE §4 item 16 (a control is not real
 * until it has been watched failing on a deliberate breakage — the guard below was confirmed to
 * go red when `degenerate` was forced false, then restored).
 */
describe('latency percentile degeneracy (#121)', () => {
  it('documents the bug: nearest-rank p95 equals the max at n=17', () => {
    // 16 fast taps + one slow tap, mirroring PR #120's red CI run (median 15.3 ms, p95 66.1 ms).
    const samples = [15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 66.1];
    const sorted = [...samples].sort((a, b) => a - b);
    expect(percentile(sorted, 95)).toBe(66.1);
    expect(percentile(sorted, 95)).toBe(sorted[sorted.length - 1]);
  });

  it('flags the degenerate case: aboveP95 is 0 when p95 is the maximum', () => {
    const samples = [15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 66.1];
    const s = latencySummary(samples);
    expect(s.n).toBe(17);
    expect(s.p95).toBe(s.max);
    expect(s.aboveP95).toBe(0);
    expect(s.degenerate).toBe(true);
  });

  it('does NOT flag a healthy large sample: aboveP95 > 0 and p95 < the lone outlier', () => {
    const samples = Array.from({ length: 99 }, () => 15).concat(66.1);
    const s = latencySummary(samples);
    expect(s.n).toBe(100);
    expect(s.aboveP95).toBeGreaterThan(0);
    expect(s.degenerate).toBe(false);
    // p95 is the 95th value, not the single slow tap.
    expect(s.p95).toBeLessThan(66.1);
  });

  it('a pinned denominator (n≥60) keeps the gate from being decided by one tap', () => {
    // The smallest n at which a single outlier is only one of several samples above p95.
    const samples = Array.from({ length: 59 }, () => 15).concat(66.1);
    const s = latencySummary(samples);
    expect(s.n).toBe(60);
    expect(s.aboveP95).toBeGreaterThan(0);
    expect(s.degenerate).toBe(false);
  });
});
