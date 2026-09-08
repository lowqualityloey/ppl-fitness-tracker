import { z } from 'zod';
import { createAppEnvelopeSchema } from './envelope.js';
import {
  IsoDateTimeSchema,
  LocalDateSchema,
  NonNegativeIntegerSchema,
  SessionPhaseSchema,
  SessionSourceSchema,
  SessionStatusSchema,
  UuidSchema,
} from './common.js';

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

export const SessionDetailQuerySchema = z.object({
  since: QuerySequenceSchema.optional(),
}).strict();

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
