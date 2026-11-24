import { describe, expect, it } from 'vitest';

import {
  STRETCH_RANGE_POLICY,
  stretchCountdownMs,
  type StretchTimingInput,
} from '../../../lib/domain/sessions/stretch-timing';

/**
 * M4-17 (#106) — how long a stretch countdown runs.
 *
 * The card asks for one thing above all: that the number on screen is a number the app is
 * actually counting. That makes this file the *only* place the length of a stretch hold is
 * decided, and it is deliberately a pure function so the decision is provable without a DOM.
 *
 * The range case is the interesting one. `routine_exercises.rest_time` is a text column seeded
 * with strings like `'60-90s'` — two endpoints, and a countdown needs one. Counting the upper
 * bound makes an athlete hold a stretch past the point the plan asked for; averaging invents a
 * number neither endpoint states. The policy below is the lower bound, stated once here and once
 * in the module, so a reader can disagree with a sentence rather than reverse-engineer a guess.
 */

/** A stretch placement as the runner sees it, with only the two fields this decision reads. */
function placement(overrides: Partial<StretchTimingInput> = {}): StretchTimingInput {
  return { durationSeconds: null, restTime: null, ...overrides };
}

describe('stretch countdown length', () => {
  it('counts the hold length the plan declares', () => {
    // Every stretch row in db/seed/stretches.ts carries one of these two numbers, and until
    // #106 nothing on screen read it: the sequence was a list of names.
    expect(stretchCountdownMs(placement({ durationSeconds: 30 }))).toBe(30_000);
    expect(stretchCountdownMs(placement({ durationSeconds: 45 }))).toBe(45_000);
  });

  it('prefers the declared hold over the compatibility rest string', () => {
    // Both are present on a strength placement, and only one of them is about this movement.
    // duration_seconds is the stretch's own hold; rest_time is the gap between sets, which a
    // stretch does not have. Reading the wrong one would be a timer for the wrong event.
    expect(stretchCountdownMs(placement({ durationSeconds: 30, restTime: '60-90s' }))).toBe(30_000);
  });

  it("counts a range's lower bound, which is the recorded policy", () => {
    // The whole range decision, in one assertion pair: 60 is counting, and 90 is the answer a
    // "helpful" upper-bound or midpoint implementation would give.
    expect(STRETCH_RANGE_POLICY).toBe('lower-bound');
    expect(stretchCountdownMs(placement({ restTime: '60-90s' }))).toBe(60_000);
    expect(stretchCountdownMs(placement({ restTime: '60-90s' }))).not.toBe(90_000);
    expect(stretchCountdownMs(placement({ restTime: '60-90s' }))).not.toBe(75_000);
  });

  it('reads the single-value strings the seed also uses', () => {
    expect(stretchCountdownMs(placement({ restTime: '60s' }))).toBe(60_000);
    expect(stretchCountdownMs(placement({ restTime: '75s' }))).toBe(75_000);
    expect(stretchCountdownMs(placement({ restTime: '90s' }))).toBe(90_000);
  });

  it('tolerates the spacing a human would write', () => {
    expect(stretchCountdownMs(placement({ restTime: ' 60 - 90s ' }))).toBe(60_000);
  });

  it('offers no countdown when the plan states no duration', () => {
    // `null` is not "zero seconds" — it means the screen must not offer a clock at all. A
    // 0:00 that finishes on arrival would be the same lie as a static number, better dressed.
    expect(stretchCountdownMs(placement())).toBeNull();
    expect(stretchCountdownMs(placement({ durationSeconds: null, restTime: null }))).toBeNull();
  });

  it('refuses to invent a number from text it cannot read', () => {
    // An unparseable string yields "no countdown" rather than NaN, which would render as "NaN:NaN"
    // and — worse — compare false against every deadline in the timer controller.
    for (const restTime of ['hold it', '90', '', '  ', 'sixty seconds', '1-2 min']) {
      expect(stretchCountdownMs(placement({ restTime })), restTime).toBeNull();
    }
  });

  it('never returns a non-positive length', () => {
    // `duration_seconds > 0` is a database CHECK, but the runner also reads session views built
    // from older rows and from fixtures, so the function does not trust its input.
    for (const bad of [0, -30, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(stretchCountdownMs(placement({ durationSeconds: bad })), String(bad)).toBeNull();
    }
  });

  it('ignores a duration that is not a whole number of seconds', () => {
    // duration_seconds is an integer column; a fractional value could only arrive from a bad
    // fixture, and rounding it silently would hide the badness.
    expect(stretchCountdownMs(placement({ durationSeconds: 30.5 }))).toBeNull();
  });
});
