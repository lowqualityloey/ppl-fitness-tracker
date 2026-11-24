/**
 * M4-17 (#106) — how long a stretch countdown runs.
 *
 * The stretch section used to be a list of movement names: the plan said "hold 30 seconds" and
 * nothing on screen counted them. Wiring it to the same `TimerController` as the rest phase needs
 * one decision this file exists to own — given a `routine_exercises` row, how many milliseconds
 * does the clock run? — and it is a pure function so that decision can be proven without a DOM.
 *
 * Why not just read `restTime`? Because `rest_time` is the gap *between sets*, and a stretch has
 * no sets. The stretch's own length is `exercise.duration_seconds`, which the seed sets and a
 * database CHECK (`exercise_kind_duration_consistent`) keeps honest. `restTime` is only consulted
 * as a fallback for rows that predate the duration column; for every stretch the seed creates it
 * is NULL and the duration wins.
 */

/**
 * Which end of a range like `'60-90s'` becomes the countdown length.
 *
 * The column is free text, and the seed writes two kinds of value: a single number (`'60s'`) and
 * a range (`'60-90s'`). A countdown needs one number, so a range has to be resolved, and every
 * resolution is a claim about what the plan meant:
 *
 * - **Upper bound (90 s)** makes an athlete hold a stretch longer than the plan asked. A held
 *   position past its intended duration is the one error here with a plausible way to hurt
 *   someone, so it is the wrong direction to round.
 * - **Midpoint (75 s)** invents a number neither endpoint states. Nothing in the data or the spec
 *   says 75 is the intent; it is arithmetic dressed as a decision.
 * - **Lower bound (60 s)** is the length the plan definitely asks for. Finishing early is
 *   recoverable — the athlete can hold longer, and the checklist item is still theirs to tick —
 *   so the asymmetry points here.
 *
 * Recorded as a named constant rather than a comment inside the parser so a test can assert the
 * policy and a reader can disagree with a sentence.
 */
export const STRETCH_RANGE_POLICY = 'lower-bound' as const;

/** The two fields this decision reads, structurally satisfied by `RoutineExercisePlan`. */
export interface StretchTimingInput {
  readonly durationSeconds: number | null;
  readonly restTime: string | null;
}

/** `'60s'`, `'60-90s'`, and the spacing a human writes. A bare `'90'` is rejected: no unit, no claim. */
const REST_TIME_PATTERN = /^(\d+)(?:\s*-\s*(\d+))?\s*s$/;

/** Whole seconds only — `duration_seconds` is an integer column and rounding would hide a bad row. */
function wholeSeconds(value: number | null): number | null {
  if (value === null || !Number.isInteger(value) || value <= 0) return null;
  return value;
}

/** The lower bound of a `rest_time` string, or `null` when it states no readable duration. */
function restTimeSeconds(restTime: string | null): number | null {
  if (restTime === null) return null;
  const match = REST_TIME_PATTERN.exec(restTime.trim());
  if (match === null) return null;
  const lower = Number(match[1]);
  return lower > 0 ? lower : null;
}

/**
 * The countdown length for one stretch placement, in milliseconds, or `null` for "offer no clock".
 *
 * `null` is not zero: it means the plan states no duration the app could honestly count, and a
 * `0:00` that finishes on arrival would be the same lie as the static text this replaces.
 */
export function stretchCountdownMs(placement: StretchTimingInput): number | null {
  const declared = wholeSeconds(placement.durationSeconds);
  if (declared !== null) return declared * 1_000;

  const fromRestTime = restTimeSeconds(placement.restTime);
  return fromRestTime === null ? null : fromRestTime * 1_000;
}
