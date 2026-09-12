import { describe, expect, it } from 'vitest';
import { ExercisePlanSchema, SessionStateSchema } from '../../../lib/contracts/sessions';
import { ExerciseKindSchema, RoutineExercisePhaseSchema } from '../../../lib/contracts/common';
import { mapperOutput } from './session-state-fixtures';

/**
 * The contract tests for #73, written against `mapSessionState`'s real output rather than a
 * hand-written payload: the fixture in `session-state-fixtures.ts` builds the object out of
 * drizzle row types, so "the contract and the mapper agree" is a measured statement about
 * two artifacts, not a statement that two hand-written literals match each other.
 */
describe('SessionStateSchema describes the session graph (#73)', () => {
  it('accepts exactly what mapSessionState produces — the can-not-drift-silently lock', () => {
    const parsed = SessionStateSchema.safeParse(mapperOutput());
    if (!parsed.success) {
      // Without the issues in the message this test fails as "false is not true", and the
      // reading time goes into finding which field disagreed.
      throw new Error(
        `mapper output rejected by its own contract: ${JSON.stringify(parsed.error.issues)}`,
      );
    }
    expect(parsed.success).toBe(true);
    // Both halves of the timestamp duality in one assertion: the mapper's `Date` goes in,
    // an ISO string comes out, so what the route validates is what it sends.
    expect(parsed.data.startedAt).toBe('2026-09-11T09:00:00.000Z');
    expect(parsed.data.tasks[0]?.completedAt).toBe('2026-09-11T09:00:00.000Z');
    expect(parsed.data.tasks[1]?.completedAt).toBeNull();
    expect(parsed.data.sets[0]?.weightKg).toBe(82.5);
  });

  it('accepts the same graph after JSON serialization, because that is the client form', () => {
    expect(SessionStateSchema.safeParse(JSON.parse(JSON.stringify(mapperOutput()))).success).toBe(true);
  });

  it('rejects a status the database has never had', () => {
    // The card's own birth defect: a drafted `['in_progress','archived','abandoned']`.
    expect(SessionStateSchema.safeParse({ ...mapperOutput(), status: 'abandoned' }).success).toBe(false);
  });

  it('rejects an exercise kind outside `exercise_kind`', () => {
    const state = mapperOutput();
    const exercises = state.routineDay.exercises.map((placement) => ({
      ...placement,
      exercise: { ...placement.exercise, kind: 'cardio' },
    }));
    expect(
      SessionStateSchema.safeParse({ ...state, routineDay: { ...state.routineDay, exercises } }).success,
    ).toBe(false);
    // Asserted against the enum itself too: `db/schema/index.ts:56` is the authority, and
    // this is the line that fails first if a value is ever added there and not here.
    expect(ExerciseKindSchema.options).toEqual(['strength', 'stretch']);
  });

  it('rejects a placement phase outside `routine_exercise_phase`', () => {
    // `'warmup'` is the shape of the mistake: `session_phase` and `routine_exercise_phase`
    // are different enums that happen to share the value `'stretch'`, and one hand-copied
    // list silently becomes the other.
    const state = mapperOutput();
    const exercises = state.routineDay.exercises.map((placement) => ({
      ...placement,
      phase: 'warmup',
    }));
    expect(
      SessionStateSchema.safeParse({ ...state, routineDay: { ...state.routineDay, exercises } }).success,
    ).toBe(false);
    expect(RoutineExercisePhaseSchema.options).toEqual(['main_workout', 'stretch']);
  });

  it('rejects a session phase outside the five', () => {
    expect(SessionStateSchema.safeParse({ ...mapperOutput(), phase: 'warmup' }).success).toBe(false);
  });

  it('rejects a required field the mapper stopped emitting', () => {
    const state = mapperOutput();
    const withoutTargetSets = state.routineDay.exercises.map((placement) => {
      const copy: Record<string, unknown> = { ...placement };
      delete copy.targetSets;
      return copy;
    });
    expect(
      SessionStateSchema.safeParse({
        ...state,
        routineDay: { ...state.routineDay, exercises: withoutTargetSets },
      }).success,
    ).toBe(false);
    // And `null` stays legal for the same column: `target_sets` is nullable in the
    // database, so the contract distinguishes "no target" from "no description of one".
    const nullable = state.routineDay.exercises.map((placement) => ({ ...placement, targetSets: null }));
    expect(
      SessionStateSchema.safeParse({
        ...state,
        routineDay: { ...state.routineDay, exercises: nullable },
      }).success,
    ).toBe(true);
  });

  it('rejects a field the mapper invented, because `.strict()` cuts both ways', () => {
    const state: Record<string, unknown> = { ...mapperOutput(), newHotness: true };
    expect(SessionStateSchema.safeParse(state).success).toBe(false);
  });

  it('holds a set to the same bounds the database CHECK holds it to', () => {
    const state = mapperOutput();
    const withSet = (weightKg: number | null, reps: number | null) => ({
      ...state,
      sets: [{ ...state.sets[0]!, weightKg, reps }],
    });
    expect(SessionStateSchema.safeParse(withSet(1000, 1000)).success).toBe(true);
    expect(SessionStateSchema.safeParse(withSet(null, null)).success).toBe(true);
    // `weight_sane` / `reps_sane` make these rows unrepresentable, so a state carrying them
    // means something reached the database past them.
    expect(SessionStateSchema.safeParse(withSet(1000.01, 8)).success).toBe(false);
    expect(SessionStateSchema.safeParse(withSet(100, 1001)).success).toBe(false);
  });

  it('describes every field of an exercise plan, and no others', () => {
    const plan = ExercisePlanSchema.parse({ ...mapperOutput().routineDay.exercises[0]!.exercise });
    expect(Object.keys(ExercisePlanSchema.shape).sort()).toEqual(Object.keys(plan).sort());
  });
});
