import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { CookieJar, createClientFromCookieJar } from '../../../lib/supabase/server.js';

export const ids = {
  mutation: '11111111-1111-4111-8111-111111111111',
  session: '22222222-2222-4222-8222-222222222222',
  exercise: '33333333-3333-4333-8333-333333333333',
  device: '44444444-4444-4444-8444-444444444444',
  routineDay: '55555555-5555-4555-8555-555555555555',
  foreignSession: '66666666-6666-4666-8666-666666666666',
  routineExercise: '77777777-7777-4777-8777-777777777777',
  foreignDevice: '88888888-8888-4888-8888-888888888888',
  freshDevice: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  set: '99999999-9999-4999-8999-999999999999',
  task: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
};

export const clientTs = '2026-09-08T12:00:00.000Z';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const OWNER_URL = process.env.MIGRATION_DATABASE_URL;
const TEST_PASSWORD = 'm1-16-route-test-password';

process.env.NEXT_PUBLIC_SUPABASE_URL ??= SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= SUPABASE_ANON_KEY;

interface TestSession {
  userId: string;
  cookie: string;
  cleanup: () => Promise<void>;
}

function hasId(value: unknown): value is { id: string } {
  return typeof value === 'object' && value !== null &&
    typeof (value as { id?: unknown }).id === 'string';
}

export async function createTestSession(label: string): Promise<TestSession> {
  const email = `m1-16-${label}-${randomUUID()}@example.com`;
  const created = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password: TEST_PASSWORD, email_confirm: true }),
  });
  const createdBody: unknown = await created.json();
  if (!created.ok || !hasId(createdBody)) {
    throw new Error(`Could not create M1-16 test user (${created.status}).`);
  }

  const userId = createdBody.id;
  const jar = new CookieJar();
  const client = createClientFromCookieJar(jar);
  const { error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error) throw new Error(`Could not sign in M1-16 test user: ${error.message}`);

  return {
    userId,
    cookie: jar.getAll().map(({ name, value }) => `${name}=${value}`).join('; '),
    cleanup: async () => {
      const removed = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      });
      if (!removed.ok) throw new Error(`Could not clean up M1-16 test user (${removed.status}).`);
    },
  };
}

export function authHeaders(session: TestSession): HeadersInit {
  return { Cookie: session.cookie };
}

export interface SessionFixture {
  cleanup: () => Promise<void>;
}

/**
 * Seeds only through the owner DSN. Requests under test still use the app DSN,
 * Supabase cookie, and PostgreSQL RLS path.
 */
export async function seedSessionFixtures(owner: TestSession): Promise<SessionFixture> {
  if (!OWNER_URL) {
    throw new Error('MIGRATION_DATABASE_URL is required for API session fixtures.');
  }

  let foreign: TestSession | undefined;
  let database: Client | undefined;
  let cleanupRows: (() => Promise<void>) | undefined;

  try {
    foreign = await createTestSession('sessions-foreign');
    database = new Client({ connectionString: OWNER_URL });
    await database.connect();

    const connectedDatabase = database;
    const connectedForeign = foreign;
    cleanupRows = async (): Promise<void> => {
      await connectedDatabase.query(
        'DELETE FROM personal_records WHERE session_id IN ($1, $2)',
        [ids.session, ids.foreignSession],
      );
      await connectedDatabase.query('DELETE FROM workout_sessions WHERE routine_day_id = $1', [ids.routineDay]);
      await connectedDatabase.query('DELETE FROM routine_exercises WHERE id = $1', [ids.routineExercise]);
      await connectedDatabase.query('DELETE FROM routine_days WHERE id = $1', [ids.routineDay]);
      await connectedDatabase.query('DELETE FROM exercises WHERE id = $1', [ids.exercise]);
    };

    await cleanupRows();
    await connectedDatabase.query(
      `INSERT INTO profiles (id, email)
       VALUES ($1, $2), ($3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [
        owner.userId,
        `m2-api-owner-${owner.userId}@example.com`,
        connectedForeign.userId,
        `m2-api-foreign-${connectedForeign.userId}@example.com`,
      ],
    );
    await connectedDatabase.query(
      `INSERT INTO exercises (
         id, slug, name, muscle_groups, equipment, form_tips, beginner_notes,
         video_url, alternatives, kind, duration_seconds, owner_user_id
       )
       VALUES ($1, 'm2-api-fixture-exercise', 'API Fixture Press', ARRAY['chest', 'triceps'],
               'barbell', 'Keep the wrists stacked.', 'Use a controlled range of motion.',
               NULL, ARRAY[]::text[], 'strength', NULL, NULL)`,
      [ids.exercise],
    );
    await connectedDatabase.query(
      `INSERT INTO routine_days (id, slug, name, description, owner_user_id)
       VALUES ($1, 'm2-api-fixture-day', 'API Fixture Push Day', 'Deterministic API test routine.', NULL)`,
      [ids.routineDay],
    );
    await connectedDatabase.query(
      `INSERT INTO routine_exercises (
         id, routine_day_id, exercise_id, phase, order_index, target_sets,
         target_reps, target_reps_range, rest_time
       )
       VALUES ($1, $2, $3, 'main_workout', 0, 3, 8, '8-10', '90s')`,
      [ids.routineExercise, ids.routineDay, ids.exercise],
    );
    await connectedDatabase.query(
      `INSERT INTO workout_sessions (
         id, user_id, routine_day_id, client_id, status, phase, source,
         local_date, completed_at, server_seq
       )
       VALUES
         ($1, $2, $3, $4, 'in_progress', 'exercise', 'app', '2026-09-07',
          NULL, 0),
         ($5, $6, $3, $7, 'in_progress', 'exercise', 'app', '2026-09-06',
          NULL, 0)`,
      [
        ids.session,
        owner.userId,
        ids.routineDay,
        ids.device,
        ids.foreignSession,
        connectedForeign.userId,
        ids.foreignDevice,
      ],
    );
    await connectedDatabase.query(
      `INSERT INTO session_sets (
         id, user_id, session_id, exercise_id, set_index, is_completed,
         weight_kg, reps, client_ts
       )
       VALUES ($1, $2, $3, $4, 0, true, 60.5, 8, $5)`,
      [ids.set, owner.userId, ids.session, ids.exercise, clientTs],
    );
    await connectedDatabase.query(
      `INSERT INTO session_tasks (id, session_id, task_key, completed_at, client_ts)
       VALUES ($1, $2, 'main_workout', $3, $3)`,
      [ids.task, ids.session, clientTs],
    );
  } catch (error) {
    await cleanupRows?.().catch(() => undefined);
    if (database && foreign) {
      await database.query('DELETE FROM profiles WHERE id IN ($1, $2)', [owner.userId, foreign.userId])
        .catch(() => undefined);
    }
    await database?.end().catch(() => undefined);
    await foreign?.cleanup().catch(() => undefined);
    throw error;
  }

  if (!database || !foreign || !cleanupRows) {
    throw new Error('Session fixture setup completed without retaining cleanup handles.');
  }

  const connectedDatabase = database;
  const connectedForeign = foreign;
  const connectedCleanupRows = cleanupRows;
  return {
    cleanup: async () => {
      const failures: unknown[] = [];
      const attempt = async (operation: () => Promise<unknown>): Promise<void> => {
        try {
          await operation();
        } catch (error) {
          failures.push(error);
        }
      };

      await attempt(connectedCleanupRows);
      await attempt(() => connectedDatabase.query(
        'DELETE FROM profiles WHERE id IN ($1, $2)',
        [owner.userId, connectedForeign.userId],
      ));
      await attempt(() => connectedDatabase.end());
      await attempt(() => connectedForeign.cleanup());

      if (failures.length > 0) {
        throw new AggregateError(failures, 'Could not fully clean up API session fixtures.');
      }
    },
  };
}

export type { TestSession };
