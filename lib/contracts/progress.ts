import { z } from 'zod';
import { createAppEnvelopeSchema } from './envelope.js';
import { IsoDateTimeSchema, LocalDateSchema, UuidSchema } from './common.js';

export const ExerciseProgressParamsSchema = z.object({
  exerciseSlug: z.string().trim().min(1).max(128).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid exercise slug.'),
}).strict();

export const E1rmPointSchema = z.object({
  date: LocalDateSchema,
  e1rm: z.number().nonnegative(),
  sessionId: UuidSchema,
}).strict();

export const PersonalRecordSchema = z.object({
  bestE1rm: z.number().nonnegative(),
  achievedAt: IsoDateTimeSchema,
  sessionId: UuidSchema.nullable(),
}).strict();

export const ExerciseProgressDataSchema = z.object({
  exerciseSlug: z.string().trim().min(1).max(128).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid exercise slug.'),
  trendline: z.array(E1rmPointSchema),
  personalRecords: z.array(PersonalRecordSchema),
}).strict();

export const ExerciseProgressResponseSchema = createAppEnvelopeSchema(ExerciseProgressDataSchema);

export type ExerciseProgressParams = z.infer<typeof ExerciseProgressParamsSchema>;
export type E1rmPoint = z.infer<typeof E1rmPointSchema>;
export type PersonalRecord = z.infer<typeof PersonalRecordSchema>;
export type ExerciseProgressData = z.infer<typeof ExerciseProgressDataSchema>;

export const ProgressParamsSchema = ExerciseProgressParamsSchema;
export const ProgressDataSchema = ExerciseProgressDataSchema;
export const ProgressResponseSchema = ExerciseProgressResponseSchema;
export const exerciseProgressParamsSchema = ExerciseProgressParamsSchema;
export const exerciseProgressResponseSchema = ExerciseProgressResponseSchema;
