import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AppErrorSchema,
  AppEnvelopeSchema,
  appErrorEnvelope,
  createAppEnvelopeSchema,
  validationError,
} from '../../../lib/contracts/envelope.js';
import {
  AuthConfirmQuerySchema,
  SignInRequestSchema,
  SignInResponseSchema,
  SignoutRequestSchema,
  SignoutResponseSchema,
} from '../../../lib/contracts/auth.js';
import {
  PhaseAdvanceMutationSchema,
  SessionFinishMutationSchema,
  SetUpsertMutationSchema,
  SyncMutationSchema,
  SyncRequestSchema,
  SyncResponseSchema,
  TaskCompleteMutationSchema,
} from '../../../lib/contracts/sync.js';
import {
  SessionDetailParamsSchema,
  SessionDetailQuerySchema,
  SessionDetailResponseSchema,
  SessionStartRequestSchema,
  SessionStartResponseSchema,
  SessionsListQuerySchema,
  SessionsListResponseSchema,
} from '../../../lib/contracts/sessions.js';
import { ExerciseSchema, ExercisesListQuerySchema, ExercisesListResponseSchema } from '../../../lib/contracts/exercises.js';
import { ExerciseProgressParamsSchema, ExerciseProgressResponseSchema } from '../../../lib/contracts/progress.js';
import {
  ImportReportSchema,
  LegacyImportRequestSchema,
  LegacyImportResponseSchema,
  LegsWorkoutProgressSchema,
  PullDayProgressSchema,
  PushWorkoutProgressSchema,
} from '../../../lib/contracts/import.js';

const ids = {
  mutation: '11111111-1111-4111-8111-111111111111',
  session: '22222222-2222-4222-8222-222222222222',
  exercise: '33333333-3333-4333-8333-333333333333',
  device: '44444444-4444-4444-8444-444444444444',
};
const clientTs = '2026-09-08T12:00:00.000Z';

const setMutation = {
  op: 'set.upsert' as const,
  mutationId: ids.mutation,
  clientTs,
  sessionId: ids.session,
  exerciseId: ids.exercise,
  setIndex: 0,
  isCompleted: true,
  weightKg: 60.5,
  reps: 8,
};

describe('canonical AppError envelope', () => {
  it('keeps the existing typed error codes and exact error envelope shape', () => {
    const error = validationError();
    expect(AppErrorSchema.safeParse(error).success).toBe(true);
    expect(appErrorEnvelope(error)).toEqual({ ok: false, error });
    expect(AppEnvelopeSchema.safeParse(appErrorEnvelope(error)).success).toBe(true);
  });

  it('validates successful and failed generic envelopes', () => {
    const schema = createAppEnvelopeSchema(z.object({ message: z.string() }));
    expect(schema.safeParse({ ok: true, data: { message: 'done' } }).success).toBe(true);
    expect(schema.safeParse({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'bad', status: 400 } }).success).toBe(true);
    expect(schema.safeParse({ ok: false, data: {} }).success).toBe(false);
  });
});

describe('auth contracts', () => {
  it('accepts a trimmed email and rejects malformed or oversized email input', () => {
    expect(SignInRequestSchema.safeParse({ email: '  user@example.com ' }).success).toBe(true);
    expect(SignInRequestSchema.safeParse({ email: 'not-an-email' }).success).toBe(false);
    expect(SignInRequestSchema.safeParse({ email: `${'a'.repeat(250)}@x.com` }).success).toBe(false);
  });

  it('validates magic-link callback parameters and optional next without authorizing it', () => {
    expect(AuthConfirmQuerySchema.safeParse({ token_hash: 'hash', type: 'email', next: '/' }).success).toBe(true);
    expect(AuthConfirmQuerySchema.safeParse({ token_hash: '', type: 'email' }).success).toBe(false);
    expect(AuthConfirmQuerySchema.safeParse({ token_hash: 'hash', type: 'magiclink' }).success).toBe(false);
    expect(SignInResponseSchema.safeParse({ ok: true, data: { message: 'sent' } }).success).toBe(true);
    expect(SignoutRequestSchema.safeParse({}).success).toBe(true);
    expect(SignoutRequestSchema.safeParse({ userId: ids.session }).success).toBe(false);
    expect(SignoutResponseSchema.safeParse({ ok: true, data: { signedOut: true } }).success).toBe(true);
  });
});

describe('sync contracts', () => {
  it('parses a valid set.upsert and narrows the discriminated union', () => {
    const parsed = SyncMutationSchema.parse(setMutation);
    if (parsed.op !== 'set.upsert') throw new Error('Expected set.upsert variant');
    expect(parsed.weightKg).toBe(60.5);
    expect(parsed.reps).toBe(8);
  });

  it('enforces database-aligned numeric bounds and required fields', () => {
    expect(SetUpsertMutationSchema.safeParse({ ...setMutation, weightKg: 1500 }).success).toBe(false);
    expect(SetUpsertMutationSchema.safeParse({ ...setMutation, reps: -1 }).success).toBe(false);
    expect(SetUpsertMutationSchema.safeParse({ ...setMutation, sessionId: undefined }).success).toBe(false);
    expect(SetUpsertMutationSchema.safeParse({ ...setMutation, setIndex: 51 }).success).toBe(false);
  });

  it('accepts all four mutation variants through the canonical union', () => {
    const task = {
      op: 'task.complete' as const, mutationId: ids.mutation, clientTs, sessionId: ids.session,
      taskKey: 'warm_up' as const, completedAt: clientTs,
    };
    const phase = {
      op: 'phase.advance' as const, mutationId: ids.mutation, clientTs, sessionId: ids.session,
      phase: 'exercise' as const,
    };
    const finish = {
      op: 'session.finish' as const, mutationId: ids.mutation, clientTs, sessionId: ids.session,
    };
    expect(SyncMutationSchema.safeParse(task).success).toBe(true);
    expect(SyncMutationSchema.safeParse(phase).success).toBe(true);
    expect(SyncMutationSchema.safeParse(finish).success).toBe(true);
    expect(TaskCompleteMutationSchema.safeParse(task).success).toBe(true);
    expect(PhaseAdvanceMutationSchema.safeParse(phase).success).toBe(true);
    expect(SessionFinishMutationSchema.safeParse(finish).success).toBe(true);
    expect(SyncMutationSchema.safeParse({ ...setMutation, op: 'unknown' }).success).toBe(false);
  });

  it('caps sync batches at 200 mutations and uses the response envelope', () => {
    const request = { deviceId: ids.device, sinceSeq: 0, mutations: Array.from({ length: 201 }, () => setMutation) };
    expect(SyncRequestSchema.safeParse(request).success).toBe(false);
    expect(SyncRequestSchema.safeParse({ ...request, mutations: [setMutation] }).success).toBe(true);
    expect(SyncResponseSchema.safeParse({
      ok: true,
      data: { serverSeq: 1, applied: [ids.mutation], rejected: [], state: {}, clockSkewMs: 0 },
    }).success).toBe(true);
    expect(SyncResponseSchema.safeParse({
      ok: true,
      data: { serverSeq: -1, applied: [], rejected: [], state: {}, clockSkewMs: 0 },
    }).success).toBe(false);
  });
});

describe('session, exercise, and progress contracts', () => {
  it('validates session inputs at UUID and query boundaries', () => {
    expect(SessionsListQuerySchema.safeParse({ cursor: 'opaque-cursor' }).success).toBe(true);
    expect(SessionsListQuerySchema.safeParse({ cursor: '' }).success).toBe(false);
    expect(SessionStartRequestSchema.safeParse({ routineDayId: ids.session, clientId: ids.device }).success).toBe(true);
    expect(SessionStartRequestSchema.safeParse({ routineDayId: 'not-a-uuid', clientId: ids.device }).success).toBe(false);
    expect(SessionDetailParamsSchema.safeParse({ id: ids.session }).success).toBe(true);
    expect(SessionDetailQuerySchema.safeParse({ since: '12' }).success).toBe(true);
    expect(SessionDetailQuerySchema.safeParse({ since: '-1' }).success).toBe(false);
    const summary = {
      id: ids.session, routineDayId: ids.session, clientId: ids.device,
      status: 'in_progress' as const, phase: 'pre_workout' as const, source: 'app' as const,
      localDate: '2026-09-08', startedAt: clientTs, completedAt: null, serverSeq: 0, updatedAt: clientTs,
    };
    expect(SessionsListResponseSchema.safeParse({ ok: true, data: { sessions: [summary], nextCursor: null } }).success).toBe(true);
    expect(SessionStartResponseSchema.safeParse({ ok: true, data: {} }).success).toBe(true);
    expect(SessionDetailResponseSchema.safeParse({ ok: true, data: {} }).success).toBe(true);
  });

  it('validates exercise output and the no-input library query', () => {
    expect(ExercisesListQuerySchema.safeParse({}).success).toBe(true);
    const exercise = {
      id: ids.exercise,
      slug: 'bench-press',
      name: 'Bench Press',
      muscleGroups: ['chest'],
      equipment: null,
      formTips: null,
      videoUrl: null,
      alternatives: [],
    };
    expect(ExerciseSchema.safeParse(exercise).success).toBe(true);
    expect(ExercisesListResponseSchema.safeParse({ ok: true, data: { exercises: [exercise] } }).success).toBe(true);
    expect(ExerciseSchema.safeParse({ ...exercise, slug: 'invalid slug' }).success).toBe(false);
  });

  it('validates the progress path slug and response envelope', () => {
    expect(ExerciseProgressParamsSchema.safeParse({ exerciseSlug: 'bench-press' }).success).toBe(true);
    expect(ExerciseProgressParamsSchema.safeParse({ exerciseSlug: '../secret' }).success).toBe(false);
    expect(ExerciseProgressResponseSchema.safeParse({ ok: true, data: {
      exerciseSlug: 'bench-press', trendline: [], personalRecords: [],
    } }).success).toBe(true);
  });
});

describe('legacy import contracts', () => {
  it('validates the three divergent localStorage payloads', () => {
    expect(PushWorkoutProgressSchema.safeParse({
      currentPhase: 'main-workout', state: { mainWorkoutSets: { 'ex1-set1': true } },
    }).success).toBe(true);
    expect(LegsWorkoutProgressSchema.safeParse({
      currentPhase: 'exercise', state: {}, checkboxStates: {}, timerStates: { rest: { seconds: 90, isRunning: false } },
    }).success).toBe(true);
    expect(PullDayProgressSchema.safeParse({
      currentPhase: 'workout', completedSets: 2, completedExercises: 1, workoutStartTime: null,
      cardioTimeLeft: 300, cooldownTimeLeft: 600, checkboxStates: {}, stretchStates: {},
    }).success).toBe(true);
    expect(LegacyImportRequestSchema.safeParse({
      pushWorkoutProgress: JSON.stringify({ currentPhase: 'main-workout', state: {}, timestamp: 1 }),
      legsWorkoutProgress: '{not-json',
      userStats: JSON.stringify({ streak: 0 }),
    }).success).toBe(true);
    expect(LegacyImportRequestSchema.safeParse({}).success).toBe(false);
    expect(LegacyImportResponseSchema.safeParse({ ok: true, data: {
      report: { sessionsCreated: 1, setsRecovered: 2, fieldsNotRecovered: [] },
    } }).success).toBe(true);
  });

  it('validates import reports and rejects negative counts', () => {
    expect(ImportReportSchema.safeParse({ sessionsCreated: 1, setsRecovered: 2, fieldsNotRecovered: [] }).success).toBe(true);
    expect(ImportReportSchema.safeParse({ sessionsCreated: -1, setsRecovered: 2, fieldsNotRecovered: [] }).success).toBe(false);
    expect(PushWorkoutProgressSchema.safeParse({ currentPhase: 'main-workout', state: {}, timestamp: -1 }).success).toBe(false);
  });
});
