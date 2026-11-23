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
  SyncRejectionSchema,
  SyncRequestSchema,
  SyncResponseDataSchema,
  SyncResponseSchema,
  TaskCompleteMutationSchema,
} from '../../../lib/contracts/sync.js';
import {
  PrefillDataSchema,
  PrefillEntrySchema,
  SessionDetailParamsSchema,
  SessionDetailQuerySchema,
  SessionDetailResponseSchema,
  SessionNotModifiedResponseSchema,
  SessionNotModifiedSchema,
  SessionPrefillQuerySchema,
  SessionPrefillResponseSchema,
  SessionStartRequestSchema,
  SessionStartResponseSchema,
  SessionsListQuerySchema,
  SessionsListResponseSchema,
} from '../../../lib/contracts/sessions.js';
import {
  PreferredUnitSchema,
  ProfileDataSchema,
  ProfilePatchSchema,
  ProfileResponseSchema,
} from '../../../lib/contracts/profile.js';
import { RepsSchema as CommonRepsSchema, WeightKgSchema as CommonWeightKgSchema } from '../../../lib/contracts/common.js';
import { mapperOutput } from './session-state-fixtures';
import { RepsSchema as SyncRepsSchema, WeightKgSchema as SyncWeightKgSchema } from '../../../lib/contracts/sync.js';
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

  it('rejects mixed-session batches before they reach the repository', () => {
    expect(SyncRequestSchema.safeParse({
      deviceId: ids.device,
      sinceSeq: 0,
      mutations: [
        setMutation,
        { ...setMutation, mutationId: ids.device, sessionId: ids.device },
      ],
    }).success).toBe(false);
  });

  it('caps sync batches at 200 mutations and uses the response envelope', () => {
    const request = { deviceId: ids.device, sinceSeq: 0, mutations: Array.from({ length: 201 }, () => setMutation) };
    expect(SyncRequestSchema.safeParse(request).success).toBe(false);
    expect(SyncRequestSchema.safeParse({ ...request, mutations: [setMutation] }).success).toBe(true);
    expect(SyncResponseSchema.safeParse({
      ok: true,
      data: { serverSeq: 1, applied: [ids.mutation], rejected: [], clockSkewMs: 0 },
    }).success).toBe(true);
    expect(SyncResponseSchema.safeParse({
      ok: true,
      data: { serverSeq: -1, applied: [], rejected: [], clockSkewMs: 0 },
    }).success).toBe(false);
  });

  /*
   * #105 — the removed field, asserted as a boundary rather than as an absence.
   *
   * Two assertions used to live in the block above, and both were about `state`: one accepted
   * `state: mapperOutput()`, the other refused `state: {}` because #73 had made an *empty* session
   * graph illegal. Re-aimed rather than deleted:
   *
   *  - the key list is pinned, so "the field is gone" is a counted fact about the schema instead
   *    of a sentence in a comment; and
   *  - `state` is refused **as an unknown key**, in both the shape the old test passed and the
   *    shape the deleted field actually had. `.strict()` is what turns that into a production
   *    control: a route that still emitted the field fails `validateOutgoing` with a redacted 500
   *    rather than shipping bytes the contract stopped describing.
   */
  it('describes the sync answer as four fields and refuses the one #105 removed', () => {
    expect(Object.keys(SyncResponseDataSchema.shape).sort()).toEqual(
      ['applied', 'clockSkewMs', 'rejected', 'serverSeq'],
    );
    const narrowed = { serverSeq: 1, applied: [ids.mutation], rejected: [], clockSkewMs: 0 };
    expect(SyncResponseDataSchema.safeParse(narrowed).success).toBe(true);
    // The pre-#105 prefill from the test directly above, unchanged in every other respect.
    expect(SyncResponseDataSchema.safeParse({ ...narrowed, state: mapperOutput() }).success).toBe(false);
    // And the exact fabrication `tests/e2e/session-runner.spec.ts` was built on: an object
    // *containing* a session, which this contract never described at any revision.
    expect(SyncResponseDataSchema.safeParse({
      ...narrowed,
      state: { session: { ...mapperOutput(), sets: [], tasks: [] } },
    }).success).toBe(false);
  });

  /*
   * #77 — the rejection item carries the sentence, not only the code.
   *
   * `reason` stays the machine truth: tests, metrics and any retry policy switch on it, and the
   * assertion below that a rejection *without* a code is refused is what keeps this additive
   * rather than a replacement. `message` is the domain error's own sentence, which the server
   * has always produced one call site away and used to discard.
   *
   * Required, not optional. The spec's §4.1 sketch wrote `max(200).optional()`; every server
   * rejection path has a sentence in hand, so an optional field would only put a fallback branch
   * back in the UI — the branch #77 exists to delete. The 200 cap is the sketch's, kept.
   */
  it('carries a sentence beside the rejection code, and refuses one that cannot explain itself', () => {
    const rejection = {
      mutationId: ids.mutation,
      reason: 'CONFLICT',
      message: 'Sets can only be changed during the main workout.',
    };
    expect(SyncRejectionSchema.safeParse(rejection).success).toBe(true);
    // Additive: the code is still required, so a sentence alone is not a rejection.
    expect(SyncRejectionSchema.safeParse({ mutationId: ids.mutation, message: rejection.message }).success).toBe(false);
    // And the sentence is required too — a code alone is the shape #77 was filed about.
    expect(SyncRejectionSchema.safeParse({ mutationId: ids.mutation, reason: 'CONFLICT' }).success).toBe(false);
    expect(SyncRejectionSchema.safeParse({ ...rejection, message: '' }).success).toBe(false);
    expect(SyncRejectionSchema.safeParse({ ...rejection, message: 'x'.repeat(201) }).success).toBe(false);
    expect(SyncRejectionSchema.safeParse({ ...rejection, message: 'x'.repeat(200) }).success).toBe(true);
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
    /*
     * These two lines are the shape of what #73 found. They used to read
     * `safeParse({ ok: true, data: {} }).success).toBe(true)` — a passing assertion that
     * the session *graph* accepted an empty object, because `SessionStateSchema` was
     * `z.object({}).passthrough()`. Flipping them to the real answer is tightening, not a
     * loosened gate: the envelope still passes, and only with a state the mapper would
     * recognize.
     */
    expect(SessionStartResponseSchema.safeParse({ ok: true, data: mapperOutput() }).success).toBe(true);
    expect(SessionDetailResponseSchema.safeParse({ ok: true, data: mapperOutput() }).success).toBe(true);
    expect(SessionStartResponseSchema.safeParse({ ok: true, data: {} }).success).toBe(false);
    expect(SessionDetailResponseSchema.safeParse({ ok: true, data: {} }).success).toBe(false);
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

describe('M3-00 profile contracts', () => {
  const profile = {
    userId: ids.session,
    email: 'athlete@example.com',
    displayName: 'Athlete',
    preferredUnit: 'kg' as const,
  };

  it('mirrors the weight_unit enum and keeps the response shape strict', () => {
    // The live enum is ('kg', 'lbs') — migration 0000, re-verified against the
    // local database. 'lb' (the RFC snippet's guess) must be a rejection, not
    // something a route quietly maps.
    expect(PreferredUnitSchema.safeParse('kg').success).toBe(true);
    expect(PreferredUnitSchema.safeParse('lbs').success).toBe(true);
    expect(PreferredUnitSchema.safeParse('lb').success).toBe(false);
    expect(PreferredUnitSchema.safeParse('LBS').success).toBe(false);
    expect(PreferredUnitSchema.safeParse('st').success).toBe(false);
    expect(ProfileDataSchema.safeParse(profile).success).toBe(true);
    expect(ProfileDataSchema.safeParse({ ...profile, displayName: null }).success).toBe(true);
    expect(ProfileDataSchema.safeParse({ ...profile, role: 'admin' }).success).toBe(false);
    expect(ProfileResponseSchema.safeParse({ ok: true, data: profile }).success).toBe(true);
  });

  it('accepts a trimmed non-empty displayName or preferredUnit, alone or together', () => {
    expect(ProfilePatchSchema.safeParse({ preferredUnit: 'lbs' }).success).toBe(true);
    expect(ProfilePatchSchema.safeParse({ preferredUnit: 'lb' }).success).toBe(false);
    expect(ProfilePatchSchema.safeParse({ displayName: 'Jo' }).success).toBe(true);
    expect(ProfilePatchSchema.safeParse({ displayName: 'Jo', preferredUnit: 'kg' }).success).toBe(true);
    // .trim() is a transform, not just a validator: the route must never store padding.
    expect(ProfilePatchSchema.parse({ displayName: '  Jo  ' }).displayName).toBe('Jo');
  });

  it('rejects an empty patch, a blank displayName, and an unknown key naming email', () => {
    const empty = ProfilePatchSchema.safeParse({});
    expect(empty.success).toBe(false);
    if (!empty.success) expect(empty.error.issues[0]!.message).toMatch(/displayName, preferredUnit/);
    expect(ProfilePatchSchema.safeParse({ displayName: '   ' }).success).toBe(false);
    expect(ProfilePatchSchema.safeParse({ displayName: 'x'.repeat(81) }).success).toBe(false);

    // STATE §4 item 23: email is not client-editable, and "not editable here"
    // must surface as a 400 naming the key — never a silently dropped field.
    const withEmail = ProfilePatchSchema.safeParse({ email: 'x@y.z' });
    expect(withEmail.success).toBe(false);
    if (!withEmail.success) {
      expect(withEmail.error.issues[0]!.code).toBe('unrecognized_keys');
      expect(JSON.stringify(withEmail.error.issues)).toContain('email');
    }
  });
});

describe('M3-00 prefill contracts', () => {
  const entry = {
    exerciseId: ids.exercise,
    setIndex: 0,
    weightKg: 60.5,
    reps: 8,
    sourceLocalDate: '2026-09-08',
  };

  it('requires routineDayId and rejects the [id]-shadowing shape', () => {
    expect(SessionPrefillQuerySchema.safeParse({ routineDayId: ids.session }).success).toBe(true);
    expect(SessionPrefillQuerySchema.safeParse({
      routineDayId: ids.session, excludeSessionId: ids.device,
    }).success).toBe(true);
    expect(SessionPrefillQuerySchema.safeParse({}).success).toBe(false);
    expect(SessionPrefillQuerySchema.safeParse({ routineDayId: 'not-a-uuid' }).success).toBe(false);
    expect(SessionPrefillQuerySchema.safeParse({ excludeSessionId: 'nope' }).success).toBe(false);
    // If /api/sessions/prefill is ever shadowed by /api/sessions/[id], the request
    // arrives parsed as {id} — this is the assertion that names the symptom.
    expect(SessionPrefillQuerySchema.safeParse({ id: 'prefill' }).success).toBe(false);
  });

  it('carries provenance and keeps weight canonical kg (ADR-0005)', () => {
    expect(PrefillEntrySchema.safeParse(entry).success).toBe(true);
    // Either value may be null (a legacy slot with reps only, or bodyweight);
    // the repository rule "omit only when BOTH are null" is tested at that seam.
    expect(PrefillEntrySchema.safeParse({ ...entry, weightKg: null }).success).toBe(true);
    expect(PrefillEntrySchema.safeParse({ ...entry, reps: null }).success).toBe(true);
    expect(PrefillEntrySchema.safeParse({ ...entry, setIndex: -1 }).success).toBe(false);
    expect(PrefillEntrySchema.safeParse({ ...entry, weightKg: 1000.01 }).success).toBe(false);
    expect(PrefillEntrySchema.safeParse({ ...entry, reps: 8.5 }).success).toBe(false);
    expect(PrefillEntrySchema.safeParse({ ...entry, sourceLocalDate: '2026-9-8' }).success).toBe(false);
    expect(PrefillEntrySchema.safeParse({ ...entry, sourceSessionId: ids.session }).success).toBe(false);
  });

  it('allows an empty first-timer result and validates the envelope', () => {
    const data = { entries: [entry], sourceSessionId: ids.session, sourceLocalDate: '2026-09-08' };
    expect(PrefillDataSchema.safeParse(data).success).toBe(true);
    expect(PrefillDataSchema.safeParse({ entries: [], sourceSessionId: null, sourceLocalDate: null }).success).toBe(true);
    expect(PrefillDataSchema.safeParse({ ...data, unexpected: 1 }).success).toBe(false);
    expect(SessionPrefillResponseSchema.safeParse({ ok: true, data }).success).toBe(true);
  });
});

describe('M3-01 session detail delta contracts', () => {
  it('accepts since as a numeric string or number and normalizes both to a number', () => {
    expect(SessionDetailQuerySchema.safeParse({}).success).toBe(true);
    expect(SessionDetailQuerySchema.parse({ since: '12' })).toEqual({ since: 12 });
    expect(SessionDetailQuerySchema.parse({ since: 0 })).toEqual({ since: 0 });
    expect(SessionDetailQuerySchema.safeParse({ since: 'not-a-number' }).success).toBe(false);
    expect(SessionDetailQuerySchema.safeParse({ since: '-1' }).success).toBe(false);
    expect(SessionDetailQuerySchema.safeParse({ since: '1.5' }).success).toBe(false);
    expect(SessionDetailQuerySchema.safeParse({ updatedAfter: '2026-09-08' }).success).toBe(false);
  });

  it('answers unchanged with the seq only — a session body cannot be attached', () => {
    expect(SessionNotModifiedSchema.safeParse({ notModified: true, serverSeq: 7 }).success).toBe(true);
    expect(SessionNotModifiedSchema.parse({ notModified: true, serverSeq: '7' })).toEqual({
      notModified: true, serverSeq: 7,
    });
    expect(SessionNotModifiedSchema.safeParse({ notModified: false, serverSeq: 7 }).success).toBe(false);
    expect(SessionNotModifiedSchema.safeParse({ notModified: true }).success).toBe(false);
    // The whole point of "a poll costs almost nothing": extra payload keys are rejected.
    expect(SessionNotModifiedSchema.safeParse({
      notModified: true, serverSeq: 7, session: { any: 'state' },
    }).success).toBe(false);
    expect(SessionNotModifiedResponseSchema.safeParse({
      ok: true, data: { notModified: true, serverSeq: 7 },
    }).success).toBe(true);
  });
});

describe('hoisted scalar schemas have one identity', () => {
  // STATE §4 item 22: sessions.ts must never import sync.ts; common.ts owns the
  // scalars and sync.ts re-exports. If the re-export were ever a re-declaration,
  // database-aligned bounds could drift between the two "WeightKgSchema"s.
  it('re-exports the same WeightKgSchema/RepsSchema objects from sync.ts', () => {
    expect(SyncWeightKgSchema).toBe(CommonWeightKgSchema);
    expect(SyncRepsSchema).toBe(CommonRepsSchema);
  });
});
