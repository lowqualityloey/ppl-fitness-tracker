import { describe, expect, it } from 'vitest';
import {
  HistoryViewShapeError,
  groupByDay,
  loadCoverage,
  parseHistoryPage,
  type HistoryEntry,
} from '../../../lib/views/history-view';
import type { SessionPage, SessionSummary } from '../../../lib/domain/sessions/types';

const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const DAY_ID = '55555555-5555-4555-8555-555555555555';

function summary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: SESSION_ID,
    routineDayId: DAY_ID,
    clientId: '99999999-9999-4999-8999-999999999999',
    status: 'completed',
    phase: 'post_workout',
    source: 'app',
    localDate: '2026-09-10',
    startedAt: new Date('2026-09-10T17:00:00.000Z'),
    completedAt: new Date('2026-09-10T17:52:00.000Z'),
    serverSeq: 14,
    updatedAt: new Date('2026-09-10T17:52:00.000Z'),
    ...overrides,
  };
}

function page(sessions: SessionSummary[], nextCursor: string | null = null): SessionPage {
  return { sessions, nextCursor };
}

function entry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: SESSION_ID,
    routineDayId: DAY_ID,
    status: 'completed',
    phase: 'post_workout',
    source: 'app',
    localDate: '2026-09-10',
    startedAt: '2026-09-10T17:00:00.000Z',
    completedAt: '2026-09-10T17:52:00.000Z',
    ...overrides,
  };
}

describe('parseHistoryPage', () => {
  it('carries only the fields the list renders', () => {
    const [row] = parseHistoryPage(page([summary()])).entries;

    // `clientId`, `serverSeq` and `updatedAt` all exist on the domain summary and none of them
    // belongs on a history row. Naming the survivors is what makes adding a field to the repository
    // a deliberate act here instead of a silent widening of what a page is allowed to read.
    expect(Object.keys(row!).sort()).toEqual([
      'completedAt',
      'id',
      'localDate',
      'phase',
      'routineDayId',
      'source',
      'startedAt',
      'status',
    ]);
  });

  it('coerces the repository\'s Date objects to ISO strings', () => {
    // `mapSessionSummary` hands back `Date` instances; a view that kept them would be a value type
    // that changes shape depending on whether the read came from SQL or from JSON.
    const [row] = parseHistoryPage(page([summary()])).entries;
    expect(row!.startedAt).toBe('2026-09-10T17:00:00.000Z');
    expect(typeof row!.completedAt).toBe('string');
  });

  it('keeps a session that never finished, with the phase it stopped in', () => {
    const [row] = parseHistoryPage(
      page([summary({ status: 'in_progress', phase: 'exercise', completedAt: null })]),
    ).entries;
    expect(row).toMatchObject({ status: 'in_progress', phase: 'exercise', completedAt: null });
  });

  it('names the offending path when a row does not match', () => {
    const bad = { ...summary(), localDate: 'last tuesday' };
    expect(() => parseHistoryPage(page([summary(), bad as SessionSummary]))).toThrow(
      HistoryViewShapeError,
    );
    expect(() => parseHistoryPage(page([bad as SessionSummary]))).toThrow(/sessions\.0\.localDate/);
  });

  it('passes the cursor through untouched, including "there are no more pages"', () => {
    // `null` is load-bearing: it is how the list knows to stop rendering an "older" link that
    // would loop back to a page it has already shown.
    expect(parseHistoryPage(page([summary()])).nextCursor).toBeNull();
    expect(parseHistoryPage(page([summary()], 'eyJsb2NhbERhdGUiOiIyMDI2LTA5LTA4In0')).nextCursor).toBe(
      'eyJsb2NhbERhdGUiOiIyMDI2LTA5LTA4In0',
    );
  });
});

describe('groupByDay', () => {
  it('folds same-day sessions into one group and keeps newest-first order', () => {
    const groups = groupByDay([
      entry({ id: SESSION_ID, localDate: '2026-09-10' }),
      entry({ id: '33333333-3333-4333-8333-333333333333', localDate: '2026-09-10' }),
      entry({ id: '44444444-4444-4444-8444-444444444444', localDate: '2026-09-08' }),
    ]);

    expect(groups.map((group) => group.date)).toEqual(['2026-09-10', '2026-09-08']);
    expect(groups[0]!.entries).toHaveLength(2);
  });

  it('does not merge two runs on the same date that are not adjacent', () => {
    // The repository orders by `(localDate, id)` descending, so same-day rows are adjacent. If a
    // future change sorted by something else, a `Map`-based grouping would quietly interleave the
    // days; this test is the reason that cannot happen unnoticed.
    const groups = groupByDay([
      entry({ localDate: '2026-09-10', id: SESSION_ID }),
      entry({ localDate: '2026-09-08', id: '33333333-3333-4333-8333-333333333333' }),
      entry({ localDate: '2026-09-10', id: '44444444-4444-4444-8444-444444444444' }),
    ]);
    expect(groups.map((group) => group.date)).toEqual(['2026-09-10', '2026-09-08', '2026-09-10']);
  });

  it('returns nothing for nothing, rather than an empty day', () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe('loadCoverage', () => {
  it('calls an all-null import "no load", which is not the same as zero', () => {
    const coverage = loadCoverage([
      { weightKg: null, reps: null },
      { weightKg: null, reps: null },
    ]);
    expect(coverage).toEqual({ total: 2, withLoad: 0 });
  });

  it('counts reps-only rows as recorded, because bodyweight work is still work', () => {
    expect(loadCoverage([{ weightKg: null, reps: 12 }])).toEqual({ total: 1, withLoad: 1 });
  });

  it('distinguishes "no sets" from "no load"', () => {
    // Two different empty states, and collapsing them would tell an athlete who opened a session
    // and never ticked a set that their equipment was at fault.
    expect(loadCoverage([])).toEqual({ total: 0, withLoad: 0 });
    expect(loadCoverage([{ weightKg: 60, reps: 5 }])).toEqual({ total: 1, withLoad: 1 });
  });
});
