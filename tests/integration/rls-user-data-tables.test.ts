import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Client, Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, sql } from 'drizzle-orm';
import * as schema from '../../db/schema/index.js';
import { withUser, type JwtClaims } from '../../lib/db/with-user.js';
import { expectSqlState } from './test-helpers.js';

/**
 * M1-06: RLS on user-data tables.
 *
 * This suite deliberately uses real GoTrue users and the non-owner
 * app_authenticated database role. Owner connections are used only to seed
 * valid foreign-key parents and to verify policy metadata; they must never be
 * used to assert RLS behaviour because postgres bypasses RLS.
 */

// Local Supabase defaults used by the CI-created local stack.
const SUPABASE_API_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const APP_ROLE = 'app_authenticated';
const APP_PASSWORD = 'Wd7EmwRWWqY9s7jMVD3kVqnt+OaW5PowxNIxCY5Ful0=';
const OWNER_URL = process.env.MIGRATION_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const APP_URL = `postgresql://${APP_ROLE}:${APP_PASSWORD}@127.0.0.1:54322/postgres`;
const PASSWORD = 'm1-06-rls-test-password';
const ROUTINE_SLUG = 'm1-06-rls-routine';
const EXERCISE_SLUG = 'm1-06-rls-exercise';
const EMAILS = [
  'm1-06-rls-a@example.com',
  'm1-06-rls-b@example.com',
  'm1-06-rls-profile-cycle@example.com',
] as const;

const protectedTables = [
  'profiles',
  'workout_sessions',
  'session_sets',
  'session_tasks',
  'personal_records',
  'sync_mutations',
  'sync_entity_versions',
  'sync_changes',
  'import_batches',
] as const;

type ProtectedTable = (typeof protectedTables)[number];

interface TestUser {
  id: string;
  email: string;
  claims: JwtClaims;
}

interface Fixtures {
  routineDayId: string;
  exerciseId: string;
  aSessionId: string;
  bRows: readonly RlsRow[];
}

interface RlsRow {
  table: ProtectedTable;
  primaryKey: 'id' | 'mutation_id';
  id: string;
}

const appPool = new Pool({ connectionString: APP_URL, max: 1 });
const appDb = drizzle(appPool, { schema });
let ownerClient: Client;
let userA: TestUser;
let userB: TestUser;
let profileCycleUser: TestUser;
let fixtures: Fixtures;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isAuthUser(value: unknown): value is { id: string; email: string } {
  return isObject(value) && typeof value.id === 'string' && typeof value.email === 'string';
}

function isPasswordGrant(value: unknown): value is { access_token: string } {
  return isObject(value) && typeof value.access_token === 'string';
}

function isJwtClaims(value: unknown): value is JwtClaims {
  return (
    isObject(value) &&
    typeof value.sub === 'string' &&
    typeof value.role === 'string'
  );
}

function decodeJwtPayload(token: string): JwtClaims {
  const payload = token.split('.')[1];
  if (!payload) {
    throw new Error('GoTrue returned a malformed JWT without a payload');
  }

  const decoded: unknown = JSON.parse(
    Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
  );
  if (!isJwtClaims(decoded)) {
    throw new Error('GoTrue JWT payload did not contain string sub and role claims');
  }
  return decoded;
}

async function createUser(email: string): Promise<TestUser> {
  const created = await fetch(`${SUPABASE_API_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }),
  });

  if (!created.ok) {
    throw new Error(`GoTrue Admin user creation failed (${created.status})`);
  }

  const createdBody: unknown = await created.json();
  if (!isAuthUser(createdBody)) {
    throw new Error('GoTrue Admin user creation returned an unexpected payload');
  }

  const signedIn = await fetch(`${SUPABASE_API_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });

  if (!signedIn.ok) {
    throw new Error(`GoTrue password grant failed (${signedIn.status})`);
  }

  const sessionBody: unknown = await signedIn.json();
  if (!isPasswordGrant(sessionBody)) {
    throw new Error('GoTrue password grant returned no access token');
  }

  const claims = decodeJwtPayload(sessionBody.access_token);
  if (claims.sub !== createdBody.id) {
    throw new Error('GoTrue JWT subject did not match its created user');
  }

  return { id: createdBody.id, email: createdBody.email, claims };
}

async function queryOne<T extends Record<string, unknown>>(
  query: string,
  values: readonly unknown[],
): Promise<T> {
  const result = await ownerClient.query<T>(query, [...values]);
  const row = result.rows[0];
  if (!row) {
    throw new Error(`Expected owner seed query to return one row: ${query}`);
  }
  return row;
}

async function cleanupTestUsers(): Promise<void> {
  const profileIds = `SELECT id FROM public.profiles WHERE email = ANY($1::text[])`;
  await ownerClient.query(`DELETE FROM public.personal_records WHERE user_id IN (${profileIds})`, [EMAILS]);
  await ownerClient.query(`DELETE FROM public.sync_mutations WHERE user_id IN (${profileIds})`, [EMAILS]);
  await ownerClient.query(`DELETE FROM public.import_batches WHERE user_id IN (${profileIds})`, [EMAILS]);
  // Deletes session_sets and session_tasks through their session FKs.
  await ownerClient.query(`DELETE FROM public.workout_sessions WHERE user_id IN (${profileIds})`, [EMAILS]);
  await ownerClient.query('DELETE FROM public.profiles WHERE email = ANY($1::text[])', [EMAILS]);
  await ownerClient.query('DELETE FROM auth.users WHERE email = ANY($1::text[])', [EMAILS]);
}

async function seedFixtures(): Promise<Fixtures> {
  const routineDay = await queryOne<{ id: string }>(
    `INSERT INTO public.routine_days (name, slug)
     VALUES ('M1-06 RLS routine', $1)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [ROUTINE_SLUG],
  );
  const exercise = await queryOne<{ id: string }>(
    `INSERT INTO public.exercises (name, slug, muscle_groups)
     VALUES ('M1-06 RLS exercise', $1, ARRAY['chest'])
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [EXERCISE_SLUG],
  );

  const aSession = await queryOne<{ id: string }>(
    `INSERT INTO public.workout_sessions (user_id, routine_day_id, client_id, local_date, status)
     VALUES ($1, $2, $3, '2030-01-01', 'completed')
     RETURNING id`,
    [userA.id, routineDay.id, randomUUID()],
  );
  const bSession = await queryOne<{ id: string }>(
    `INSERT INTO public.workout_sessions (user_id, routine_day_id, client_id, local_date, status)
     VALUES ($1, $2, $3, '2030-01-01', 'completed')
     RETURNING id`,
    [userB.id, routineDay.id, randomUUID()],
  );
  const bSet = await queryOne<{ id: string }>(
    `INSERT INTO public.session_sets (user_id, session_id, exercise_id, set_index, reps, client_ts)
     VALUES ($1, $2, $3, 1, 8, NOW())
     RETURNING id`,
    [userB.id, bSession.id, exercise.id],
  );
  const bTask = await queryOne<{ id: string }>(
    `INSERT INTO public.session_tasks (session_id, task_key, client_ts)
     VALUES ($1, 'warm_up', NOW())
     RETURNING id`,
    [bSession.id],
  );
  const bRecord = await queryOne<{ id: string }>(
    `INSERT INTO public.personal_records (user_id, exercise_id, best_e1rm, achieved_at)
     VALUES ($1, $2, 100.00, NOW())
     RETURNING id`,
    [userB.id, exercise.id],
  );
  const bMutationId = randomUUID();
  await ownerClient.query(
    `INSERT INTO public.sync_mutations (mutation_id, user_id)
     VALUES ($1, $2)`,
    [bMutationId, userB.id],
  );
  const bVersion = await queryOne<{ id: string }>(
    `INSERT INTO public.sync_entity_versions (
       user_id, session_id, entity_type, entity_key, client_ts, effective_ts,
       device_id, mutation_id, server_seq
     )
     VALUES ($1, $2, 'session', 'session:state', NOW(), NOW(), $3, $4, 1)
     RETURNING id`,
    [userB.id, bSession.id, randomUUID(), bMutationId],
  );
  const bChange = await queryOne<{ id: string }>(
    `INSERT INTO public.sync_changes (
       user_id, session_id, server_seq, mutation_id, entity_type, entity_key, operation
     )
     VALUES ($1, $2, 1, $3, 'session', 'session:state', 'phase.advance')
     RETURNING id`,
    [userB.id, bSession.id, bMutationId],
  );
  const bImport = await queryOne<{ id: string }>(
    `INSERT INTO public.import_batches (user_id, source_fingerprint, report)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [userB.id, `m1-06-b-${randomUUID()}`, '{"status":"seeded"}'],
  );

  return {
    routineDayId: routineDay.id,
    exerciseId: exercise.id,
    aSessionId: aSession.id,
    bRows: [
      { table: 'profiles', primaryKey: 'id', id: userB.id },
      { table: 'workout_sessions', primaryKey: 'id', id: bSession.id },
      { table: 'session_sets', primaryKey: 'id', id: bSet.id },
      { table: 'session_tasks', primaryKey: 'id', id: bTask.id },
      { table: 'personal_records', primaryKey: 'id', id: bRecord.id },
      { table: 'sync_mutations', primaryKey: 'mutation_id', id: bMutationId },
      { table: 'sync_entity_versions', primaryKey: 'id', id: bVersion.id },
      { table: 'sync_changes', primaryKey: 'id', id: bChange.id },
      { table: 'import_batches', primaryKey: 'id', id: bImport.id },
    ],
  };
}

function tableReference(table: ProtectedTable) {
  return sql.raw(`public.${table}`);
}

function columnReference(column: RlsRow['primaryKey']) {
  return sql.raw(column);
}

beforeAll(async () => {
  ownerClient = new Client({ connectionString: OWNER_URL });
  await ownerClient.connect();
  await cleanupTestUsers();

  [userA, userB, profileCycleUser] = await Promise.all([
    createUser(EMAILS[0]),
    createUser(EMAILS[1]),
    createUser(EMAILS[2]),
  ]);

  const profileCount = await ownerClient.query<{ count: string }>(
    'SELECT count(*)::text AS count FROM public.profiles WHERE id = ANY($1::uuid[])',
    [[userA.id, userB.id, profileCycleUser.id]],
  );
  expect(profileCount.rows[0]?.count).toBe('3');
  fixtures = await seedFixtures();
});

afterAll(async () => {
  await cleanupTestUsers();
  await ownerClient.query('DELETE FROM public.routine_days WHERE slug = $1', [ROUTINE_SLUG]);
  await ownerClient.query('DELETE FROM public.exercises WHERE slug = $1', [EXERCISE_SLUG]);
  await ownerClient.end();
  await appPool.end();
});

describe('M1-06: RLS on all user-data tables', () => {
  it('enables and forces RLS, with four app-role policies and DML grants per table', async () => {
    const tableMetadata = await ownerClient.query<{
      tablename: ProtectedTable;
      rls_enabled: boolean;
      rls_forced: boolean;
    }>(
      `SELECT c.relname AS tablename, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])`,
      [protectedTables],
    );

    expect(tableMetadata.rows).toHaveLength(protectedTables.length);
    for (const table of protectedTables) {
      expect(tableMetadata.rows.find((row) => row.tablename === table)).toMatchObject({
        rls_enabled: true,
        rls_forced: true,
      });
    }

    const policies = await ownerClient.query<{
      tablename: ProtectedTable;
      policyname: string;
      cmd: string;
      roles: string;
    }>(
      `SELECT tablename, policyname, cmd, roles
       FROM pg_policies
       WHERE schemaname = 'public' AND tablename = ANY($1::text[])`,
      [protectedTables],
    );
    const grants = await ownerClient.query<{
      table_name: ProtectedTable;
      privilege_type: string;
    }>(
      `SELECT table_name, privilege_type
       FROM information_schema.role_table_grants
       WHERE table_schema = 'public' AND grantee = $1 AND table_name = ANY($2::text[])`,
      [APP_ROLE, protectedTables],
    );

    for (const table of protectedTables) {
      const tablePolicies = policies.rows
        .filter((policy) => policy.tablename === table)
        .map((policy) => ({ policyname: policy.policyname, cmd: policy.cmd, roles: policy.roles }))
        .sort((left, right) => left.policyname.localeCompare(right.policyname));
      expect(tablePolicies).toEqual([
        { policyname: `${table}_delete`, cmd: 'DELETE', roles: `{${APP_ROLE}}` },
        { policyname: `${table}_insert`, cmd: 'INSERT', roles: `{${APP_ROLE}}` },
        { policyname: `${table}_select`, cmd: 'SELECT', roles: `{${APP_ROLE}}` },
        { policyname: `${table}_update`, cmd: 'UPDATE', roles: `{${APP_ROLE}}` },
      ]);

      expect(
        grants.rows
          .filter((grant) => grant.table_name === table)
          .map((grant) => grant.privilege_type)
          .sort(),
      ).toEqual(['DELETE', 'INSERT', 'SELECT', 'UPDATE']);
    }
  });

  it('allows an authenticated owner to create, read, update, and delete every direct user-data row', async () => {
    await withUser(appDb, userA.claims, async (tx) => {
      const [session] = await tx
        .insert(schema.workoutSessions)
        .values({
          userId: userA.id,
          routineDayId: fixtures.routineDayId,
          clientId: randomUUID(),
          localDate: '2030-01-02',
          status: 'in_progress',
          phase: 'pre_workout',
        })
        .returning({ id: schema.workoutSessions.id });
      if (!session) throw new Error('Expected owner workout session insert to return a row');

      const [set] = await tx
        .insert(schema.sessionSets)
        .values({
          userId: userA.id,
          sessionId: session.id,
          exerciseId: fixtures.exerciseId,
          setIndex: 1,
          reps: 8,
          clientTs: new Date(),
        })
        .returning({ id: schema.sessionSets.id });
      const [task] = await tx
        .insert(schema.sessionTasks)
        .values({ sessionId: session.id, taskKey: 'warm_up', clientTs: new Date() })
        .returning({ id: schema.sessionTasks.id });
      const [record] = await tx
        .insert(schema.personalRecords)
        .values({
          userId: userA.id,
          exerciseId: fixtures.exerciseId,
          bestE1rm: '100.00',
          achievedAt: new Date(),
          sessionId: session.id,
        })
        .returning({ id: schema.personalRecords.id });
      const mutationId = randomUUID();
      const [mutation] = await tx
        .insert(schema.syncMutations)
        .values({ mutationId, userId: userA.id })
        .returning({ mutationId: schema.syncMutations.mutationId });
      const [importBatch] = await tx
        .insert(schema.importBatches)
        .values({
          userId: userA.id,
          sourceFingerprint: `m1-06-a-${randomUUID()}`,
          report: '{"status":"created"}',
        })
        .returning({ id: schema.importBatches.id });

      if (!set || !task || !record || !mutation || !importBatch) {
        throw new Error('Expected every owner insert to return a row');
      }

      expect(
        await tx.select().from(schema.workoutSessions).where(eq(schema.workoutSessions.id, session.id)),
      ).toHaveLength(1);
      expect(await tx.select().from(schema.sessionSets).where(eq(schema.sessionSets.id, set.id))).toHaveLength(1);
      expect(await tx.select().from(schema.sessionTasks).where(eq(schema.sessionTasks.id, task.id))).toHaveLength(1);
      expect(
        await tx.select().from(schema.personalRecords).where(eq(schema.personalRecords.id, record.id)),
      ).toHaveLength(1);
      expect(
        await tx.select().from(schema.syncMutations).where(eq(schema.syncMutations.mutationId, mutation.mutationId)),
      ).toHaveLength(1);
      expect(
        await tx.select().from(schema.importBatches).where(eq(schema.importBatches.id, importBatch.id)),
      ).toHaveLength(1);

      expect(
        await tx
          .update(schema.workoutSessions)
          .set({ status: 'completed' })
          .where(eq(schema.workoutSessions.id, session.id))
          .returning({ id: schema.workoutSessions.id }),
      ).toHaveLength(1);
      expect(
        await tx
          .update(schema.sessionSets)
          .set({ reps: 9 })
          .where(eq(schema.sessionSets.id, set.id))
          .returning({ id: schema.sessionSets.id }),
      ).toHaveLength(1);
      expect(
        await tx
          .update(schema.sessionTasks)
          .set({ completedAt: new Date() })
          .where(eq(schema.sessionTasks.id, task.id))
          .returning({ id: schema.sessionTasks.id }),
      ).toHaveLength(1);
      expect(
        await tx
          .update(schema.personalRecords)
          .set({ bestE1rm: '101.00' })
          .where(eq(schema.personalRecords.id, record.id))
          .returning({ id: schema.personalRecords.id }),
      ).toHaveLength(1);
      expect(
        await tx
          .update(schema.syncMutations)
          .set({ appliedAt: new Date() })
          .where(eq(schema.syncMutations.mutationId, mutation.mutationId))
          .returning({ mutationId: schema.syncMutations.mutationId }),
      ).toHaveLength(1);
      expect(
        await tx
          .update(schema.importBatches)
          .set({ report: '{"status":"updated"}' })
          .where(eq(schema.importBatches.id, importBatch.id))
          .returning({ id: schema.importBatches.id }),
      ).toHaveLength(1);

      expect(
        await tx.delete(schema.sessionTasks).where(eq(schema.sessionTasks.id, task.id)).returning({ id: schema.sessionTasks.id }),
      ).toHaveLength(1);
      expect(
        await tx.delete(schema.sessionSets).where(eq(schema.sessionSets.id, set.id)).returning({ id: schema.sessionSets.id }),
      ).toHaveLength(1);
      expect(
        await tx
          .delete(schema.personalRecords)
          .where(eq(schema.personalRecords.id, record.id))
          .returning({ id: schema.personalRecords.id }),
      ).toHaveLength(1);
      expect(
        await tx
          .delete(schema.syncMutations)
          .where(eq(schema.syncMutations.mutationId, mutation.mutationId))
          .returning({ mutationId: schema.syncMutations.mutationId }),
      ).toHaveLength(1);
      expect(
        await tx
          .delete(schema.importBatches)
          .where(eq(schema.importBatches.id, importBatch.id))
          .returning({ id: schema.importBatches.id }),
      ).toHaveLength(1);
      expect(
        await tx
          .delete(schema.workoutSessions)
          .where(eq(schema.workoutSessions.id, session.id))
          .returning({ id: schema.workoutSessions.id }),
      ).toHaveLength(1);
    });
  });

  it('allows a user to read, update, delete, and recreate only their own profile', async () => {
    await withUser(appDb, profileCycleUser.claims, async (tx) => {
      expect(
        await tx.select().from(schema.profiles).where(eq(schema.profiles.id, profileCycleUser.id)),
      ).toHaveLength(1);
      expect(
        await tx
          .update(schema.profiles)
          .set({ displayName: 'M1-06 profile cycle' })
          .where(eq(schema.profiles.id, profileCycleUser.id))
          .returning({ id: schema.profiles.id }),
      ).toHaveLength(1);
      expect(
        await tx
          .delete(schema.profiles)
          .where(eq(schema.profiles.id, profileCycleUser.id))
          .returning({ id: schema.profiles.id }),
      ).toHaveLength(1);
      expect(
        await tx
          .insert(schema.profiles)
          .values({ id: profileCycleUser.id, email: profileCycleUser.email })
          .returning({ id: schema.profiles.id }),
      ).toHaveLength(1);
    });
  });

  it('filters every B-owned row from A and prevents cross-user updates and deletes', async () => {
    for (const row of fixtures.bRows) {
      const selected = await withUser(appDb, userA.claims, (tx) =>
        tx.execute(
          sql`SELECT 1 FROM ${tableReference(row.table)} WHERE ${columnReference(row.primaryKey)} = ${row.id}`,
        ),
      );
      expect(selected.rows, `A must not select B ${row.table}`).toEqual([]);

      const updated = await withUser(appDb, userA.claims, (tx) =>
        tx.execute(
          sql`UPDATE ${tableReference(row.table)}
              SET ${columnReference(row.primaryKey)} = ${columnReference(row.primaryKey)}
              WHERE ${columnReference(row.primaryKey)} = ${row.id}
              RETURNING ${columnReference(row.primaryKey)}`,
        ),
      );
      expect(updated.rows, `A must not update B ${row.table}`).toEqual([]);

      const deleted = await withUser(appDb, userA.claims, (tx) =>
        tx.execute(
          sql`DELETE FROM ${tableReference(row.table)}
              WHERE ${columnReference(row.primaryKey)} = ${row.id}
              RETURNING ${columnReference(row.primaryKey)}`,
        ),
      );
      expect(deleted.rows, `A must not delete B ${row.table}`).toEqual([]);

      const ownerCheck = await ownerClient.query(
        `SELECT 1 FROM public.${row.table} WHERE ${row.primaryKey} = $1`,
        [row.id],
      );
      expect(ownerCheck.rows, `B ${row.table} must survive A's attempts`).toHaveLength(1);
    }
  });

  it('rejects reassigning an owner row or task relationship to B', async () => {
    const ownRows = await withUser(appDb, userA.claims, async (tx) => {
      const [session] = await tx
        .insert(schema.workoutSessions)
        .values({
          userId: userA.id,
          routineDayId: fixtures.routineDayId,
          clientId: randomUUID(),
          localDate: '2030-01-04',
        })
        .returning({ id: schema.workoutSessions.id });
      if (!session) throw new Error('Expected reassignment session insert to return a row');

      const [set] = await tx
        .insert(schema.sessionSets)
        .values({
          userId: userA.id,
          sessionId: session.id,
          exerciseId: fixtures.exerciseId,
          setIndex: 1,
          clientTs: new Date(),
        })
        .returning({ id: schema.sessionSets.id });
      const [task] = await tx
        .insert(schema.sessionTasks)
        .values({ sessionId: session.id, taskKey: 'warm_up', clientTs: new Date() })
        .returning({ id: schema.sessionTasks.id });
      const [record] = await tx
        .insert(schema.personalRecords)
        .values({
          userId: userA.id,
          exerciseId: fixtures.exerciseId,
          bestE1rm: '100.00',
          achievedAt: new Date(),
        })
        .returning({ id: schema.personalRecords.id });
      const [mutation] = await tx
        .insert(schema.syncMutations)
        .values({ mutationId: randomUUID(), userId: userA.id, sessionId: session.id })
        .returning({ mutationId: schema.syncMutations.mutationId });
      const [version] = await tx
        .insert(schema.syncEntityVersions)
        .values({
          userId: userA.id,
          sessionId: session.id,
          entityType: 'session',
          entityKey: 'session:state',
          clientTs: new Date(),
          effectiveTs: new Date(),
          deviceId: randomUUID(),
          mutationId: mutation?.mutationId ?? randomUUID(),
          serverSeq: 1,
        })
        .returning({ id: schema.syncEntityVersions.id });
      const [change] = await tx
        .insert(schema.syncChanges)
        .values({
          userId: userA.id,
          sessionId: session.id,
          serverSeq: 1,
          mutationId: mutation?.mutationId ?? randomUUID(),
          entityType: 'session',
          entityKey: 'session:state',
          operation: 'phase.advance',
        })
        .returning({ id: schema.syncChanges.id });

      const [importBatch] = await tx
        .insert(schema.importBatches)
        .values({
          userId: userA.id,
          sourceFingerprint: `m1-06-reassign-${randomUUID()}`,
          report: '{"status":"created"}',
        })
        .returning({ id: schema.importBatches.id });

      if (!set || !task || !record || !mutation || !version || !change || !importBatch) {
        throw new Error('Expected every reassignment fixture insert to return a row');
      }
      return { session, set, task, record, mutation, version, change, importBatch };
    });

    const bSession = fixtures.bRows.find((row) => row.table === 'workout_sessions');
    const bMutation = fixtures.bRows.find((row) => row.table === 'sync_mutations');
    if (!bSession || !bMutation) throw new Error('Missing B relationship fixtures');

    await expectSqlState(
      withUser(appDb, userA.claims, (tx) =>
        tx.insert(schema.syncEntityVersions).values({
          userId: userA.id,
          sessionId: bSession.id,
          entityType: 'session',
          entityKey: `session:foreign-${randomUUID()}`,
          clientTs: new Date(),
          effectiveTs: new Date(),
          deviceId: randomUUID(),
          mutationId: ownRows.mutation.mutationId,
          serverSeq: 2,
        }),
      ),
      '42501',
    );
    await expectSqlState(
      withUser(appDb, userA.claims, (tx) =>
        tx.insert(schema.syncChanges).values({
          userId: userA.id,
          sessionId: ownRows.session.id,
          serverSeq: 2,
          mutationId: bMutation.id,
          entityType: 'session',
          entityKey: `session:foreign-${randomUUID()}`,
          operation: 'phase.advance',
        }),
      ),
      '42501',
    );

    await expectSqlState(
      withUser(appDb, userA.claims, (tx) =>
        tx
          .update(schema.syncEntityVersions)
          .set({ sessionId: bSession.id })
          .where(eq(schema.syncEntityVersions.id, ownRows.version.id)),
      ),
      '42501',
    );
    await expectSqlState(
      withUser(appDb, userA.claims, (tx) =>
        tx
          .update(schema.syncEntityVersions)
          .set({ mutationId: bMutation.id })
          .where(eq(schema.syncEntityVersions.id, ownRows.version.id)),
      ),
      '42501',
    );
    await expectSqlState(
      withUser(appDb, userA.claims, (tx) =>
        tx
          .update(schema.syncChanges)
          .set({ sessionId: bSession.id })
          .where(eq(schema.syncChanges.id, ownRows.change.id)),
      ),
      '42501',
    );
    await expectSqlState(
      withUser(appDb, userA.claims, (tx) =>
        tx
          .update(schema.syncChanges)
          .set({ mutationId: bMutation.id })
          .where(eq(schema.syncChanges.id, ownRows.change.id)),
      ),
      '42501',
    );

    await expectSqlState(
      withUser(appDb, userA.claims, (tx) =>
        tx
          .update(schema.workoutSessions)
          .set({ userId: userB.id })
          .where(eq(schema.workoutSessions.id, ownRows.session.id)),
      ),
      '42501',
    );
    await expectSqlState(
      withUser(appDb, userA.claims, (tx) =>
        tx
          .update(schema.sessionSets)
          .set({ userId: userB.id })
          .where(eq(schema.sessionSets.id, ownRows.set.id)),
      ),
      '42501',
    );
    await expectSqlState(
      withUser(appDb, userA.claims, (tx) =>
        tx
          .update(schema.sessionTasks)
          .set({ sessionId: bSession.id })
          .where(eq(schema.sessionTasks.id, ownRows.task.id)),
      ),
      '42501',
    );
    await expectSqlState(
      withUser(appDb, userA.claims, (tx) =>
        tx
          .update(schema.personalRecords)
          .set({ userId: userB.id })
          .where(eq(schema.personalRecords.id, ownRows.record.id)),
      ),
      '42501',
    );
    await expectSqlState(
      withUser(appDb, userA.claims, (tx) =>
        tx
          .update(schema.syncMutations)
          .set({ userId: userB.id })
          .where(eq(schema.syncMutations.mutationId, ownRows.mutation.mutationId)),
      ),
      '42501',
    );
    await expectSqlState(
      withUser(appDb, userA.claims, (tx) =>
        tx
          .update(schema.importBatches)
          .set({ userId: userB.id })
          .where(eq(schema.importBatches.id, ownRows.importBatch.id)),
      ),
      '42501',
    );

    const unchanged = await ownerClient.query<{
      session_user_id: string;
      set_user_id: string;
      task_session_id: string;
      record_user_id: string;
      mutation_user_id: string;
      import_user_id: string;
    }>(
      `SELECT
         (SELECT user_id FROM public.workout_sessions WHERE id = $1) AS session_user_id,
         (SELECT user_id FROM public.session_sets WHERE id = $2) AS set_user_id,
         (SELECT session_id FROM public.session_tasks WHERE id = $3) AS task_session_id,
         (SELECT user_id FROM public.personal_records WHERE id = $4) AS record_user_id,
         (SELECT user_id FROM public.sync_mutations WHERE mutation_id = $5) AS mutation_user_id,
         (SELECT user_id FROM public.import_batches WHERE id = $6) AS import_user_id`,
      [
        ownRows.session.id,
        ownRows.set.id,
        ownRows.task.id,
        ownRows.record.id,
        ownRows.mutation.mutationId,
        ownRows.importBatch.id,
      ],
    );
    expect(unchanged.rows[0]).toMatchObject({
      session_user_id: userA.id,
      set_user_id: userA.id,
      task_session_id: ownRows.session.id,
      record_user_id: userA.id,
      mutation_user_id: userA.id,
      import_user_id: userA.id,
    });
  });

  it('rejects inserts or relationship changes that attribute rows to B', async () => {
    await expectSqlState(
      withUser(appDb, userA.claims, (tx) =>
        tx.insert(schema.profiles).values({ id: userB.id, email: 'spoofed-profile@example.com' }),
      ),
      '42501',
    );

    await expectSqlState(
      withUser(appDb, userA.claims, (tx) =>
        tx.insert(schema.workoutSessions).values({
          userId: userB.id,
          routineDayId: fixtures.routineDayId,
          clientId: randomUUID(),
          localDate: '2030-01-03',
        }),
      ),
      '42501',
    );

    await expectSqlState(
      withUser(appDb, userA.claims, (tx) =>
        tx.insert(schema.sessionSets).values({
          userId: userB.id,
          sessionId: fixtures.aSessionId,
          exerciseId: fixtures.exerciseId,
          setIndex: 2,
          clientTs: new Date(),
        }),
      ),
      '42501',
    );

    const bSession = fixtures.bRows.find((row) => row.table === 'workout_sessions');
    if (!bSession) throw new Error('Missing B workout-session fixture');
    await expectSqlState(
      withUser(appDb, userA.claims, (tx) =>
        tx.insert(schema.sessionTasks).values({
          sessionId: bSession.id,
          taskKey: 'main_workout',
          clientTs: new Date(),
        }),
      ),
      '42501',
    );

    await expectSqlState(
      withUser(appDb, userA.claims, (tx) =>
        tx.insert(schema.personalRecords).values({
          userId: userB.id,
          exerciseId: fixtures.exerciseId,
          bestE1rm: '120.00',
          achievedAt: new Date(),
        }),
      ),
      '42501',
    );

    await expectSqlState(
      withUser(appDb, userA.claims, (tx) =>
        tx.insert(schema.syncMutations).values({ mutationId: randomUUID(), userId: userB.id }),
      ),
      '42501',
    );

    await expectSqlState(
      withUser(appDb, userA.claims, (tx) =>
        tx.insert(schema.importBatches).values({
          userId: userB.id,
          sourceFingerprint: `spoofed-${randomUUID()}`,
          report: '{"status":"spoofed"}',
        }),
      ),
      '42501',
    );

    await expectSqlState(
      withUser(appDb, userA.claims, (tx) =>
        tx
          .update(schema.profiles)
          .set({ id: userB.id })
          .where(eq(schema.profiles.id, userA.id)),
      ),
      '42501',
    );
  });
});
