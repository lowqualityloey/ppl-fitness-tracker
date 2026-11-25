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
  /**
   * The mutation's position in the sender's outbox, used to order two writes to
   * the same entity that land in the same millisecond (#78). Optional because a
   * batch already queued in a browser's IndexedDB at deploy time predates this
   * field; the server reads a missing value as 0, which is "unknown" and falls
   * through to the previous tie-breaker. The outbox hands out `lastSeq() + 1`,
   * so a real mutation never carries 0.
   */
  clientSeq: NonNegativeIntegerSchema.optional(),
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

/**
 * One refused mutation: the stable code, and the sentence a person can act on.
 *
 * **#77 added `message` beside `reason`, additively.** `reason` stays the machine truth — tests,
 * metrics and any retry policy switch on it, and it is what `sync_mutations.rejection_reason`
 * stores — so nothing about it moved. What was missing is the other half: the domain layer has
 * always written a specific sentence (`"Sets can only be changed during the main workout."`,
 * `"A session can only finish from post-workout."`) and `rejectionReason` threw it away, leaving
 * the client to reconstruct the rule locally and show an athlete `Set 3 — CONFLICT`.
 *
 * `message` is **required**, not optional. The spec's §4.1 sketch wrote `max(200).optional()`;
 * every server rejection path has a sentence in hand (the caught domain error, or a fixed one
 * for the paths that never reach the domain), so an optional field would only put a fallback
 * branch back in the UI — the branch this change exists to delete. The 200 cap is the sketch's,
 * kept: a rejection is a sentence, not a stack trace, and the cap is what keeps a future
 * `error.message` from a library from arriving as a paragraph.
 *
 * No migration: the column keeps the code, and the sentence is derived at response time.
 */
export const SyncRejectionSchema = z.object({
  mutationId: UuidSchema,
  reason: z.string().min(1),
  message: z.string().min(1).max(200),
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
export type SyncRejection = z.infer<typeof SyncRejectionSchema>;
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
