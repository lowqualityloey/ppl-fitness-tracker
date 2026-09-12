import { z } from 'zod';
import { createAppEnvelopeSchema } from './envelope';
import {
  ExerciseKindSchema,
  IsoDateTimeSchema,
  LocalDateSchema,
  NonNegativeIntegerSchema,
  RepsSchema,
  RoutineExercisePhaseSchema,
  SessionPhaseSchema,
  SessionSourceSchema,
  SessionStatusSchema,
  TaskKeySchema,
  UuidSchema,
  WeightKgSchema,
} from './common';

/**
 * The one coercion every timestamp in this file shares, and the reason it is here
 * rather than in a view: **the same column legitimately arrives in two JavaScript
 * forms, and the contract is parsed on both sides of the wire.**
 *
 * - Server side: `mapSessionState` (`lib/domain/sessions/mappers.ts`) hands the route
 *   `Date` objects, because that is what a `timestamp` column is in node-postgres.
 *   The routes now parse the *outgoing* payload through these schemas, so a contract
 *   that accepted only strings would 500 on the first real workout — for failing to
 *   validate something perfectly correct.
 * - Client side: the same value arrives as an ISO string after JSON serialization,
 *   and `lib/views/session-view.ts` re-reads it.
 *
 * Accepting both and emitting exactly one type (an ISO string) is the only version
 * that is honest in both places. Asserting one of the two would make the other throw
 * on the client's *second* fetch of a session — the worst possible time, immediately
 * after the server refused a change.
 */
const toIsoString = (value: unknown): unknown =>
  value instanceof Date ? value.toISOString() : value;

/** For a `notNull` column: the output can never be `null`, so a screen cannot render one. */
const TimestampSchema = z.preprocess(toIsoString, IsoDateTimeSchema);

/** For a nullable column (`completed_at`), where `null` is a real answer. */
const NullableTimestampSchema = z.preprocess(toIsoString, IsoDateTimeSchema.nullable());

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
  startedAt: TimestampSchema,
  completedAt: NullableTimestampSchema,
  serverSeq: NonNegativeIntegerSchema,
  updatedAt: TimestampSchema,
}).strict();

/**
 * The plan half of a session: one exercise as content (an `exercises` row through
 * `mapExercisePlan`). Every field the mapper emits is required here — a column that is
 * nullable in the database is `nullable()`, never `.optional()`, because "the server sent
 * `null`" and "the server stopped describing this" are different events, and only the
 * second one means the contract has drifted.
 *
 * `.strict()` matters as much as the field list: it is what makes *unknown* mapper output
 * fail, which is the half of "the contract describes the graph" that a passthrough
 * silently gives up.
 */
export const ExercisePlanSchema = z.object({
  id: UuidSchema,
  slug: z.string(),
  name: z.string(),
  muscleGroups: z.array(z.string()),
  equipment: z.string().nullable(),
  formTips: z.string().nullable(),
  beginnerNotes: z.string().nullable(),
  videoUrl: z.string().nullable(),
  alternatives: z.array(z.string()),
  kind: ExerciseKindSchema,
  /** `duration_seconds`: set for `stretch`, `null` for `strength` (DB CHECK `exercise_kind_duration_consistent`). */
  durationSeconds: z.number().int().nullable(),
}).strict();

/**
 * One placement in a routine day: a `routine_exercises` row plus its exercise.
 *
 * `targetSets` / `targetReps` / `targetRepsRange` / `restTime` are the four fields the
 * M3-04 view marked `.optional()` purely because it could not see the mapper.
 * `mapRoutineExercisePlan` emits all of them unconditionally, so here they are
 * required-and-nullable — that gap is exactly the drift #73 exists to catch.
 */
export const RoutineExercisePlanSchema = z.object({
  id: UuidSchema,
  phase: RoutineExercisePhaseSchema,
  orderIndex: z.number().int(),
  targetSets: z.number().int().nullable(),
  targetReps: z.number().int().nullable(),
  targetRepsRange: z.string().nullable(),
  restTime: z.string().nullable(),
  exercise: ExercisePlanSchema,
}).strict();

/**
 * One set row. `weightKg` / `reps` reuse `WeightKgSchema` / `RepsSchema`, whose bounds
 * mirror the `weight_sane` / `reps_sane` CHECK constraints on `session_sets`
 * (`db/schema/index.ts:154-155`), so "the contract accepted this state" and "the database
 * accepted this row" are the same event.
 */
export const SessionSetStateSchema = z.object({
  id: UuidSchema,
  sessionId: UuidSchema,
  exerciseId: UuidSchema,
  setIndex: NonNegativeIntegerSchema,
  isCompleted: z.boolean(),
  weightKg: WeightKgSchema.nullable(),
  reps: RepsSchema.nullable(),
  clientTs: TimestampSchema,
  updatedAt: TimestampSchema,
}).strict();

/** One phase-gate answer. `completedAt` is nullable: a task can be un-answered. */
export const SessionTaskStateSchema = z.object({
  id: UuidSchema,
  sessionId: UuidSchema,
  taskKey: TaskKeySchema,
  completedAt: NullableTimestampSchema,
  clientTs: TimestampSchema,
  updatedAt: TimestampSchema,
}).strict();

/**
 * The whole session graph — what `GET /api/sessions/[id]` and `POST /api/sessions` carry.
 * Those two are its only producers: `POST /api/sync` used to ship it in a `state` field no
 * client read, and #105 deleted that (see the comment on `SyncResponseDataSchema`).
 *
 * Until #73 this was `z.object({}).passthrough()`, an M2-01 placeholder. What a
 * placeholder cost was not only an API that validated nothing about the object the app is
 * most about; it was that `z.infer` became `Record<string, unknown>`, so a screen typed
 * against it compiled while reading `undefined` weights — and the only description of the
 * shape lived in one mapper (`lib/domain/sessions/mappers.ts:mapSessionState`).
 *
 * So this is transcribed from `lib/domain/sessions/types.ts` as that mapper actually
 * emits it, not from memory: the card's own history is a hand-drafted enum containing
 * values the database has never had. The summary half is literally `SessionSummarySchema`
 * (`.extend()` preserves `.strict()`), so the list response and the detail response cannot
 * disagree about what a session *is*, and the enums come from `./common` for the same
 * reason.
 *
 * Authority now runs the other way: the mapper's output is checked against this schema at
 * the route boundary, so a mapper that drifts fails there instead of shipping a body the
 * client then rejects.
 */
export const SessionStateSchema = SessionSummarySchema.extend({
  routineDay: z.object({
    id: UuidSchema,
    slug: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    exercises: z.array(RoutineExercisePlanSchema),
  }).strict(),
  sets: z.array(SessionSetStateSchema),
  tasks: z.array(SessionTaskStateSchema),
});

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
/**
 * A real type as of #73, where this used to infer `Record<string, unknown>` from a
 * passthrough placeholder. Note the one thing `z.infer` cannot express here: the graph
 * accepts a `Date` on input (the mapper's form) and yields an ISO string on output, so
 * `Date | string` is what the field's type is *not*.
 */
export type SessionState = z.infer<typeof SessionStateSchema>;
/**
 * The graph's sub-objects, named as `lib/domain/sessions/types.ts` names them — the same
 * convention that already makes `SessionSummary` / `SessionState` appear in both files. The
 * contract's version is the serialized one (`Date` in, ISO `string` out), which is the only
 * difference a reader has to hold in their head.
 */
export type ExercisePlan = z.infer<typeof ExercisePlanSchema>;
export type RoutineExercisePlan = z.infer<typeof RoutineExercisePlanSchema>;
export type SessionSetState = z.infer<typeof SessionSetStateSchema>;
export type SessionTaskState = z.infer<typeof SessionTaskStateSchema>;

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
