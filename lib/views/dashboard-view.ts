/**
 * M4-19 (#108): pure presenters for the dashboard's training week.
 *
 * The one rule this file exists to enforce: every number here traces to completed-session
 * rows, never to a schedule or a random generator (handoff §3.4 bullet 3 — the legacy
 * dashboard derived "history" from `getDay()` and `Math.random()`). The repository hands
 * over counted rows; these functions decide only how a counted row *reads*.
 *
 * Unit-tested in `tests/unit/views/dashboard-view.test.ts`, including the negative
 * control: zero sessions renders the honest empty state, not a plausible zero-shaped lie.
 */

import { shiftIsoDate } from '../domain/local-date';

/** One counted day. `volumeKg` is canonical kg (ADR-0005); display converts, never this. */
export interface TrainingDayBucket {
  readonly localDate: string;
  readonly sessions: number;
  readonly volumeKg: number;
  /** Completed sets carrying both weight and reps — the only sets volume is built from. */
  readonly loadSets: number;
}

export type TrainingDayView =
  | { readonly kind: 'rest'; readonly localDate: string }
  | { readonly kind: 'coverage'; readonly localDate: string; readonly sessions: number }
  | {
      readonly kind: 'volume';
      readonly localDate: string;
      readonly sessions: number;
      readonly volumeKg: number;
    };

/**
 * How one counted day reads.
 *
 * - No sessions: rest. A fact about the log, not a judgment about the athlete.
 * - Sessions but no load-carrying set (legacy imports without per-set rows,
 *   bodyweight work logged without numbers): coverage — the day counts, the load
 *   honestly does not exist, and printing `0 kg` would dress that absence as a
 *   measurement.
 * - Otherwise: the computed volume, which is a sum of rows and says so.
 */
export function describeTrainingDay(day: TrainingDayBucket): TrainingDayView {
  if (day.sessions === 0) return { kind: 'rest', localDate: day.localDate };
  if (day.loadSets === 0) {
    return { kind: 'coverage', localDate: day.localDate, sessions: day.sessions };
  }
  return {
    kind: 'volume',
    localDate: day.localDate,
    sessions: day.sessions,
    volumeKg: day.volumeKg,
  };
}

export type TrainingWeekView =
  | { readonly kind: 'empty' }
  | { readonly kind: 'coverage'; readonly sessions: number }
  | { readonly kind: 'loaded'; readonly sessions: number; readonly volumeKg: number };

/**
 * How the whole week reads. `days` must already be the 7 counted buckets; this function
 * counts nothing, it only classifies — which is why the "no fabrication" control can
 * feed it zeros and demand the empty state back.
 */
export function describeTrainingWeek(days: readonly TrainingDayBucket[]): TrainingWeekView {
  const sessions = days.reduce((total, day) => total + day.sessions, 0);
  if (sessions === 0) return { kind: 'empty' };
  const volumeKg = days.reduce((total, day) => total + day.volumeKg, 0);
  const loadSets = days.reduce((total, day) => total + day.loadSets, 0);
  if (loadSets === 0) return { kind: 'coverage', sessions };
  return { kind: 'loaded', sessions, volumeKg };
}

/**
 * Consecutive training days ending at the reference date, from distinct completed-session
 * dates (newest first or not — only membership matters).
 *
 * The anchor rule, stated because it is a choice: a streak counts back from `refDate` when
 * that day has a session, else from the day before — training yesterday keeps today's
 * streak alive; training last week does not. Anything after `refDate` is ignored, so a
 * misfiled future session can never extend a streak.
 */
export function computeStreakDays(
  trainingDates: readonly string[],
  refDate: string,
): number {
  const trained = new Set(trainingDates.filter((date) => date <= refDate));
  let cursor = trained.has(refDate) ? refDate : shiftIsoDate(refDate, -1);
  let streak = 0;
  while (trained.has(cursor)) {
    streak += 1;
    cursor = shiftIsoDate(cursor, -1);
  }
  return streak;
}
