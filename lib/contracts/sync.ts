import { z } from 'zod';
import { createAppEnvelopeSchema } from './envelope.js';
import {
  IsoDateTimeSchema,
  NonNegativeIntegerSchema,
  SessionPhaseSchema,
  TaskKeySchema,
  UuidSchema,
} from './common.js';
import { SessionStateSchema } from './sessions.js';

const MutationIdentityShape = {
  mutationId: UuidSchema,
  clientTs: IsoDateTimeSchema,
  sessionId: UuidSchema,
};

/** Matches session_sets.weight_kg numeric(6,2) as well as its 0–1000 check. */
export const WeightKgSchema = z.number().min(0).max(1000).multipleOf(0.01);
export const RepsSchema = z.number().int().min(0).max(1000);

export const SetUpsertMutationSchema = z.object({
  ...MutationIdentityShape,
  op: z.literal('set.upsert'),
  exerciseId: UuidSchema,
  setIndex: z.number().int().min(0).max(50),
  isCompleted: z.boolean(),
  weightKg: WeightKgSchema.nullable(),
  reps: RepsSchema.nullable(),
}).strict();

export const TaskCompleteMutationSchema = z.object({
  ...MutationIdentityShape,
  op: z.literal('task.complete'),
  taskKey: TaskKeySchema,
  completedAt: IsoDateTimeSchema.nullable(),
}).strict();

export const PhaseAdvanceMutationSchema = z.object({
  ...MutationIdentityShape,
  op: z.literal('phase.advance'),
  phase: SessionPhaseSchema,
}).strict();

export const SessionFinishMutationSchema = z.object({
  ...MutationIdentityShape,
  op: z.literal('session.finish'),
  completedAt: IsoDateTimeSchema.optional(),
}).strict();

/** The sole polymorphic write contract for an active workout. */
export const SyncMutationSchema = z.discriminatedUnion('op', [
  SetUpsertMutationSchema,
  TaskCompleteMutationSchema,
  PhaseAdvanceMutationSchema,
  SessionFinishMutationSchema,
]);

export const SyncRequestSchema = z.object({
  deviceId: UuidSchema,
  sinceSeq: NonNegativeIntegerSchema,
  mutations: z.array(SyncMutationSchema).max(200),
}).strict();

export const SyncRejectionSchema = z.object({
  mutationId: UuidSchema,
  reason: z.string().min(1),
}).strict();

export const SyncResponseDataSchema = z.object({
  serverSeq: NonNegativeIntegerSchema,
  applied: z.array(UuidSchema),
  rejected: z.array(SyncRejectionSchema),
  state: SessionStateSchema,
  clockSkewMs: z.number().int(),
}).strict();

/** HTTP responses are always wrapped in the canonical application envelope. */
export const SyncResponseSchema = createAppEnvelopeSchema(SyncResponseDataSchema);

export type SetUpsertMutation = z.infer<typeof SetUpsertMutationSchema>;
export type TaskCompleteMutation = z.infer<typeof TaskCompleteMutationSchema>;
export type PhaseAdvanceMutation = z.infer<typeof PhaseAdvanceMutationSchema>;
export type SessionFinishMutation = z.infer<typeof SessionFinishMutationSchema>;
export type SyncMutation = z.infer<typeof SyncMutationSchema>;
export type SyncRequest = z.infer<typeof SyncRequestSchema>;
export type SyncResponseData = z.infer<typeof SyncResponseDataSchema>;
export type WeightKg = z.infer<typeof WeightKgSchema>;
export type Reps = z.infer<typeof RepsSchema>;

export const setUpsertMutationSchema = SetUpsertMutationSchema;
export const taskCompleteMutationSchema = TaskCompleteMutationSchema;
export const phaseAdvanceMutationSchema = PhaseAdvanceMutationSchema;
export const sessionFinishMutationSchema = SessionFinishMutationSchema;
export const syncMutationSchema = SyncMutationSchema;
export const syncRequestSchema = SyncRequestSchema;
export const syncResponseSchema = SyncResponseSchema;
