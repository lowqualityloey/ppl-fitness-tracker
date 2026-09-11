import { z } from 'zod';

export const UuidSchema = z.string().uuid();
export const IsoDateTimeSchema = z.string().datetime({ offset: true });
export const LocalDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date.');
export const NonNegativeIntegerSchema = z.number().int().nonnegative();

/**
 * Bounds mirror the `weight_sane` and `reps_sane` CHECK constraints on
 * `session_sets` (`db/schema/index.ts:155-157`), so a payload rejected by these
 * schemas and one rejected by the database are the same event.
 *
 * They live here rather than in `sync.ts` because both the sync write path and
 * the M3-00 prefill read path need them, and `sync.ts` already imports
 * `SessionStateSchema` from `sessions.ts` — importing back would be a cycle.
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

export type Uuid = z.infer<typeof UuidSchema>;
export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;
export type SessionPhase = z.infer<typeof SessionPhaseSchema>;
export type TaskKey = z.infer<typeof TaskKeySchema>;
