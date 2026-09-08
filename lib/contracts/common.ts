import { z } from 'zod';

export const UuidSchema = z.string().uuid();
export const IsoDateTimeSchema = z.string().datetime({ offset: true });
export const LocalDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date.');
export const NonNegativeIntegerSchema = z.number().int().nonnegative();

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
