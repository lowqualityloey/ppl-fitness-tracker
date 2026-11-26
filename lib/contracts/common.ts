import { z } from 'zod';

export const UuidSchema = z.string().uuid();
export const IsoDateTimeSchema = z.string().datetime({ offset: true });
/**
 * A calendar date, not a date-shaped string: `z.iso.date()` rejects `2026-02-31` and
 * `2025-02-29`, which the previous regex accepted. That matters wherever a date goes
 * straight into a Postgres `date` column: an impossible date used to pass the contract and
 * come back as a 500 from the cast. It is now a 400 at the same boundary as every other
 * malformed input (#82).
 */
export const LocalDateSchema = z.iso.date('Expected a YYYY-MM-DD date.');
export const NonNegativeIntegerSchema = z.number().int().nonnegative();

/**
 * Bounds mirror the `weight_sane` and `reps_sane` CHECK constraints on
 * `session_sets` (`db/schema/index.ts:155-157`), so a payload rejected by these
 * schemas and one rejected by the database are the same event.
 *
 * They live here rather than in `sync.ts` because both the sync write path and
 * the M3-00 prefill read path need them, and a scalar with two declarations is
 * two sources of truth. `STATE §4` item 22 pairs that with the reverse rule —
 * `sessions.ts` never imports `sync.ts`. #105 deleted the import that used to make
 * the ban a cycle hazard (`sync.ts` no longer needs the session graph at all), so
 * the rule now rests on single ownership alone. It still holds.
 */
export const WeightKgSchema = z.number().min(0).max(1000).multipleOf(0.01);
export const RepsSchema = z.number().int().min(0).max(1000);

export const SessionStatusSchema = z.enum(['in_progress', 'completed', 'archived']);
export const SessionPhaseSchema = z.enum([
  'pre_workout',
  'exercise',
  'rest',
  'stretch',
  'post_workout',
]);
export const SessionSourceSchema = z.enum(['app', 'legacy_import']);
export const TaskKeySchema = z.enum(['warm_up', 'main_workout', 'stretch']);

/**
 * The two enums the *plan* half of the session graph carries, which the five above
 * do not cover: `SessionPhaseSchema` is where a workout **is** (five states, on
 * `workout_sessions.phase`), while `RoutineExercisePhaseSchema` is which **section**
 * a placement belongs to (two, on `routine_exercises.phase`). They share the value
 * `'stretch'` and nothing else, and conflating them is how a warm-up slot would be
 * treated as a rest period.
 *
 * Spelled exactly as `db/schema/index.ts:56-57` spells them —
 * `exercise_kind = ['strength','stretch']` and
 * `routine_exercise_phase = ['main_workout','stretch']`. They live here for the same
 * reason `#73` exists: a hand-copied enum is a second source of truth that is wrong
 * from birth, and the draft of the session view produced `['in_progress','archived',
 * 'abandoned']` and `phase: ['strength','stretch']` — neither value exists in the
 * database. Anything that needs either one reuses these.
 */
export const ExerciseKindSchema = z.enum(['strength', 'stretch']);
export const RoutineExercisePhaseSchema = z.enum(['main_workout', 'stretch']);

export type Uuid = z.infer<typeof UuidSchema>;
export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;
export type SessionPhase = z.infer<typeof SessionPhaseSchema>;
export type TaskKey = z.infer<typeof TaskKeySchema>;
export type ExerciseKind = z.infer<typeof ExerciseKindSchema>;
export type RoutineExercisePhase = z.infer<typeof RoutineExercisePhaseSchema>;
