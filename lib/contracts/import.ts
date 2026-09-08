import { z } from 'zod';
import { createAppEnvelopeSchema } from './envelope.js';

const BooleanMapSchema = z.record(z.string().min(1), z.boolean());
const LooseStateSchema = z.record(z.string().min(1), z.unknown());

export const PushWorkoutProgressSchema = z.object({
  currentPhase: z.string().min(1).max(64),
  state: z.object({
    preWorkoutChecklist: BooleanMapSchema.optional(),
    warmupExercises: BooleanMapSchema.optional(),
    mainWorkoutSets: BooleanMapSchema.optional(),
    stretchingExercises: BooleanMapSchema.optional(),
    postWorkoutChecklist: BooleanMapSchema.optional(),
    phaseCompletion: BooleanMapSchema.optional(),
  }).passthrough(),
  // Older or hand-edited records may omit this; the importer then uses the
  // import date and records low date confidence in its report.
  timestamp: z.number().int().nonnegative().optional(),
}).strict();

export const LegsWorkoutProgressSchema = z.object({
  currentPhase: z.string().min(1).max(64),
  state: LooseStateSchema,
  checkboxStates: BooleanMapSchema,
  timerStates: z.record(z.string().min(1), z.object({
    seconds: z.number().int().nonnegative(),
    isRunning: z.boolean(),
  }).strict()),
}).strict();

export const PullDayProgressSchema = z.object({
  currentPhase: z.string().min(1).max(64),
  completedSets: z.number().int().nonnegative(),
  completedExercises: z.number().int().nonnegative(),
  workoutStartTime: z.number().int().nonnegative().nullable(),
  cardioTimeLeft: z.number().int().nonnegative(),
  cooldownTimeLeft: z.number().int().nonnegative(),
  checkboxStates: BooleanMapSchema,
  stretchStates: BooleanMapSchema,
}).strict();

function storedJsonSchema<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  }, schema);
}

/** Accept both parsed request bodies and the original localStorage strings. */
export const StoredPushWorkoutProgressSchema = storedJsonSchema(PushWorkoutProgressSchema);
export const StoredLegsWorkoutProgressSchema = storedJsonSchema(LegsWorkoutProgressSchema);
export const StoredPullDayProgressSchema = storedJsonSchema(PullDayProgressSchema);

/**
 * The request boundary intentionally keeps each known value raw. The importer
 * parses each key independently with LegacyImportPayloadSchemas so one
 * malformed localStorage entry cannot discard valid sibling entries.
 * userStats is accepted and ignored because the RFC documents it as having no
 * recoverable history.
 */
export const LegacyImportRequestSchema = z.object({
  pushWorkoutProgress: z.unknown().optional(),
  legsWorkoutProgress: z.unknown().optional(),
  pullDayProgress: z.unknown().optional(),
  userStats: z.unknown().optional(),
}).strict().refine(
  (payload) => Object.values(payload).some((value) => value !== undefined),
  { message: 'At least one legacy progress payload is required.' },
);

export const LegacyImportPayloadSchemas = {
  pushWorkoutProgress: StoredPushWorkoutProgressSchema,
  legsWorkoutProgress: StoredLegsWorkoutProgressSchema,
  pullDayProgress: StoredPullDayProgressSchema,
} as const;

export const DateConfidenceSchema = z.enum(['high', 'low']);
export const ImportReportSchema = z.object({
  sessionsCreated: z.number().int().nonnegative(),
  setsRecovered: z.number().int().nonnegative(),
  fieldsNotRecovered: z.array(z.string()),
  dateConfidence: DateConfidenceSchema.optional(),
  warnings: z.array(z.string()).optional(),
}).passthrough();

export const LegacyImportDataSchema = z.object({
  report: ImportReportSchema,
}).strict();
export const LegacyImportResponseSchema = createAppEnvelopeSchema(LegacyImportDataSchema);

export type PushWorkoutProgress = z.infer<typeof PushWorkoutProgressSchema>;
export type LegsWorkoutProgress = z.infer<typeof LegsWorkoutProgressSchema>;
export type PullDayProgress = z.infer<typeof PullDayProgressSchema>;
export type LegacyImportRequest = z.infer<typeof LegacyImportRequestSchema>;
export type ImportReport = z.infer<typeof ImportReportSchema>;
export type LegacyImportData = z.infer<typeof LegacyImportDataSchema>;

export const pushWorkoutProgressSchema = PushWorkoutProgressSchema;
export const legsWorkoutProgressSchema = LegsWorkoutProgressSchema;
export const pullDayProgressSchema = PullDayProgressSchema;
export const legacyImportRequestSchema = LegacyImportRequestSchema;
export const legacyImportPayloadSchemas = LegacyImportPayloadSchemas;
export const importReportSchema = ImportReportSchema;
export const legacyImportResponseSchema = LegacyImportResponseSchema;
