import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { createDb, type DbHandle } from '../../../lib/db/client.js';
import type { JwtClaims } from '../../../lib/db/with-user.js';
import type { SyncRequest } from '../../../lib/contracts/sync.js';
import { SyncRequestSchema } from '../../../lib/contracts/sync.js';
import { InvalidSessionCursorError, SessionConflictError, SessionNotFoundError, SessionValidationError } from '../../../lib/domain/sessions/types.js';
import { ProgressionValidationError } from '../../../lib/domain/progression/types.js';
import { canonicalMutationHash } from '../../../lib/domain/sync/sync-engine.js';
import { SessionEngine } from '../../../lib/domain/sessions/session-engine.js';
import { WorkoutRepository } from '../../../lib/repositories/workout-repository.js';
import { requireRow } from '../test-helpers.js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const OWNER_URL = process.env.MIGRATION_DATABASE_URL;
const APP_URL = process.env.DATABASE_URL;
const TEST_PASSWORD = 'm2-repository-test-password';

interface CreatedUser {
  id: string;
}

interface JwtPayload extends JwtClaims {
  aud: string;
}

function decodeJwtPayload(token: string): JwtPayload {
  const encoded = token.split('.')[1];
  if (!encoded) throw new Error('Supabase did not return a JWT payload.');
  return JSON.parse(
    Buffer.from(encoded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
  ) as JwtPayload;
}

async function createAuthenticatedUser(email: string): Promise<{ userId: string; claims: JwtClaims }> {
  const created = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password: TEST_PASSWORD, email_confirm: true }),
  });
  const createdBody = await created.json() as CreatedUser;
  if (!created.ok || typeof createdBody.id !== 'string') {
    throw new Error(`Could not create repository test user (${created.status}).`);
  }

  const signedIn = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: TEST_PASSWORD }),
  });
  const signedInBody = await signedIn.json() as { access_token?: string };
  if (!signedIn.ok || !signedInBody.access_token) {
    throw new Error(`Could not sign in repository test user (${signedIn.status}).`);
  }

  const claims = decodeJwtPayload(signedInBody.access_token);
  if (claims.sub !== createdBody.id) {
    throw new Error('Repository test JWT subject did not match the created user.');
  }

  return { userId: createdBody.id, claims };
}

describe('WorkoutRepository', () => {
  let owner: Client;
  let app: DbHandle;
  let userId: string;
  let claims: JwtClaims;
  let secondUserId: string;
  let secondClaims: JwtClaims;
  let routineDayId: string;
  let exerciseId: string;
  let email: string;
  let secondEmail: string;
  let repository: WorkoutRepository;
  let secondRepository: WorkoutRepository;
  let engine: SessionEngine;

  beforeAll(async () => {
    if (!OWNER_URL || !APP_URL) {
      throw new Error('MIGRATION_DATABASE_URL and DATABASE_URL are required for repository integration tests.');
    }

    owner = new Client({ connectionString: OWNER_URL });
    await owner.connect();
    app = createDb(APP_URL);

    email = `m2-repository-${randomUUID()}@example.com`;
    ({ userId, claims } = await createAuthenticatedUser(email));
    secondEmail = `m2-repository-second-${randomUUID()}@example.com`;
    ({ userId: secondUserId, claims: secondClaims } = await createAuthenticatedUser(secondEmail));

    const routineDay = await owner.query<{ id: string }>(
      `INSERT INTO routine_days (slug, name, description, owner_user_id)
       VALUES ($1, 'Repository Test Day', 'Repository test fixture', NULL)
       RETURNING id`,
      [`m2-repository-${randomUUID()}`],
    );
    routineDayId = requireRow(routineDay.rows, 'repository test routine day').id;

    const exercise = await owner.query<{ id: string }>(
      `INSERT INTO exercises (
         slug, name, muscle_groups, equipment, form_tips, beginner_notes,
         video_url, alternatives, kind, duration_seconds, owner_user_id
       )
       VALUES ($1, 'Repository Test Exercise', ARRAY['test'], NULL, NULL, NULL, NULL, ARRAY[]::text[], 'strength', NULL, NULL)
       RETURNING id`,
      [`m2-repository-${randomUUID()}`],
    );
    exerciseId = requireRow(exercise.rows, 'repository test exercise').id;

    await owner.query(
      `INSERT INTO routine_exercises (
         routine_day_id, exercise_id, phase, order_index, target_sets,
         target_reps, target_reps_range, rest_time
       )
       VALUES ($1, $2, 'main_workout', 0, 3, 8, '8-10', '90s')`,
      [routineDayId, exerciseId],
    );

    repository = new WorkoutRepository(app.db, claims);
    secondRepository = new WorkoutRepository(app.db, secondClaims);
    engine = new SessionEngine(repository);
  });

  async function beginExerciseSession(localDate: string): Promise<{ id: string; clientTs: Date }> {
    const session = await engine.start(userId, routineDayId, randomUUID(), localDate);
    const clientTs = new Date(`${localDate}T12:00:00.000Z`);
    await engine.completeTask(userId, {
      sessionId: session.id,
      taskKey: 'warm_up',
      completedAt: clientTs,
      clientTs,
    });
    await engine.advancePhase(userId, { sessionId: session.id, phase: 'exercise' });
    return { id: session.id, clientTs };
  }

  afterAll(async () => {
    if (userId) {
      await owner.query('DELETE FROM personal_records WHERE user_id = $1', [userId]);
    }
    if (secondUserId) {
      await owner.query('DELETE FROM personal_records WHERE user_id = $1', [secondUserId]);
    }
    if (routineDayId) {
      await owner.query('DELETE FROM workout_sessions WHERE routine_day_id = $1', [routineDayId]);
    }
    if (userId) {
      await owner.query('DELETE FROM profiles WHERE id = $1', [userId]);
      await owner.query('DELETE FROM auth.users WHERE id = $1', [userId]);
    }
    if (secondUserId) {
      await owner.query('DELETE FROM profiles WHERE id = $1', [secondUserId]);
      await owner.query('DELETE FROM auth.users WHERE id = $1', [secondUserId]);
    }
    if (routineDayId) {
      await owner.query('DELETE FROM routine_days WHERE id = $1', [routineDayId]);
    }
    if (exerciseId) {
      await owner.query('DELETE FROM exercises WHERE id = $1', [exerciseId]);
    }
    await app?.pool.end();
    await owner?.end();
  });

  it('starts idempotently and hydrates the complete session graph in the app role', async () => {
    const clientId = randomUUID();
    const localDate = '2026-09-08';

    const first = await repository.startSession(userId, routineDayId, clientId, localDate);
    const repeated = await repository.startSession(userId, routineDayId, clientId, localDate);
    const byClient = await repository.findByClientId(userId, clientId);
    const byId = await repository.findSession(userId, first.id);

    expect(first.id).toBe(repeated.id);
    expect(first.id).toBe(byClient?.id);
    expect(byId).toMatchObject({
      id: first.id,
      routineDayId,
      clientId,
      localDate,
      status: 'in_progress',
      routineDay: {
        id: routineDayId,
        exercises: [{
          id: expect.any(String),
          orderIndex: 0,
          targetSets: 3,
          targetReps: 8,
          targetRepsRange: '8-10',
          restTime: '90s',
          exercise: { id: exerciseId, name: 'Repository Test Exercise' },
        }],
      },
      sets: [],
      tasks: [],
    });
  });

  it('keeps repository reads explicitly scoped to the authenticated user', async () => {
    const foreign = await secondRepository.startSession(
      secondUserId,
      routineDayId,
      randomUUID(),
      '2026-09-09',
    );

    expect(await repository.findSession(userId, foreign.id)).toBeNull();
    expect((await repository.listSessions(userId)).sessions.map((session) => session.id))
      .not.toContain(foreign.id);
    expect((await secondRepository.listSessions(secondUserId)).sessions.map((session) => session.id))
      .toContain(foreign.id);

    await owner.query(
      `INSERT INTO personal_records (user_id, exercise_id, best_e1rm, achieved_at)
       VALUES ($1, $2, 100.00, $3)`,
      [secondUserId, exerciseId, new Date('2026-09-09T12:00:00.000Z')],
    );
    expect(await repository.findPersonalRecord(userId, exerciseId)).toBeNull();
    expect(await secondRepository.findPersonalRecord(secondUserId, exerciseId)).toMatchObject({
      exerciseId,
      bestE1rm: 100,
      sessionId: null,
    });
  });

  it('resolves concurrent duplicate-client and active-day starts to one session', async () => {
    const sameClient = randomUUID();
    const duplicateClientStarts = await Promise.all([
      repository.startSession(userId, routineDayId, sameClient, '2026-11-01'),
      repository.startSession(userId, routineDayId, sameClient, '2026-11-01'),
    ]);

    expect(new Set(duplicateClientStarts.map((session) => session.id)).size).toBe(1);

    const activeDayStarts = await Promise.all([
      repository.startSession(userId, routineDayId, randomUUID(), '2026-11-02'),
      repository.startSession(userId, routineDayId, randomUUID(), '2026-11-02'),
    ]);

    expect(new Set(activeDayStarts.map((session) => session.id)).size).toBe(1);
  });

  it('returns deterministic multi-page history with a validated cursor', async () => {
    for (let index = 1; index <= 21; index += 1) {
      await repository.startSession(
        userId,
        routineDayId,
        randomUUID(),
        `2027-01-${String(index).padStart(2, '0')}`,
      );
    }

    const firstPage = await repository.listSessions(userId);
    expect(firstPage.sessions).toHaveLength(20);
    expect(firstPage.nextCursor).toEqual(expect.any(String));

    const secondPage = await repository.listSessions(userId, {
      cursor: firstPage.nextCursor ?? undefined,
    });
    expect(secondPage.sessions.length).toBeGreaterThan(0);
    expect(secondPage.nextCursor).toBeNull();
    const firstDate = firstPage.sessions[0]?.localDate;
    const secondDate = secondPage.sessions[0]?.localDate;
    expect(firstDate !== undefined && secondDate !== undefined && firstDate > secondDate).toBe(true);

    const malformedCursor = Buffer.from(JSON.stringify({ localDate: 'not-a-date', id: 'not-a-uuid' }))
      .toString('base64url');
    await expect(repository.listSessions(userId, { cursor: malformedCursor }))
      .rejects.toBeInstanceOf(InvalidSessionCursorError);
  });

  it('filters history by an inclusive local_date range', async () => {
    // The 21 sessions above run 2027-01-01..2027-01-21. This narrows to a 6-day window and pins
    // both ends as inclusive: from=to is one day, not an empty window.
    const inRange = await repository.listSessions(userId, { from: '2027-01-05', to: '2027-01-10' });
    expect(inRange.sessions.map((session) => session.localDate)).toEqual([
      '2027-01-10',
      '2027-01-09',
      '2027-01-08',
      '2027-01-07',
      '2027-01-06',
      '2027-01-05',
    ]);
    expect(inRange.nextCursor).toBeNull();

    const oneDay = await repository.listSessions(userId, { from: '2027-01-07', to: '2027-01-07' });
    expect(oneDay.sessions.map((session) => session.localDate)).toEqual(['2027-01-07']);

    // Each end alone is a half-open window: the missing end is absent, not defaulted.
    expect(
      (await repository.listSessions(userId, { from: '2027-01-18' })).sessions.map(
        (session) => session.localDate,
      ),
    ).toEqual(['2027-01-21', '2027-01-20', '2027-01-19', '2027-01-18']);
    // The upper end is asserted as a bound, not as a total: earlier tests in this file left this
    // user sessions on 2026-11-01/02, and they are legitimately inside "everything up to
    // 2027-01-03". What the end must do is cut the January log at the third.
    const upToThird = await repository.listSessions(userId, { to: '2027-01-03' });
    expect(upToThird.sessions.slice(0, 3).map((session) => session.localDate)).toEqual([
      '2027-01-03',
      '2027-01-02',
      '2027-01-01',
    ]);
    expect(upToThird.sessions.every((session) => session.localDate <= '2027-01-03')).toBe(true);

    // A window that matches nothing is an empty page — not an error, and not the whole log.
    expect(await repository.listSessions(userId, { from: '2027-02-01', to: '2027-02-28' })).toEqual({
      sessions: [],
      nextCursor: null,
    });
  });

  it('materializes a source-linked PR, preserves higher records, and recomputes edited sets', async () => {
    const { id: sessionId, clientTs } = await beginExerciseSession('2028-03-01');

    await engine.completeSet(userId, {
      sessionId,
      exerciseId,
      setIndex: 0,
      isCompleted: true,
      weightKg: 60,
      reps: 8,
      clientTs,
    });
    const initial = await repository.findPersonalRecord(userId, exerciseId);
    expect(initial).toMatchObject({
      exerciseId,
      bestE1rm: 76,
      achievedAt: clientTs,
      sessionId,
    });

    await engine.completeSet(userId, {
      sessionId,
      exerciseId,
      setIndex: 1,
      isCompleted: true,
      weightKg: 50,
      reps: 8,
      clientTs,
    });
    expect(await repository.findPersonalRecord(userId, exerciseId)).toEqual(initial);

    await engine.completeSet(userId, {
      sessionId,
      exerciseId,
      setIndex: 0,
      isCompleted: true,
      weightKg: 40,
      reps: 8,
      clientTs: new Date('2028-03-01T13:00:00.000Z'),
    });
    expect(await repository.findPersonalRecord(userId, exerciseId)).toMatchObject({
      exerciseId,
      bestE1rm: 63.33,
      achievedAt: clientTs,
      sessionId,
    });
  });

  it('preserves valid zero/null/incomplete logs without creating a zero PR', async () => {
    await owner.query(
      'DELETE FROM session_sets WHERE user_id = $1 AND exercise_id = $2',
      [userId, exerciseId],
    );
    await owner.query(
      'DELETE FROM personal_records WHERE user_id = $1 AND exercise_id = $2',
      [userId, exerciseId],
    );
    const { id: sessionId, clientTs } = await beginExerciseSession('2028-03-02');
    const inputs = [
      { setIndex: 0, weightKg: null, reps: 8 },
      { setIndex: 1, weightKg: 0, reps: 8 },
      { setIndex: 2, weightKg: 60, reps: 0 },
    ] as const;

    for (const input of inputs) {
      await engine.completeSet(userId, {
        sessionId,
        exerciseId,
        isCompleted: true,
        clientTs,
        ...input,
      });
    }

    expect(await repository.findPersonalRecord(userId, exerciseId)).toBeNull();
    expect((await repository.findSession(userId, sessionId))?.sets).toHaveLength(3);
  });

  it('rolls back both the set and PR when a later transaction operation fails', async () => {
    await owner.query(
      'DELETE FROM session_sets WHERE user_id = $1 AND exercise_id = $2',
      [userId, exerciseId],
    );
    await owner.query(
      'DELETE FROM personal_records WHERE user_id = $1 AND exercise_id = $2',
      [userId, exerciseId],
    );
    const { id: sessionId, clientTs } = await beginExerciseSession('2028-03-03');

    await expect(repository.mutateSession(userId, sessionId, async (mutation) => {
      await mutation.upsertSet({
        exerciseId,
        setIndex: 0,
        isCompleted: true,
        weightKg: 60,
        reps: 8,
        clientTs,
      });
      throw new Error('forced progression failure');
    })).rejects.toThrow('forced progression failure');

    expect((await repository.findSession(userId, sessionId))?.sets).toEqual([]);
    expect(await repository.findPersonalRecord(userId, exerciseId)).toBeNull();
  });

  it('serializes concurrent PR natural-key writers and keeps the global maximum', async () => {
    await owner.query(
      'DELETE FROM session_sets WHERE user_id = $1 AND exercise_id = $2',
      [userId, exerciseId],
    );
    await owner.query(
      'DELETE FROM personal_records WHERE user_id = $1 AND exercise_id = $2',
      [userId, exerciseId],
    );
    const [first, second] = await Promise.all([
      beginExerciseSession('2028-03-04'),
      beginExerciseSession('2028-03-05'),
    ]);

    await Promise.all([
      engine.completeSet(userId, {
        sessionId: first.id,
        exerciseId,
        setIndex: 0,
        isCompleted: true,
        weightKg: 80,
        reps: 5,
        clientTs: first.clientTs,
      }),
      engine.completeSet(userId, {
        sessionId: second.id,
        exerciseId,
        setIndex: 0,
        isCompleted: true,
        weightKg: 60,
        reps: 8,
        clientTs: second.clientTs,
      }),
    ]);

    expect(await repository.findPersonalRecord(userId, exerciseId)).toMatchObject({
      exerciseId,
      bestE1rm: 93.33,
      sessionId: first.id,
      achievedAt: first.clientTs,
    });
  });

  it('rolls back a bounds-valid set when its e1RM exceeds PR storage capacity', async () => {
    await owner.query(
      'DELETE FROM session_sets WHERE user_id = $1 AND exercise_id = $2',
      [userId, exerciseId],
    );
    await owner.query(
      'DELETE FROM personal_records WHERE user_id = $1 AND exercise_id = $2',
      [userId, exerciseId],
    );
    const { id: sessionId } = await beginExerciseSession('2028-03-06');

    await expect(engine.completeSet(userId, {
      sessionId,
      exerciseId,
      setIndex: 0,
      isCompleted: true,
      weightKg: 1000,
      reps: 1000,
    })).rejects.toBeInstanceOf(ProgressionValidationError);

    expect((await repository.findSession(userId, sessionId))?.sets).toEqual([]);
    expect(await repository.findPersonalRecord(userId, exerciseId)).toBeNull();
  });

  it('runs a legal lifecycle atomically through completion', async () => {
    const clientTs = new Date('2028-02-01T12:00:00.000Z');
    const session = await engine.start(userId, routineDayId, randomUUID(), '2028-02-01');

    await engine.completeTask(userId, {
      sessionId: session.id,
      taskKey: 'warm_up',
      completedAt: clientTs,
      clientTs,
    });
    expect((await repository.findSession(userId, session.id))?.phase).toBe('pre_workout');

    await engine.advancePhase(userId, { sessionId: session.id, phase: 'exercise' });
    for (const setIndex of [0, 1, 2]) {
      await engine.completeSet(userId, {
        sessionId: session.id,
        exerciseId,
        setIndex,
        isCompleted: true,
        weightKg: 60.5,
        reps: 8,
        clientTs,
      });
    }
    await engine.completeTask(userId, {
      sessionId: session.id,
      taskKey: 'main_workout',
      completedAt: clientTs,
      clientTs,
    });
    await engine.advancePhase(userId, { sessionId: session.id, phase: 'stretch' });
    await engine.completeTask(userId, {
      sessionId: session.id,
      taskKey: 'stretch',
      completedAt: clientTs,
      clientTs,
    });
    await engine.advancePhase(userId, { sessionId: session.id, phase: 'post_workout' });

    const completed = await engine.finish(userId, {
      sessionId: session.id,
      completedAt: new Date('2028-02-01T13:00:00.000Z'),
    });

    expect(completed).toMatchObject({
      id: session.id,
      status: 'completed',
      phase: 'post_workout',
      completedAt: new Date('2028-02-01T13:00:00.000Z'),
      sets: [
        { exerciseId, setIndex: 0, isCompleted: true, weightKg: 60.5, reps: 8 },
        { exerciseId, setIndex: 1, isCompleted: true, weightKg: 60.5, reps: 8 },
        { exerciseId, setIndex: 2, isCompleted: true, weightKg: 60.5, reps: 8 },
      ],
      tasks: [
        { taskKey: 'warm_up', completedAt: clientTs },
        { taskKey: 'main_workout', completedAt: clientTs },
        { taskKey: 'stretch', completedAt: clientTs },
      ],
    });
  });

  it('rejects gated and every terminal mutation without changing session state', async () => {
    const gated = await engine.start(userId, routineDayId, randomUUID(), '2028-02-02');
    await expect(engine.advancePhase(userId, { sessionId: gated.id, phase: 'exercise' }))
      .rejects.toBeInstanceOf(SessionConflictError);
    expect(await repository.findSession(userId, gated.id)).toMatchObject({
      phase: 'pre_workout',
      status: 'in_progress',
      sets: [],
      tasks: [],
    });

    const terminalMutations = [
      (sessionId: string) => engine.completeSet(userId, {
        sessionId,
        exerciseId,
        setIndex: 0,
        isCompleted: true,
        weightKg: 60,
        reps: 8,
      }),
      (sessionId: string) => engine.completeTask(userId, {
        sessionId,
        taskKey: 'warm_up',
        completedAt: new Date('2028-02-03T12:00:00.000Z'),
      }),
      (sessionId: string) => engine.advancePhase(userId, { sessionId, phase: 'exercise' }),
      (sessionId: string) => engine.finish(userId, {
        sessionId,
        completedAt: new Date('2028-02-03T13:00:00.000Z'),
      }),
    ];

    let dateIndex = 3;
    for (const status of ['completed', 'archived'] as const) {
      for (const mutate of terminalMutations) {
        const localDate = `2028-02-${String(dateIndex).padStart(2, '0')}`;
        dateIndex += 1;
        const terminal = await engine.start(userId, routineDayId, randomUUID(), localDate);
        await owner.query(
          `UPDATE workout_sessions
           SET status = $2, completed_at = $3
           WHERE id = $1`,
          [terminal.id, status, new Date(`${localDate}T13:00:00.000Z`)],
        );

        await expect(mutate(terminal.id)).rejects.toBeInstanceOf(SessionConflictError);
        expect(await repository.findSession(userId, terminal.id)).toMatchObject({
          status,
          phase: 'pre_workout',
          sets: [],
          tasks: [],
        });
      }
    }
  });

  it('rejects foreign sessions and invalid exercise/set values without writes', async () => {
    const foreign = await secondRepository.startSession(
      secondUserId,
      routineDayId,
      randomUUID(),
      '2028-02-04',
    );
    await expect(engine.completeSet(userId, {
      sessionId: foreign.id,
      exerciseId,
      setIndex: 0,
      isCompleted: true,
      weightKg: 60,
      reps: 8,
    })).rejects.toBeInstanceOf(SessionNotFoundError);

    const active = await engine.start(userId, routineDayId, randomUUID(), '2028-02-05');
    await engine.completeTask(userId, {
      sessionId: active.id,
      taskKey: 'warm_up',
      completedAt: new Date('2028-02-05T12:00:00.000Z'),
    });
    await engine.advancePhase(userId, { sessionId: active.id, phase: 'exercise' });
    const base = {
      sessionId: active.id,
      exerciseId,
      setIndex: 0,
      isCompleted: true,
      weightKg: 60,
      reps: 8,
    };
    await expect(engine.completeSet(userId, { ...base, setIndex: 3 }))
      .rejects.toBeInstanceOf(SessionValidationError);
    await expect(engine.completeSet(userId, { ...base, weightKg: -1 }))
      .rejects.toBeInstanceOf(SessionValidationError);
    await expect(engine.completeSet(userId, { ...base, reps: 1001 }))
      .rejects.toBeInstanceOf(SessionValidationError);
    await expect(engine.completeSet(userId, { ...base, exerciseId: randomUUID() }))
      .rejects.toBeInstanceOf(SessionNotFoundError);
    expect((await repository.findSession(userId, active.id))?.sets).toEqual([]);
  });

  it('rolls back set and task writes when a later mutation fails', async () => {
    const session = await engine.start(userId, routineDayId, randomUUID(), '2028-02-06');
    const clientTs = new Date('2028-02-06T12:00:00.000Z');

    await expect(repository.mutateSession(userId, session.id, async (mutation) => {
      await mutation.completeTask({
        taskKey: 'warm_up',
        completedAt: clientTs,
        clientTs,
      });
      expect(mutation.state.tasks).toMatchObject([
        { taskKey: 'warm_up', completedAt: clientTs },
      ]);

      await mutation.advancePhase('exercise');
      expect(mutation.state.phase).toBe('exercise');

      await mutation.upsertSet({
        exerciseId,
        setIndex: 0,
        isCompleted: true,
        weightKg: 60,
        reps: 8,
        clientTs,
      });
      await mutation.completeTask({
        taskKey: 'main_workout',
        completedAt: clientTs,
        clientTs,
      });
      await expect(mutation.advancePhase('post_workout'))
        .rejects.toBeInstanceOf(SessionValidationError);
      throw new Error('forced lifecycle failure');
    })).rejects.toThrow('forced lifecycle failure');

    expect(await repository.findSession(userId, session.id)).toMatchObject({
      sets: [],
      tasks: [],
      status: 'in_progress',
      phase: 'pre_workout',
    });
  });

  it('applies all sync metadata atomically and makes replay side-effect free', async () => {
    const { id: sessionId } = await beginExerciseSession('2028-03-10');
    const mutation: SyncRequest['mutations'][number] = {
      op: 'set.upsert',
      mutationId: randomUUID(),
      clientTs: '2026-09-08T12:00:00.000Z',
      sessionId,
      exerciseId,
      setIndex: 0,
      isCompleted: true,
      weightKg: 60,
      reps: 8,
    };
    const input: SyncRequest = { deviceId: randomUUID(), sinceSeq: 0, mutations: [mutation] };

    const first = await repository.applySync(userId, input);
    const replay = await repository.applySync(userId, input);

    expect(first).toMatchObject({
      serverSeq: 1,
      applied: [mutation.mutationId],
      rejected: [],
    });
    expect(replay).toMatchObject({ serverSeq: 1, applied: [mutation.mutationId], rejected: [] });
    /*
     * #105: `first.state` used to satisfy the two assertions below from inside the batch answer —
     * i.e. the response that reported the write was also the thing being checked for the write.
     * `findSession` is where stored state is promised, so the same expectations now run against
     * it. Nothing was weakened to get here: the row-count line was already reading the database.
     */
    const persisted = await repository.findSession(userId, sessionId);
    expect(persisted).toMatchObject({
      id: sessionId,
      serverSeq: 1,
      sets: [{ exerciseId, setIndex: 0, weightKg: 60 }],
    });
    expect(persisted?.sets).toHaveLength(1);

    const metadata = await owner.query<{ status: string; server_seq: number; entity_key: string }>(
      `SELECT m.status, m.server_seq, c.entity_key
       FROM sync_mutations m
       JOIN sync_changes c ON c.mutation_id = m.mutation_id
       WHERE m.mutation_id = $1`,
      [mutation.mutationId],
    );
    expect(metadata.rows).toEqual([{ status: 'applied', server_seq: 1, entity_key: `set:${exerciseId}:0` }]);
  });

  it('stores the client sequence beside the version it decided (#78)', async () => {
    const { id: sessionId } = await beginExerciseSession('2028-03-21');
    const mutation: SyncRequest['mutations'][number] = {
      op: 'set.upsert',
      mutationId: randomUUID(),
      clientTs: '2026-09-08T12:00:00.000Z',
      sessionId,
      exerciseId,
      setIndex: 0,
      isCompleted: true,
      weightKg: 62.5,
      reps: 8,
      // The number the outbox gave this tap. Cheap to carry and the only record of the order
      // the device saw, so losing it is not recoverable later from anything else on the row.
      clientSeq: 4,
    };

    const result = await repository.applySync(userId, {
      deviceId: randomUUID(),
      sinceSeq: 0,
      mutations: [mutation],
    });
    expect(result).toMatchObject({ applied: [mutation.mutationId], rejected: [] });

    /*
     * Read straight from the table rather than from a repository method: the field's job is to
     * survive to storage, and a getter that read it back would pass even if the write path had
     * dropped it somewhere between the engine and the INSERT. `entity_key` is the same
     * `set:<exercise>:<index>` the metadata test above pins, so the row under test is the same
     * one the conflict decision was made about.
     */
    const storedVersion = await owner.query<{ client_seq: number }>(
      `SELECT client_seq FROM sync_entity_versions WHERE session_id = $1 AND entity_key = $2`,
      [sessionId, `set:${exerciseId}:0`],
    );
    expect(storedVersion.rows).toEqual([{ client_seq: 4 }]);
  });

  it('replays terminal mutations without reopening the session and rejects new terminal writes', async () => {
    const terminal = await engine.start(userId, routineDayId, randomUUID(), '2028-03-20');
    await owner.query(
      `UPDATE workout_sessions SET status = 'completed', completed_at = $2 WHERE id = $1`,
      [terminal.id, new Date('2028-03-20T13:00:00.000Z')],
    );

    const replayMutation: SyncRequest['mutations'][number] = {
      op: 'set.upsert', mutationId: randomUUID(), clientTs: '2028-03-20T12:00:00.000Z',
      sessionId: terminal.id, exerciseId, setIndex: 0, isCompleted: true, weightKg: 60, reps: 8,
    };
    const terminalDeviceId = randomUUID();
    await owner.query(
      `INSERT INTO sync_mutations (
         mutation_id, user_id, session_id, device_id, operation, payload_hash,
         status, server_seq, applied_at
       ) VALUES ($1, $2, $3, $4, $5, $6, 'applied', 1, NOW())`,
      [
        replayMutation.mutationId,
        userId,
        terminal.id,
        terminalDeviceId,
        replayMutation.op,
        canonicalMutationHash(replayMutation),
      ],
    );

    const replay = await repository.applySync(userId, {
      deviceId: terminalDeviceId,
      sinceSeq: 0,
      mutations: [replayMutation],
    });
    expect(replay).toMatchObject({ applied: [replayMutation.mutationId], rejected: [] });

    const newMutation = { ...replayMutation, mutationId: randomUUID() };
    const rejected = await repository.applySync(userId, {
      deviceId: terminalDeviceId,
      sinceSeq: 1,
      mutations: [newMutation],
    });
    expect(rejected).toMatchObject({
      applied: [],
      rejected: [{
        mutationId: newMutation.mutationId,
        reason: 'CONFLICT',
        message: 'Only in-progress sessions can be mutated.',
      }],
    });
    /*
     * #105 deleted `state` from both answers above, and each of them asserted
     * `state: { status: 'completed' }` — that the batch answer *reported* the session was still
     * closed. One read says it for both paths: a replay and a refused new mutation leave a
     * terminal session terminal, which is the claim the field was standing in for.
     */
    expect((await repository.findSession(userId, terminal.id))?.status).toBe('completed');
  });

  it('uses legacy set timestamps as the conflict baseline before version backfill', async () => {
    const { id: sessionId } = await beginExerciseSession('2028-03-15');
    const legacyClientTs = new Date(Date.now() - 60_000);
    await owner.query(
      `INSERT INTO session_sets (
         user_id, session_id, exercise_id, set_index, is_completed,
         weight_kg, reps, client_ts
       ) VALUES ($1, $2, $3, 0, true, 80, 8, $4)`,
      [userId, sessionId, exerciseId, legacyClientTs],
    );

    const stale: SyncRequest['mutations'][number] = {
      op: 'set.upsert', mutationId: randomUUID(), clientTs: new Date(Date.now() - 120_000).toISOString(),
      sessionId, exerciseId, setIndex: 0, isCompleted: true, weightKg: 60, reps: 8,
    };
    const result = await repository.applySync(userId, {
      deviceId: randomUUID(), sinceSeq: 0, mutations: [stale],
    });

    expect(result.rejected).toEqual([{
      mutationId: stale.mutationId,
      reason: 'STALE_CONFLICT',
      message: 'A newer change to this set already reached the server.',
    }]);
    expect((await repository.findSession(userId, sessionId))?.sets[0]).toMatchObject({ weightKg: 80, reps: 8 });
    const version = await owner.query(
      'SELECT 1 FROM sync_entity_versions WHERE session_id = $1 AND entity_key = $2',
      [sessionId, `set:${exerciseId}:0`],
    );
    expect(version.rows).toEqual([]);
  });

  it('does not disclose a mutation ID collision owned by another user', async () => {
    const secondEngine = new SessionEngine(secondRepository);
    const foreignSession = await secondEngine.start(secondUserId, routineDayId, randomUUID(), '2028-03-16');
    await secondEngine.completeTask(secondUserId, {
      sessionId: foreignSession.id,
      taskKey: 'warm_up',
      completedAt: new Date('2028-03-16T12:00:00.000Z'),
    });
    await secondEngine.advancePhase(secondUserId, { sessionId: foreignSession.id, phase: 'exercise' });

    const foreignMutation: SyncRequest['mutations'][number] = {
      op: 'set.upsert', mutationId: randomUUID(), clientTs: '2028-03-16T12:00:00.000Z',
      sessionId: foreignSession.id, exerciseId, setIndex: 0, isCompleted: true, weightKg: 60, reps: 8,
    };
    await secondRepository.applySync(secondUserId, {
      deviceId: randomUUID(), sinceSeq: 0, mutations: [foreignMutation],
    });

    const result = await repository.applySync(userId, {
      deviceId: randomUUID(), sinceSeq: 0, mutations: [{ ...foreignMutation, sessionId: (await beginExerciseSession('2028-03-17')).id }],
    });
    // The sentence is deliberately generic: it must not confirm that the id exists elsewhere.
    expect(result.rejected).toEqual([{
      mutationId: foreignMutation.mutationId,
      reason: 'MUTATION_REJECTED',
      message: 'The server refused this change.',
    }]);
  });

  it('rejects a mixed-session batch at the contract boundary', async () => {
    const first = await beginExerciseSession('2028-03-18');
    const second = await beginExerciseSession('2028-03-19');
    const base: SyncRequest['mutations'][number] = {
      op: 'set.upsert', mutationId: randomUUID(), clientTs: '2028-03-18T12:00:00.000Z',
      sessionId: first.id, exerciseId, setIndex: 0, isCompleted: true, weightKg: 60, reps: 8,
    };
    const request: SyncRequest = {
      deviceId: randomUUID(), sinceSeq: 0,
      mutations: [base, { ...base, mutationId: randomUUID(), sessionId: second.id }],
    };
    expect(SyncRequestSchema.safeParse(request).success).toBe(false);
  });

  it('rejects stale conflicts and preserves the winning set and PR', async () => {
    const { id: sessionId } = await beginExerciseSession('2028-03-11');
    const deviceId = randomUUID();
    const winningClientTs = new Date(Date.now() - 1_000).toISOString();
    const staleClientTs = new Date(Date.now() - 60_000).toISOString();
    const winning: SyncRequest['mutations'][number] = {
      op: 'set.upsert', mutationId: randomUUID(), clientTs: winningClientTs,
      sessionId, exerciseId, setIndex: 0, isCompleted: true, weightKg: 80, reps: 8,
    };
    const stale: SyncRequest['mutations'][number] = {
      ...winning, mutationId: randomUUID(), clientTs: staleClientTs, weightKg: 60,
    };

    await repository.applySync(userId, { deviceId, sinceSeq: 0, mutations: [winning] });
    const result = await repository.applySync(userId, { deviceId, sinceSeq: 1, mutations: [stale] });

    expect(result).toMatchObject({
      serverSeq: 1,
      applied: [],
      rejected: [{
        mutationId: stale.mutationId,
        reason: 'STALE_CONFLICT',
        message: 'A newer change to this set already reached the server.',
      }],
    });
    expect((await repository.findSession(userId, sessionId))?.sets[0]).toMatchObject({ weightKg: 80, reps: 8 });
    expect(await repository.findPersonalRecord(userId, exerciseId)).toMatchObject({ bestE1rm: 101.33, sessionId });
  });

  it('supports ordered lifecycle mutations and records item-level domain rejection', async () => {
    const { id: sessionId } = await beginExerciseSession('2028-03-12');
    const task: SyncRequest['mutations'][number] = {
      op: 'task.complete', mutationId: randomUUID(), clientTs: '2026-09-08T12:00:00.000Z',
      sessionId, taskKey: 'main_workout', completedAt: '2026-09-08T12:00:00.000Z',
    };
    const invalidPhase: SyncRequest['mutations'][number] = {
      op: 'phase.advance', mutationId: randomUUID(), clientTs: '2028-03-12T12:00:01.000Z',
      sessionId, phase: 'stretch',
    };

    const result = await repository.applySync(userId, {
      deviceId: randomUUID(), sinceSeq: 0, mutations: [task, invalidPhase],
    });

    expect(result.serverSeq).toBe(1);
    expect(result.applied).toEqual([task.mutationId]);
    // The main-workout task is done but no set is, so the gate that refuses this advance is
    // `assertMainWorkoutComplete` — and its sentence is what the client now gets to show.
    expect(result.rejected).toEqual([{
      mutationId: invalidPhase.mutationId,
      reason: 'CONFLICT',
      message: 'All required main-workout sets must be completed first.',
    }]);
    /*
     * #105 deleted `result.state`, and the two claims it carried are still worth making — about
     * stored state, read from where stored state is authoritative. The spec below already checks
     * persistence through `findSession` after a rolled-back batch; the batch answer was never a
     * second opinion on it, whatever the deleted field implied.
     */
    const persisted = await repository.findSession(userId, sessionId);
    expect(persisted?.phase).toBe('exercise');
    expect(persisted?.tasks.map(({ taskKey }) => taskKey)).toContain('main_workout');
  });

  it('rolls back the set, PR, sequence, and sync ledger on unexpected progression failure', async () => {
    await owner.query('DELETE FROM personal_records WHERE user_id = $1 AND exercise_id = $2', [userId, exerciseId]);
    const { id: sessionId } = await beginExerciseSession('2028-03-13');
    const mutation: SyncRequest['mutations'][number] = {
      op: 'set.upsert', mutationId: randomUUID(), clientTs: '2026-09-08T12:00:00.000Z',
      sessionId, exerciseId, setIndex: 0, isCompleted: true, weightKg: 1000, reps: 1000,
    };

    await expect(repository.applySync(userId, {
      deviceId: randomUUID(), sinceSeq: 0, mutations: [mutation],
    })).rejects.toThrow();

    expect((await repository.findSession(userId, sessionId))?.sets).toEqual([]);
    expect(await repository.findPersonalRecord(userId, exerciseId)).toBeNull();
    const sessionRow = await owner.query<{ server_seq: number }>(
      'SELECT server_seq FROM workout_sessions WHERE id = $1',
      [sessionId],
    );
    expect(sessionRow.rows).toEqual([{ server_seq: 0 }]);
    const versionRows = await owner.query(
      'SELECT 1 FROM sync_entity_versions WHERE session_id = $1',
      [sessionId],
    );
    const changeRows = await owner.query(
      'SELECT 1 FROM sync_changes WHERE session_id = $1',
      [sessionId],
    );
    expect(versionRows.rows).toEqual([]);
    expect(changeRows.rows).toEqual([]);
    const ledger = await owner.query('SELECT 1 FROM sync_mutations WHERE mutation_id = $1', [mutation.mutationId]);
    expect(ledger.rows).toEqual([]);
  });

  it('patches in-memory state through upserts so it equals a fresh session read', async () => {
    await owner.query(
      'DELETE FROM session_sets WHERE user_id = $1 AND exercise_id = $2',
      [userId, exerciseId],
    );
    await owner.query(
      'DELETE FROM personal_records WHERE user_id = $1 AND exercise_id = $2',
      [userId, exerciseId],
    );
    const { id: sessionId, clientTs } = await beginExerciseSession('2028-05-01');

    const patched = await repository.mutateSession(userId, sessionId, async (mutation) => {
      await mutation.upsertSet({
        exerciseId, setIndex: 1, isCompleted: true, weightKg: 55.5, reps: null, clientTs,
      });
      await mutation.upsertSet({
        exerciseId, setIndex: 0, isCompleted: true, weightKg: 60, reps: 8, clientTs,
      });
      // Conflict path: same natural key, updated values.
      await mutation.upsertSet({
        exerciseId, setIndex: 0, isCompleted: true, weightKg: 62.25, reps: 10, clientTs,
      });
      await mutation.completeTask({ taskKey: 'main_workout', completedAt: clientTs, clientTs });
    });

    // #167 slice A: the in-memory patch must be indistinguishable from the remap it replaced.
    expect(patched).toEqual(await repository.findSession(userId, sessionId));
    expect(patched.sets.map(({ setIndex }) => setIndex)).toEqual([0, 1]);
    // Enum label order (warm_up before main_workout), not alphabetical — a string-sorting
    // comparator in patchTasks would flip this.
    expect(patched.tasks.map(({ taskKey }) => taskKey)).toEqual(['warm_up', 'main_workout']);
  });

  it('rolls back the whole batch when the deferred materialization fails on the last mutation', async () => {
    await owner.query(
      'DELETE FROM session_sets WHERE user_id = $1 AND exercise_id = $2',
      [userId, exerciseId],
    );
    await owner.query(
      'DELETE FROM personal_records WHERE user_id = $1 AND exercise_id = $2',
      [userId, exerciseId],
    );
    const { id: sessionId } = await beginExerciseSession('2028-05-02');
    const good: SyncRequest['mutations'][number] = {
      op: 'set.upsert', mutationId: randomUUID(), clientTs: '2028-05-02T12:00:00.000Z',
      sessionId, exerciseId, setIndex: 0, isCompleted: true, weightKg: 60, reps: 8,
    };
    const poison: SyncRequest['mutations'][number] = {
      ...good, mutationId: randomUUID(), setIndex: 1, weightKg: 1000, reps: 1000,
    };

    // The e1RM blowup now surfaces at the after-loop flush, not mid-mutation: the applied
    // first mutation must still leave no trace anywhere.
    await expect(repository.applySync(userId, {
      deviceId: randomUUID(), sinceSeq: 0, mutations: [good, poison],
    })).rejects.toBeInstanceOf(ProgressionValidationError);

    expect((await repository.findSession(userId, sessionId))?.sets).toEqual([]);
    expect(await repository.findPersonalRecord(userId, exerciseId)).toBeNull();
    const ledger = await owner.query(
      'SELECT 1 FROM sync_mutations WHERE mutation_id = ANY($1)',
      [[good.mutationId, poison.mutationId]],
    );
    expect(ledger.rows).toEqual([]);
  });

  it('serializes concurrent identical submissions into one domain write and sequence', async () => {
    const { id: sessionId } = await beginExerciseSession('2028-03-14');
    const mutation: SyncRequest['mutations'][number] = {
      op: 'set.upsert', mutationId: randomUUID(), clientTs: '2026-09-08T12:00:00.000Z',
      sessionId, exerciseId, setIndex: 0, isCompleted: true, weightKg: 60, reps: 8,
    };
    const input: SyncRequest = { deviceId: randomUUID(), sinceSeq: 0, mutations: [mutation] };

    const results = await Promise.all([
      repository.applySync(userId, input),
      repository.applySync(userId, input),
    ]);

    expect(results.map((result) => result.applied)).toEqual([[mutation.mutationId], [mutation.mutationId]]);
    expect(new Set(results.map((result) => result.serverSeq))).toEqual(new Set([1]));
    expect((await repository.findSession(userId, sessionId))?.sets).toHaveLength(1);
  });

  it('counts one honest week from completed rows only, through the app write path', async () => {
    const endDate = '2028-04-10';
    const finishSession = async (
      localDate: string,
      sets: { setIndex: number; weightKg: number | null; reps: number | null }[],
    ): Promise<void> => {
      const started = await engine.start(userId, routineDayId, randomUUID(), localDate);
      const clientTs = new Date(`${localDate}T12:00:00.000Z`);
      await engine.completeTask(userId, {
        sessionId: started.id,
        taskKey: 'warm_up',
        completedAt: clientTs,
        clientTs,
      });
      await engine.advancePhase(userId, { sessionId: started.id, phase: 'exercise' });
      for (const set of sets) {
        await engine.completeSet(userId, {
          sessionId: started.id,
          exerciseId,
          isCompleted: true,
          clientTs,
          ...set,
        });
      }
      await engine.completeTask(userId, {
        sessionId: started.id,
        taskKey: 'main_workout',
        completedAt: clientTs,
        clientTs,
      });
      await engine.advancePhase(userId, { sessionId: started.id, phase: 'stretch' });
      await engine.completeTask(userId, {
        sessionId: started.id,
        taskKey: 'stretch',
        completedAt: clientTs,
        clientTs,
      });
      await engine.advancePhase(userId, { sessionId: started.id, phase: 'post_workout' });
      await engine.finish(userId, {
        sessionId: started.id,
        completedAt: new Date(`${localDate}T13:00:00.000Z`),
      });
    };

    // 60×5 × 3 with load, plus one load-less set: volume 900, three load sets.
    // The phase gate demands the routine's 3 planned sets completed, so the load-less
    // set rides as an owner row after the engine finishes — it is still a real row the
    // aggregate reads, and the lifecycle purity claim stays about the session itself.
    await finishSession('2028-04-10', [
      { setIndex: 0, weightKg: 60, reps: 5 },
      { setIndex: 1, weightKg: 60, reps: 5 },
      { setIndex: 2, weightKg: 60, reps: 5 },
    ]);
    await finishSession('2028-04-09', [
      { setIndex: 0, weightKg: 50, reps: 10 },
      { setIndex: 1, weightKg: 50, reps: 10 },
      { setIndex: 2, weightKg: 50, reps: 10 },
    ]);

    // In-progress work is someone still deciding, not a fact: it must not move a number.
    await engine.start(userId, routineDayId, randomUUID(), '2028-04-10');

    // An archived session with real sets is history, not training: excluded by status.
    const archived = await owner.query<{ id: string }>(
      `INSERT INTO workout_sessions
         (user_id, routine_day_id, client_id, local_date, status, phase, source,
          started_at, completed_at)
       VALUES ($1, $2, $3, '2028-04-08', 'archived', 'post_workout', 'app',
               '2028-04-08T12:00:00.000Z', '2028-04-08T13:00:00.000Z')
       RETURNING id`,
      [userId, routineDayId, randomUUID()],
    );
    await owner.query(
      `INSERT INTO session_sets
         (user_id, session_id, exercise_id, set_index, is_completed, weight_kg, reps,
          client_ts, updated_at)
       VALUES ($1, $2, $3, 0, true, 200, 5, '2028-04-08T12:00:00.000Z', now())`,
      [userId, requireRow(archived.rows, 'archived session fixture').id, exerciseId],
    );

    // A legacy import without per-set rows is coverage, not volume.
    await owner.query(
      `INSERT INTO workout_sessions
         (user_id, routine_day_id, client_id, local_date, status, phase, source,
          started_at, completed_at)
       VALUES ($1, $2, $3, '2028-04-06', 'completed', 'post_workout', 'legacy_import',
               '2028-04-06T12:00:00.000Z', '2028-04-06T13:00:00.000Z')`,
      [userId, routineDayId, randomUUID()],
    );

    // The load-less set the phase gate has no room for: a completed row with reps but
    // no weight on the finished 04-10 session. It must not move the volume.
    const finished = await owner.query<{ id: string }>(
      `SELECT id FROM workout_sessions
       WHERE user_id = $1 AND routine_day_id = $2 AND local_date = '2028-04-10'
         AND status = 'completed'`,
      [userId, routineDayId],
    );
    await owner.query(
      `INSERT INTO session_sets
         (user_id, session_id, exercise_id, set_index, is_completed, weight_kg, reps,
          client_ts, updated_at)
       VALUES ($1, $2, $3, 3, true, NULL, 10, '2028-04-10T12:03:00.000Z', now())`,
      [userId, requireRow(finished.rows, 'finished session fixture').id, exerciseId],
    );

    // Every number below is a hand-computed literal from the rows above — the aggregate
    // is asserted against the seeding, never against itself.
    const week = await repository.getTrainingWeek(userId, endDate);
    expect(week.days).toEqual([
      { localDate: '2028-04-04', sessions: 0, volumeKg: 0, loadSets: 0 },
      { localDate: '2028-04-05', sessions: 0, volumeKg: 0, loadSets: 0 },
      { localDate: '2028-04-06', sessions: 1, volumeKg: 0, loadSets: 0 },
      { localDate: '2028-04-07', sessions: 0, volumeKg: 0, loadSets: 0 },
      { localDate: '2028-04-08', sessions: 0, volumeKg: 0, loadSets: 0 },
      { localDate: '2028-04-09', sessions: 1, volumeKg: 1500, loadSets: 3 },
      { localDate: '2028-04-10', sessions: 1, volumeKg: 900, loadSets: 3 },
    ]);
    expect(week.trainingDates.slice(0, 3)).toEqual(['2028-04-10', '2028-04-09', '2028-04-06']);
    // The tail belongs to sibling tests sharing this user (2028-02/03 rows) — the week
    // above is windowed, but training dates are global history by design. What this
    // test owns is the head order and the archived date's absence.
    expect(week.trainingDates).not.toContain('2028-04-08');

    // Cross-user containment: the second user sees an empty week.
    const foreign = await secondRepository.getTrainingWeek(secondUserId, endDate);
    expect(foreign.days.every((day) => day.sessions === 0)).toBe(true);
    expect(foreign.trainingDates).toEqual([]);
  });
});
