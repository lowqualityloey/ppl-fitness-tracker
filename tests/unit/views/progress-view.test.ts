import { describe, expect, it } from 'vitest';
import {
  buildChartGeometry,
  orderPersonalRecords,
  summarizeTrendline,
  toDisplayPoints,
  type ChartSize,
} from '../../../lib/views/progress-view';
import { E1rmPointSchema, PersonalRecordSchema } from '../../../lib/contracts/progress';
import type { E1rmPoint, PersonalRecord } from '../../../lib/contracts/progress';

const SIZE: ChartSize = { width: 320, height: 160, padding: 8 };
const SESSION = '22222222-2222-4222-8222-222222222222';

function point(date: string, e1rm: number, sessionId = SESSION): E1rmPoint {
  return { date, e1rm, sessionId };
}

function display(points: readonly E1rmPoint[]) {
  return toDisplayPoints(points, (kg) => kg);
}

describe('buildChartGeometry', () => {
  it('plots a heavier lift higher on the canvas', () => {
    // The direction check that catches the classic SVG inversion: forgetting that y grows downward
    // renders every strength chart as a decline, and the picture still looks like a picture.
    const geometry = buildChartGeometry(display([point('2026-09-01', 80), point('2026-09-02', 100)]), SIZE);
    expect(geometry.points[1]!.y).toBeLessThan(geometry.points[0]!.y);
  });

  it('spreads the series by index, not by calendar distance', () => {
    const close = buildChartGeometry(display([point('2026-09-01', 80), point('2026-09-02', 90)]), SIZE);
    const far = buildChartGeometry(display([point('2026-01-01', 80), point('2026-09-02', 90)]), SIZE);
    expect(close.points[1]!.x - close.points[0]!.x).toBe(far.points[1]!.x - far.points[0]!.x);
  });

  it('never divides by zero when every session weighs the same', () => {
    const geometry = buildChartGeometry(display([point('2026-09-01', 100), point('2026-09-02', 100)]), SIZE);
    // A flat series is the common case for someone who has hit a plateau, and the naive scale is
    // `(value - min) / (max - min)`. NaN in a `points` attribute draws nothing at all: the chart
    // would vanish on the screen whose entire job is to show a trend.
    for (const p of geometry.points) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
    expect(geometry.path).not.toContain('NaN');
  });

  it('keeps a single point inside the box instead of losing it at the edge', () => {
    const geometry = buildChartGeometry(display([point('2026-09-01', 100)]), SIZE);
    const [only] = geometry.points;
    expect(geometry.points).toHaveLength(1);
    expect(only!.x).toBe(SIZE.width / 2);
    expect(only!.y).toBeGreaterThan(SIZE.padding);
    expect(only!.y).toBeLessThan(SIZE.height - SIZE.padding);
  });

  it('produces a polyline whose every vertex has a matching table row', () => {
    // Task 3's "assert both derive from one source array": the geometry is a pure function of the
    // endpoint's array, so equality of length and of the values carried on each vertex is the
    // proof there is no second list of points somewhere.
    const points = [point('2026-09-01', 80), point('2026-09-05', 85), point('2026-09-09', 82)];
    const geometry = buildChartGeometry(display(points), SIZE);
    expect(geometry.points.map((p) => p.value)).toEqual([80, 85, 82]);
    expect(geometry.path.split(' ')).toHaveLength(points.length);
    expect(geometry.points.every((p) => p.x >= SIZE.padding && p.x <= SIZE.width - SIZE.padding)).toBe(true);
  });

  it('carries nothing the client could recompute e1RM from', () => {
    // The invariant is "the client must not recompute e1RM", and the strongest form of that is a
    // seam with no weight and no reps to recompute it *with*. `.strict()` is what makes this a
    // compile-and-test-time fact rather than a comment: adding `weightKg` to the trendline payload
    // would break the endpoint's own contract first.
    expect(
      E1rmPointSchema.safeParse({ date: '2026-09-01', e1rm: 100, sessionId: SESSION, weightKg: 120, reps: 8 })
        .success,
    ).toBe(false);
    expect(Object.keys(buildChartGeometry(display([point('2026-09-01', 100)]), SIZE).points[0]!).sort()).toEqual([
      'date',
      'sessionId',
      'value',
      'x',
      'y',
    ]);
  });

  it('returns an empty path for no data, which is what renders the empty state', () => {
    const geometry = buildChartGeometry([], SIZE);
    expect(geometry.points).toEqual([]);
    expect(geometry.path).toBe('');
  });
});

describe('toDisplayPoints', () => {
  it('converts before geometry so the axis and the line cannot disagree', () => {
    const kg = [point('2026-09-01', 100)];
    const lb = toDisplayPoints(kg, (value) => Math.round(value * 2.20462));
    expect(display(kg)[0]!.value).toBe(100);
    expect(lb[0]!.value).toBe(220);
    // The dates and session ids ride along unchanged: a unit change repaints, it does not re-key.
    expect(lb[0]!.date).toBe('2026-09-01');
    expect(lb[0]!.sessionId).toBe(SESSION);
  });
});

describe('summarizeTrendline', () => {
  it('reports the highest session as best when the latest one is lower', () => {
    const summary = summarizeTrendline([
      point('2026-09-01', 80),
      point('2026-09-05', 105),
      point('2026-09-09', 92),
    ]);
    // `best` must not be an alias for `latest`: deload weeks, missed sessions, and a bad night's
    // sleep all make the most recent number smaller than the record, and a summary that conflated
    // them would tell someone their strength had fallen when it had not.
    expect(summary.best!.e1rm).toBe(105);
    expect(summary.latest!.e1rm).toBe(92);
    expect(summary.first!.e1rm).toBe(80);
    expect(summary.sessions).toBe(3);
  });

  it('says so when there is nothing to summarise', () => {
    expect(summarizeTrendline([])).toEqual({ sessions: 0, first: null, latest: null, best: null });
  });

  it('counts a one-session history honestly', () => {
    const summary = summarizeTrendline([point('2026-09-01', 80)]);
    expect(summary.first).toEqual(summary.latest);
    expect(summary.sessions).toBe(1);
  });
});

describe('orderPersonalRecords', () => {

  function record(achievedAt: string, bestE1rm: number, sessionId = SESSION): PersonalRecord {
    return { achievedAt, bestE1rm, sessionId };
  }

  it('puts the most recent achievement first without mutating its input', () => {
    const input = [record('2026-01-01T00:00:00.000Z', 90), record('2026-09-01T00:00:00.000Z', 105)];
    const ordered = orderPersonalRecords(input);
    expect(ordered.map((r) => r.bestE1rm)).toEqual([105, 90]);
    expect(input[0]!.bestE1rm).toBe(90);
  });

  it('keeps a record that has no session behind it', () => {
    // `sessionId` is nullable in storage: a PR can come from an imported legacy set that has no
    // corresponding workout row. Dropping those rows would hide a personal record from the person
    // who earned it, and the card's PR requirement is about the number, not the link.
    expect(
      PersonalRecordSchema.safeParse({
        bestE1rm: 100,
        achievedAt: '2026-09-01T00:00:00.000Z',
        sessionId: null,
      }).success,
    ).toBe(true);
    expect(orderPersonalRecords([record('2026-09-01T00:00:00.000Z', 100, null as unknown as string)])).toHaveLength(1);
  });
});
