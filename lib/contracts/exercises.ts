import { z } from 'zod';
import { createAppEnvelopeSchema } from './envelope.js';
import { UuidSchema } from './common.js';

export const ExerciseSchema = z.object({
  id: UuidSchema,
  slug: z.string().trim().min(1).max(128).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid exercise slug.'),
  name: z.string().trim().min(1).max(200),
  muscleGroups: z.array(z.string().trim().min(1)).max(32),
  equipment: z.string().trim().min(1).max(200).nullable(),
  formTips: z.string().nullable(),
  videoUrl: z.string().url().nullable(),
  alternatives: z.array(z.string().trim().min(1)).max(32),
}).strict();

export const ExercisesListQuerySchema = z.object({}).strict();
export const ExercisesListDataSchema = z.object({
  exercises: z.array(ExerciseSchema),
}).strict();
export const ExercisesListResponseSchema = createAppEnvelopeSchema(ExercisesListDataSchema);

export type Exercise = z.infer<typeof ExerciseSchema>;
export type ExercisesListData = z.infer<typeof ExercisesListDataSchema>;

export const ExerciseListQuerySchema = ExercisesListQuerySchema;
export const ExerciseListDataSchema = ExercisesListDataSchema;
export const ExerciseListResponseSchema = ExercisesListResponseSchema;
export const exercisesListQuerySchema = ExercisesListQuerySchema;
export const exercisesListResponseSchema = ExercisesListResponseSchema;
