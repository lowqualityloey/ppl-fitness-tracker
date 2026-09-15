/**
 * M4-19 (#108): the training-week presenters compute nothing and classify honestly.
 *
 * AC Scenario 2's negative control lives here: zero sessions in must produce the honest
 * empty state out — never a plausible zero-shaped lie. The streak table pins the anchor
 * rule (today else yesterday, consecutive backward, futures ignored).
 */
import { describe, expect, it } from 'vitest';

import {
  computeStreakDays,
  describeTrainingDay,
  describeTrainingWeek,
  type TrainingDayBucket,
} from '../../../lib/views/dashboard-view';
import { shiftIsoDate } from '../../../lib/domain/local-date';

function bucket(partial: Partial<TrainingDayBucket> & { localDate: string }): TrainingDayBucket {
  return { sessions: 0, volumeKg: 0, loadSets: 0, ...partial };
}

describe('shiftIsoDate', () => {
  it.each([
    ['2026-09-15', 0, '2026-09-15'],
    ['2026-09-15', -1, '2026-09-14'],
    ['2026-09-15', -6, '2026-09-09'],
    ['2026-09-01', -1, '2026-08-31'],
    ['2026-01-01', -1, '2025-12-31'],
    ['2026-09-15', 1, '2026-09-16'],
  ])('shiftIsoDate(%p, %i) === %p', (input, delta, expected) => {
    expect(shiftIsoDate(input, delta)).toBe(expected);
  });
});

describe('computeStreakDays', () => {
  it.each([
    { name: 'counts consecutive days ending today', dates: ['2026-09-15', '2026-09-14', '2026-09-13'], ref: '2026-09-15', expected: 3 },
    { name: 'yesterday keeps the streak alive', dates: ['2026-09-14', '2026-09-13'], ref: '2026-09-15', expected: 2 },
    { name: 'a gap ends the streak', dates: ['2026-09-15', '2026-09-13'], ref: '2026-09-15', expected: 1 },
    { name: 'last week alone is not a streak', dates: ['2026-09-08'], ref: '2026-09-15', expected: 0 },
    { name: 'no history is no streak', dates: [], ref: '2026-09-15', expected: 0 },
    { name: 'future sessions never extend a streak', dates: ['2026-09-16', '2026-09-15'], ref: '2026-09-15', expected: 1 },
    { name: 'unordered input still counts', dates: ['2026-09-13', '2026-09-15', '2026-09-14'], ref: '2026-09-15', expected: 3 },
  ])('$name', ({ dates, ref, expected }) => {
    expect(computeStreakDays(dates, ref)).toBe(expected);
  });
});

describe('describeTrainingDay', () => {
  it('rest on a sessionless day', () => {
    expect(describeTrainingDay(bucket({ localDate: '2026-09-15' }))).toEqual({
      kind: 'rest',
      localDate: '2026-09-15',
    });
  });

  it('coverage when sessions carry no load', () => {
    expect(describeTrainingDay(bucket({ localDate: '2026-09-15', sessions: 2 }))).toEqual({
      kind: 'coverage',
      localDate: '2026-09-15',
      sessions: 2,
    });
  });

  it('volume when load-carrying sets exist', () => {
    expect(
      describeTrainingDay(
        bucket({ localDate: '2026-09-15', sessions: 1, volumeKg: 600, loadSets: 2 }),
      ),
    ).toEqual({
      kind: 'volume',
      localDate: '2026-09-15',
      sessions: 1,
      volumeKg: 600,
    });
  });
});

describe('describeTrainingWeek', () => {
  const rest = (localDate: string): TrainingDayBucket => bucket({ localDate });

  it('empty for a sessionless week — the fabrication negative control', () => {
    const days = ['09-09', '09-10', '09-11', '09-12', '09-13', '09-14', '09-15'].map((suffix) =>
      rest(`2026-${suffix}`),
    );
    expect(describeTrainingWeek(days)).toEqual({ kind: 'empty' });
  });

  it('coverage for sessions without load', () => {
    const days = [
      rest('2026-09-09'),
      rest('2026-09-10'),
      rest('2026-09-11'),
      rest('2026-09-12'),
      rest('2026-09-13'),
      rest('2026-09-14'),
      bucket({ localDate: '2026-09-15', sessions: 1 }),
    ];
    expect(describeTrainingWeek(days)).toEqual({ kind: 'coverage', sessions: 1 });
  });

  it('loaded sums volume across days', () => {
    const days = [
      rest('2026-09-09'),
      rest('2026-09-10'),
      rest('2026-09-11'),
      rest('2026-09-12'),
      rest('2026-09-13'),
      bucket({ localDate: '2026-09-14', sessions: 1, volumeKg: 400, loadSets: 4 }),
      bucket({ localDate: '2026-09-15', sessions: 2, volumeKg: 600, loadSets: 6 }),
    ];
    expect(describeTrainingWeek(days)).toEqual({ kind: 'loaded', sessions: 3, volumeKg: 1000 });
  });
});
