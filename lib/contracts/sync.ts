import { z } from 'zod';
import { createAppEnvelopeSchema } from './envelope';
import {
  IsoDateTimeSchema,
  NonNegativeIntegerSchema,
  RepsSchema,
  WeightKgSchema,
  SessionPhaseSchema,
  TaskKeySchema,
  UuidSchema,
} from './common';

const MutationIdentityShape = {
  mutationId: UuidSchema,
  clientTs: IsoDateTimeSchema,
  sessionId: UuidSchema,
};

/** Matches session_sets.weight_kg numeric(6,2) as well as its 0–1000 check. */
export { WeightKgSchema, RepsSchema };

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
}).strict().superRefine((request, context) => {
  const sessionIds = new Set(request.mutations.map((mutation) => mutation.sessionId));
  if (sessionIds.size > 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['mutations'],
      message: 'All mutations must target one session.',
    });
  }
});

export const SyncRejectionSchema = z.object({
  mutationId: UuidSchema,
  reason: z.string().min(1),
}).strict();

/**
 * The answer to one drained batch: what the server accepted, what it refused and why, and the
 * sequence the client is now standing on. Nothing else.
 *
 * **#105 removed a fifth field, `state: SessionStateSchema`.** Every sync response carried the
 * whole session graph — strictly validated on the producer, read by no client (`src/app/state/`
 * casts this body and refetches), on the two hottest calls in the app: the drain behind every
 * queued mutation and the 4 s poll. A field the producer must be right about and nobody consumes
 * is cost, not contract. Authoritative state is `GET /api/sessions/[id]`'s job, and the
 * rejection-and-refetch path #63 shipped is the consumer that was always meant to read it.
 *
 * `.strict()` is what makes the removal stick rather than a matter of taste: a producer that
 * still emitted `state` now fails `validateOutgoing` with a `ContractViolationError` (a redacted
 * 500) instead of quietly shipping a key the contract stopped describing. And because the
 * *request* half — `SyncRequestSchema`, which is what an outbox row in someone's IndexedDB
 * actually holds — is untouched, a batch queued before this deploy still posts. That is stated
 * here and *executed* in `tests/integration/api/sync.test.ts`, not assumed.
 */
export const SyncResponseDataSchema = z.object({
  serverSeq: NonNegativeIntegerSchema,
  applied: z.array(UuidSchema),
  rejected: z.array(SyncRejectionSchema),
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
