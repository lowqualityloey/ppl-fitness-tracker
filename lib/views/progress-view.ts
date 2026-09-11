/**
 * The progress view boundary (M3-08, #65).
 *
 * `GET /api/progress/:exerciseSlug` already returns the trendline **as computed numbers**
 * (`E1rmPoint = { date, e1rm, sessionId }`), and the card's invariant is that this screen renders
 * those values rather than deriving its own: two implementations of the Epley formula is how a
 * chart starts disagreeing with a personal record, and the disagreement would be settled by an
 * athlete's eyeballs.
 *
 * So this module does the one kind of calculation that is safe to do here — **scaling a value into
 * a pixel coordinate** — and nothing else. It is structurally incapable of recomputing e1RM: the
 * input has no weight and no reps field to recompute *from*, which is a stronger guarantee than a
 * comment asking nobody to try. A test asserts that field set exactly, so adding `weightKg` to this
 * seam is a deliberate change rather than an accident someone falls into.
 *
 * The geometry is a separate module from the chart component for the same reason the sync engine is
 * separate from the runner: vitest runs in `environment: 'node'` with no DOM, so anything that
 * needs an element can only be tested by Playwright. Coordinates are not that.
 */

import type { E1rmPoint, PersonalRecord } from '../../lib/contracts/progress';

export interface ChartSize {
  readonly width: number;
  readonly height: number;
  /** Padding inside the box, so the stroke at the extremes is not clipped by the viewport. */
  readonly padding: number;
}

export interface ChartPoint {
  /** Pixel coordinates inside `size`, y measured from the top of the SVG box. */
  readonly x: number;
  readonly y: number;
  /** The value as displayed (already unit-converted by the caller — see `toDisplayPoints`). */
  readonly value: number;
  readonly date: string;
  readonly sessionId: string;
}

export interface ChartGeometry {
  readonly points: ChartPoint[];
  readonly path: string;
  readonly size: ChartSize;
  /** Axis bounds, exposed so the label text and the drawing cannot disagree about the scale. */
  readonly yMin: number;
  readonly yMax: number;
}

/**
 * Scale points into an SVG polyline.
 *
 * X is positioned by **index, not by date**: a timeline axis would spend its horizontal space on
 * the athlete's days off, so a three-session week and a rest month would render the same trend as
 * visually different. That is a presentation choice with a consequence, so it is stated here and
 * the table beside the chart carries the real dates.
 *
 * The y scale is padded by 5 % of the range so a single-point or flat series still has a
 * denominator: `yMax === yMin` would otherwise divide by zero and put every point at NaN, which SVG
 * renders as *nothing at all* — a chart that silently disappears is the worst possible failure for a
 * screen whose purpose is "is this going up".
 */
export function buildChartGeometry(
  points: readonly { date: string; value: number; sessionId: string }[],
  size: ChartSize,
): ChartGeometry {
  const values = points.map((point) => point.value);
  const rawMin = values.length ? Math.min(...values) : 0;
  const rawMax = values.length ? Math.max(...values) : 0;
  const spread = rawMax - rawMin;
  const pad = spread === 0 ? Math.max(rawMax * 0.05, 1) : spread * 0.05;
  const yMin = rawMin - pad;
  const yMax = rawMax + pad;
  const range = yMax - yMin;

  const inner = {
    width: size.width - size.padding * 2,
    height: size.height - size.padding * 2,
  };
  const stepX = points.length > 1 ? inner.width / (points.length - 1) : 0;

  const charted: ChartPoint[] = points.map((point, index) => ({
    x: size.padding + (points.length > 1 ? index * stepX : inner.width / 2),
    // SVG's y axis grows downward, so "higher estimate" means a smaller coordinate.
    y: size.padding + inner.height - ((point.value - yMin) / range) * inner.height,
    value: point.value,
    date: point.date,
    sessionId: point.sessionId,
  }));

  return {
    points: charted,
    path: charted.map((point) => `${round(point.x)},${round(point.y)}`).join(' '),
    size,
    yMin: round(yMin),
    yMax: round(yMax),
  };
}

/**
 * One decimal place on the canvas, full precision in the table.
 *
 * Sub-pixel coordinates are invisible here and a `y` value with six decimals in a `points`
 * attribute makes the DOM unreadable during a Playwright failure, which is exactly when someone
 * reads it.
 */
function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Turn the endpoint's kg values into the unit the athlete asked to see.
 *
 * This is the *only* place a unit conversion may happen on this screen, and it happens before
 * geometry: a chart whose line is plotted in kg while its axis labels say lb is not a units bug
 * someone will find, it is a units bug that will be believed. The stored value stays canonical
 * either way (ADR-0005) — a `preferred_unit` change repaints, it does not migrate.
 */
export function toDisplayPoints(
  trendline: readonly E1rmPoint[],
  convert: (kg: number) => number,
): { date: string; value: number; sessionId: string }[] {
  return trendline.map((point) => ({
    date: point.date,
    value: convert(point.e1rm),
    sessionId: point.sessionId,
  }));
}

export interface TrendSummary {
  readonly sessions: number;
  readonly first: E1rmPoint | null;
  readonly latest: E1rmPoint | null;
  /** The highest point in the series, which is not necessarily the most recent one. */
  readonly best: E1rmPoint | null;
}

/**
 * The numbers a reader needs when the picture is not available to them.
 *
 * G-M3-6 forbids chart-only insight, and this is the non-graphical form of the same array: count,
 * first, latest, best. Note what is *not* here — no "percent change", no slope, no "trend ↑". Those
 * would be new claims built on the endpoint's values, and with two or three sessions they are
 * arithmetic noise dressed as progress. If the product wants them, they belong in the progression
 * engine next to `calculateE1rm`, tested against the same fixtures the PRs use.
 */
export function summarizeTrendline(trendline: readonly E1rmPoint[]): TrendSummary {
  if (trendline.length === 0) {
    return { sessions: 0, first: null, latest: null, best: null };
  }
  let best = trendline[0]!;
  for (const point of trendline) {
    if (point.e1rm > best.e1rm) best = point;
  }
  return {
    sessions: trendline.length,
    first: trendline[0]!,
    latest: trendline.at(-1)!,
    best,
  };
}

/** The PR rows, newest achievement first — no sorting, no aggregation, same array in. */
export function orderPersonalRecords(records: readonly PersonalRecord[]): PersonalRecord[] {
  return [...records].sort((a, b) => Date.parse(b.achievedAt) - Date.parse(a.achievedAt));
}
