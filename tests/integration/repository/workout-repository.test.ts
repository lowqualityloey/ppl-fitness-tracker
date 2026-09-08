import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { createDb, type DbHandle } from '../../../lib/db/client.js';
import type { JwtClaims } from '../../../lib/db/with-user.js';
import { InvalidSessionCursorError } from '../../../lib/domain/sessions/types.js';
import { WorkoutRepository } from '../../../lib/repositories/workout-repository.js';

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
    routineDayId = routineDay.rows[0]!.id;

    const exercise = await owner.query<{ id: string }>(
      `INSERT INTO exercises (
         slug, name, muscle_groups, equipment, form_tips, beginner_notes,
         video_url, alternatives, kind, duration_seconds, owner_user_id
       )
       VALUES ($1, 'Repository Test Exercise', ARRAY['test'], NULL, NULL, NULL, NULL, ARRAY[]::text[], 'strength', NULL, NULL)
       RETURNING id`,
      [`m2-repository-${randomUUID()}`],
    );
    exerciseId = exercise.rows[0]!.id;

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
  });

  afterAll(async () => {
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

    const secondPage = await repository.listSessions(userId, firstPage.nextCursor ?? undefined);
    expect(secondPage.sessions.length).toBeGreaterThan(0);
    expect(secondPage.nextCursor).toBeNull();
    const firstDate = firstPage.sessions[0]?.localDate;
    const secondDate = secondPage.sessions[0]?.localDate;
    expect(firstDate !== undefined && secondDate !== undefined && firstDate > secondDate).toBe(true);

    const malformedCursor = Buffer.from(JSON.stringify({ localDate: 'not-a-date', id: 'not-a-uuid' }))
      .toString('base64url');
    await expect(repository.listSessions(userId, malformedCursor))
      .rejects.toBeInstanceOf(InvalidSessionCursorError);
  });
});
