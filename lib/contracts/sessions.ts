import { z } from 'zod';
import { createAppEnvelopeSchema } from './envelope';
import {
  IsoDateTimeSchema,
  LocalDateSchema,
  NonNegativeIntegerSchema,
  SessionPhaseSchema,
  SessionSourceSchema,
  SessionStatusSchema,
  RepsSchema,
  UuidSchema,
  WeightKgSchema,
} from './common';

const CursorSchema = z.string().trim().min(1).max(512);
const QuerySequenceSchema = z.union([
  z.string().regex(/^\d+$/, 'Expected a non-negative sequence number.'),
  NonNegativeIntegerSchema,
]).transform(Number);

export const SessionsListQuerySchema = z.object({
  cursor: CursorSchema.optional(),
}).strict();

export const SessionStartRequestSchema = z.object({
  routineDayId: UuidSchema,
  clientId: UuidSchema,
}).strict();

export const SessionDetailParamsSchema = z.object({
  id: UuidSchema,
}).strict();

/**
 * `since` is a **version token**, and its semantics are fixed here rather than in
 * a route comment (M3-01, #58):
 *
 * - `since === server_seq` — nothing changed; the response is `SessionNotModifiedSchema`
 *   and carries **no session body**.
 * - `since < server_seq` — the client is behind; a full session is returned.
 * - `since > server_seq` — the client claims to be ahead of the server, so it is
 *   wrong about something. Return the full current state; telling a client
 *   "no change" here would invite it to keep trusting state that never existed.
 *
 * The token is `workout_sessions.server_seq` and nothing else — never `updated_at`
 * and never a client clock.
 */
export const SessionDetailQuerySchema = z.object({
  since: QuerySequenceSchema.optional(),
}).strict();

/** Response for an unchanged session: seq echoed, payload omitted. */
export const SessionNotModifiedSchema = z.object({
  notModified: z.literal(true),
  serverSeq: QuerySequenceSchema,
}).strict();

export type SessionNotModified = z.infer<typeof SessionNotModifiedSchema>;

export const SessionNotModifiedResponseSchema = createAppEnvelopeSchema(SessionNotModifiedSchema);

export const SessionSummarySchema = z.object({
  id: UuidSchema,
  routineDayId: UuidSchema,
  clientId: UuidSchema,
  status: SessionStatusSchema,
  phase: SessionPhaseSchema,
  source: SessionSourceSchema,
  localDate: LocalDateSchema,
  startedAt: IsoDateTimeSchema,
  completedAt: IsoDateTimeSchema.nullable(),
  serverSeq: z.number().int().nonnegative(),
  updatedAt: IsoDateTimeSchema,
}).strict();

/**
 * M2 owns the authoritative session-state shape. Keeping this seam
 * passthrough for M1 lets sync and route-handler tests compile without
 * prematurely freezing SessionEngine internals.
 */
export const SessionStateSchema = z.object({}).passthrough();

export const SessionsListDataSchema = z.object({
  sessions: z.array(SessionSummarySchema),
  nextCursor: CursorSchema.nullable(),
}).strict();

export const SessionsListResponseSchema = createAppEnvelopeSchema(SessionsListDataSchema);
export const SessionStartResponseSchema = createAppEnvelopeSchema(SessionStateSchema);
export const SessionDetailResponseSchema = createAppEnvelopeSchema(SessionStateSchema);

export type SessionsListQuery = z.infer<typeof SessionsListQuerySchema>;
export type SessionStartRequest = z.infer<typeof SessionStartRequestSchema>;
export type SessionDetailParams = z.infer<typeof SessionDetailParamsSchema>;
export type SessionDetailQuery = z.infer<typeof SessionDetailQuerySchema>;
export type SessionSummary = z.infer<typeof SessionSummarySchema>;
export type SessionState = z.infer<typeof SessionStateSchema>;

// Singular aliases cover the route-oriented naming used by M1-16.
export const SessionListQuerySchema = SessionsListQuerySchema;
export const SessionListDataSchema = SessionsListDataSchema;
export const SessionListResponseSchema = SessionsListResponseSchema;
export const sessionsListQuerySchema = SessionsListQuerySchema;
export const sessionStartRequestSchema = SessionStartRequestSchema;
export const sessionDetailParamsSchema = SessionDetailParamsSchema;
export const sessionDetailQuerySchema = SessionDetailQuerySchema;
export const sessionsListResponseSchema = SessionsListResponseSchema;
export const sessionStartResponseSchema = SessionStartResponseSchema;
export const sessionDetailResponseSchema = SessionDetailResponseSchema;

// ---------------------------------------------------------------------------
// M3-00 (#57): prefill — "what did I lift last time", resolved on the server.
//
// G6 needs one tap per set, which needs last session's load per exercise slot.
// Deriving that in the browser would mean shipping a user's session history to
// the client to compute a "most recent" that the database can answer with one
// indexed read, so the answer lives here instead.
//
// Provenance is part of the contract: a number with no date attached is not a
// suggestion a user can judge.
// ---------------------------------------------------------------------------

export const SessionPrefillQuerySchema = z.object({
  routineDayId: UuidSchema,
  /** Never prefill from the session currently being started. */
  excludeSessionId: UuidSchema.optional(),
}).strict();

export type SessionPrefillQuery = z.infer<typeof SessionPrefillQuerySchema>;

export const PrefillEntrySchema = z.object({
  exerciseId: UuidSchema,
  setIndex: z.number().int().nonnegative(),
  /** Canonical kg (ADR-0005). A null here means the legacy slot had reps only. */
  weightKg: WeightKgSchema.nullable(),
  reps: RepsSchema.nullable(),
  sourceLocalDate: LocalDateSchema,
}).strict();

export type PrefillEntry = z.infer<typeof PrefillEntrySchema>;

export const PrefillDataSchema = z.object({
  entries: z.array(PrefillEntrySchema),
  /** Null when the user has no prior completed session for this day. */
  sourceSessionId: UuidSchema.nullable(),
  sourceLocalDate: LocalDateSchema.nullable(),
}).strict();

export type PrefillData = z.infer<typeof PrefillDataSchema>;

export const SessionPrefillResponseSchema = createAppEnvelopeSchema(PrefillDataSchema);
export const sessionPrefillQuerySchema = SessionPrefillQuerySchema;
export const prefillEntrySchema = PrefillEntrySchema;
export const prefillDataSchema = PrefillDataSchema;
export const sessionPrefillResponseSchema = SessionPrefillResponseSchema;
