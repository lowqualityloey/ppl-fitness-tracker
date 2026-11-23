import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pgErrorCode } from './pg-error.js';
import { requireRow } from './test-helpers.js';

/**
 * M4-00 (#89): the auth→profiles cascade — executed, not trusted.
 *
 * Migration `0007_auth_user_cascade.sql` adds `profiles_id_auth_users_fkey`
 * (profiles.id → auth.users.id, ON DELETE CASCADE). This file is its Definition-of-Done
 * half per ADR-0006 and STATE §4 item 11/16:
 *
 *   1. the artifact exists and says what it says (pg_constraint, validated, `c`),
 *   2. the production deletion path (GoTrue admin API, which deletes as supabase_auth_admin
 *      with zero privileges on public.*) empties the WHOLE ownership chain,
 *   3. a profile without an identity is refused (23503),
 *   4. NEGATIVE CONTROL inside a rolled-back transaction: with the constraint dropped, the
 *      leak this migration exists to close is observed happening, then un-happened,
 *   5. every migration file on disk has actually been applied to this database (the Supabase
 *      CLI's own tracking table), so "committed but never run" is a RED, not a surprise.
 *
 * Owner-only connection per STATE §4 item 18 (bounded fixture setup); users are real GoTrue
 * users created over the admin API, the same pattern tests/integration/tenancy.test.ts uses.
 * Emails are per-run unique (the #80 lesson, cheap to honor in a new file).
 */

const SUPABASE_API_URL = 'http://127.0.0.1:54321';
// Well-known local-dev service key (public by design — see .env.example and CI job env).
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const TEST_PASSWORD = 'auth-cascade-test-password-123';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

interface CountRow {
  n: string | number;
}
interface ConstraintRow {
  conname: string;
  confdeltype: string;
  convalidated: boolean;
  referenced: string;
}
interface IdRow {
  id: string;
}

async function createGoTrueUser(email: string): Promise<string> {
  const created = await fetch(`${SUPABASE_API_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password: TEST_PASSWORD, email_confirm: true }),
  });
  const body: unknown = await created.json();
  const id =
    typeof body === 'object' && body !== null && 'id' in body
      ? String((body as { id: unknown }).id)
      : '';
  if (!created.ok || !id) {
    throw new Error(`admin createUser failed (${created.status}): ${JSON.stringify(body)}`);
  }
  return id;
}

async function deleteGoTrueUser(id: string): Promise<void> {
  const removed = await fetch(`${SUPABASE_API_URL}/auth/v1/admin/users/${id}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  });
  if (!removed.ok) {
    throw new Error(`admin deleteUser failed (${removed.status}): ${await removed.text()}`);
  }
}

/**
 * Seed the full ownership chain for one user the way fixtures do: content rows are made
 * user-owned (owner_user_id = user) rather than system rows, so every seeded row dies with
 * the user and nothing leaks into shared content — the "Test Push" lesson from
 * schema-constraints.test.ts's afterAll comment.
 */
async function seedOwnershipChain(owner: Client, userId: string): Promise<void> {
  const run = randomUUID().slice(0, 8);
  const exerciseId = randomUUID();
  const dayId = randomUUID();
  const sessionId = randomUUID();

  await owner.query(
    `INSERT INTO exercises (id, slug, name, muscle_groups, alternatives, owner_user_id)
     VALUES ($1, $2, 'Cascade Chain Press', ARRAY['chest'], '{}', $3)`,
    [exerciseId, `auth-cascade-ex-${run}`, userId],
  );
  await owner.query(
    `INSERT INTO routine_days (id, slug, name, owner_user_id)
     VALUES ($1, $2, 'Cascade Chain Day', $3)`,
    [dayId, `auth-cascade-day-${run}`, userId],
  );
  await owner.query(
    `INSERT INTO workout_sessions (id, user_id, routine_day_id, client_id, local_date, started_at, status)
     VALUES ($1, $2, $3, $4, CURRENT_DATE, NOW(), 'completed')`,
    [sessionId, userId, dayId, randomUUID()],
  );
  await owner.query(
    `INSERT INTO session_sets (user_id, session_id, exercise_id, set_index, weight_kg, reps, client_ts)
     VALUES ($1, $2, $3, 0, 82.5, 8, NOW())`,
    [userId, sessionId, exerciseId],
  );
  await owner.query(
    `INSERT INTO session_tasks (session_id, task_key, client_ts)
     VALUES ($1, 'warm_up', NOW())`,
    [sessionId],
  );
  await owner.query(
    `INSERT INTO personal_records (user_id, exercise_id, best_e1rm, achieved_at, session_id)
     VALUES ($1, $2, 91.3, NOW(), $3)`,
    [userId, exerciseId, sessionId],
  );
  await owner.query(
    `INSERT INTO sync_mutations (mutation_id, user_id) VALUES ($1, $2)`,
    [randomUUID(), userId],
  );
  await owner.query(
    `INSERT INTO import_batches (user_id, source_fingerprint, report)
     VALUES ($1, $2, 'cascade fixture batch')`,
    [userId, `auth-cascade-${run}`],
  );
}

async function countUserRows(owner: Client, userId: string): Promise<Record<string, number>> {
  const perTable: Record<string, string> = {
    profiles: 'id',
    exercises: 'owner_user_id',
    routine_days: 'owner_user_id',
    workout_sessions: 'user_id',
    session_sets: 'user_id',
    personal_records: 'user_id',
    sync_mutations: 'user_id',
    import_batches: 'user_id',
  };
  const counts: Record<string, number> = {};
  for (const [table, column] of Object.entries(perTable)) {
    const result = await owner.query<CountRow>(
      `SELECT count(*)::int AS n FROM public.${table} WHERE ${column} = $1`,
      [userId],
    );
    counts[table] = Number(requireRow(result.rows, `${table} row count`).n);
  }
  // session_tasks hangs off the session, not the user directly.
  const tasks = await owner.query<CountRow>(
    `SELECT count(*)::int AS n FROM public.session_tasks t
       WHERE t.session_id IN (SELECT id FROM public.workout_sessions WHERE user_id = $1)`,
    [userId],
  );
  counts['session_tasks'] = Number(requireRow(tasks.rows, 'session_tasks row count').n);
  return counts;
}

describe('M4-00 (#89): auth user deletion cascades to profiles and everything below', () => {
  let owner: Client;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    owner = new Client({ connectionString: process.env.MIGRATION_DATABASE_URL });
    await owner.connect();
  });

  afterAll(async () => {
    // Production-path cleanup where possible; owner SQL as the net for anything whose auth
    // parent is already gone (that deletion IS the cascade being tested).
    for (const id of createdUserIds) {
      const exists = await owner.query<CountRow>('SELECT count(*)::int AS n FROM auth.users WHERE id = $1', [id]);
      if (Number(requireRow(exists.rows, 'auth user existence check').n) > 0) {
        await deleteGoTrueUser(id).catch(() => undefined);
      }
      await owner.query('DELETE FROM public.profiles WHERE id = $1', [id]);
    }
    await owner.end();
  });

  it('the FK artifact exists, is validated, targets auth.users, and deletes with CASCADE', async () => {
    const result = await owner.query<ConstraintRow>(`
      SELECT con.conname,
             con.confdeltype,
             con.convalidated,
             refnsp.nspname || '.' || ref.relname AS referenced
        FROM pg_constraint con
        JOIN pg_class src ON src.oid = con.conrelid
        JOIN pg_class ref ON ref.oid = con.confrelid
        JOIN pg_namespace refnsp ON refnsp.oid = ref.relnamespace
       WHERE con.conrelid = 'public.profiles'::regclass
         AND con.conname = 'profiles_id_auth_users_fkey'
    `);
    expect(result.rows).toHaveLength(1);
    const fk = requireRow(result.rows, 'profiles auth FK constraint');
    expect(fk.referenced).toBe('auth.users');
    expect(fk.convalidated).toBe(true); // validated, not a NOT VALID half-truth
    expect(fk.confdeltype).toBe('c'); // 'c' = CASCADE (vs 'a' NO ACTION, 'r' RESTRICT)
  });

  it('REFUSES a profile with no auth.users identity (23503)', async () => {
    const unparented = randomUUID();
    try {
      await owner.query(
        `INSERT INTO public.profiles (id, email) VALUES ($1, 'unparented@example.com')`,
        [unparented],
      );
    } catch (err) {
      expect(pgErrorCode(err)).toBe('23503');
      return;
    }
    // Reached only while the FK is absent — e.g. the scripted RED run from
    // scripts/mutation-check.ts. Sweep the leak so the control's restore can still
    // validate, then fail loudly anyway.
    await owner.query('DELETE FROM public.profiles WHERE id = $1', [unparented]);
    throw new Error('unreachable: a profile without an auth.users row must not insert');
  });

  it('the production deletion path (GoTrue admin API) empties the whole chain', async () => {
    const email = `auth-cascade-prod-${randomUUID()}@example.com`;
    const userId = await createGoTrueUser(email);
    createdUserIds.push(userId);

    // The on_auth_user_created trigger gives the user a real profile row — the FK parent
    // exists, so this is the world as the app knows it.
    const profileBefore = await owner.query<CountRow>(
      'SELECT count(*)::int AS n FROM public.profiles WHERE id = $1',
      [userId],
    );
    expect(Number(requireRow(profileBefore.rows, 'profile before cascade').n)).toBe(1);

    await seedOwnershipChain(owner, userId);
    const seeded = await countUserRows(owner, userId);
    for (const [table, n] of Object.entries(seeded)) {
      expect(n, `fixture did not seed ${table}`).toBeGreaterThan(0);
    }

    // GoTrue deletes the auth.users row as supabase_auth_admin — a role with no grants at
    // all on public.*. This is the request that used to strand rows; the cascade is
    // physical, so it must work regardless of executor privileges, and this test is the
    // measurement of that claim (see ADR-0006; do not call it proven elsewhere).
    await deleteGoTrueUser(userId);

    const auth = await owner.query<CountRow>('SELECT count(*)::int AS n FROM auth.users WHERE id = $1', [userId]);
    expect(Number(requireRow(auth.rows, 'auth user after GoTrue deletion').n)).toBe(0);
    const after = await countUserRows(owner, userId);
    for (const [table, n] of Object.entries(after)) {
      expect(n, `cascade failed to remove rows from ${table}`).toBe(0);
    }
  });

  it('owner SQL deletion cascades too (the fixture path tenancy-style teardown takes)', async () => {
    const email = `auth-cascade-owner-${randomUUID()}@example.com`;
    const userId = await createGoTrueUser(email);
    createdUserIds.push(userId);

    // Self-seeded content (fresh databases have no system routine days — CI has no seed
    // step, see PROMPTKIT §3), owned by this user so the cascade is what removes it.
    const day = await owner.query<IdRow>(
      `INSERT INTO routine_days (slug, name, owner_user_id)
       VALUES ($1, 'Owner-Path Day', $2) RETURNING id`,
      [`auth-cascade-owner-${randomUUID().slice(0, 8)}`, userId],
    );
    await owner.query(
      `INSERT INTO workout_sessions (user_id, routine_day_id, client_id, local_date, started_at)
       VALUES ($1, $2, $3, CURRENT_DATE, NOW())`,
      [userId, requireRow(day.rows, 'owner-path routine day insert').id, randomUUID()],
    );
    const before = await countUserRows(owner, userId);
    expect(before.workout_sessions).toBe(1);

    await owner.query('DELETE FROM auth.users WHERE id = $1', [userId]);

    const after = await countUserRows(owner, userId);
    expect(after.profiles).toBe(0);
    expect(after.workout_sessions).toBe(0);
    expect(after.routine_days).toBe(0);
  });

  it('NEGATIVE CONTROL: without the constraint the leak is observable, and rollback un-does it', async () => {
    const email = `auth-cascade-negative-${randomUUID()}@example.com`;
    const userId = await createGoTrueUser(email);
    createdUserIds.push(userId);

    // Reproduce the pre-0007 world in one transaction. Postgres DDL is transactional, so
    // the DROP and the leak are both unmade by ROLLBACK — no shared-state mutation.
    await owner.query('BEGIN');
    try {
      await owner.query(
        'ALTER TABLE public.profiles DROP CONSTRAINT profiles_id_auth_users_fkey',
      );
      await owner.query('DELETE FROM auth.users WHERE id = $1', [userId]);
      const stranded = await owner.query<IdRow>(
        'SELECT id FROM public.profiles WHERE id = $1',
        [userId],
      );
      expect(stranded.rows, 'the leak this migration exists to close did not reproduce — is the constraint doing the work?').toHaveLength(1);
    } finally {
      await owner.query('ROLLBACK');
    }

    // Restored state: constraint back, user back, profile back.
    const restored = await owner.query<IdRow>(`
      SELECT con.conname FROM pg_constraint con
       WHERE con.conrelid = 'public.profiles'::regclass
         AND con.conname = 'profiles_id_auth_users_fkey'
    `);
    expect(restored.rows).toHaveLength(1);
    const profile = await owner.query<IdRow>(
      'SELECT id FROM public.profiles WHERE id = $1',
      [userId],
    );
    expect(profile.rows).toHaveLength(1);

    // And the same deletion WITH the constraint now removes the profile — the control
    // only means something paired with the fix firing.
    await owner.query('DELETE FROM auth.users WHERE id = $1', [userId]);
    const gone = await owner.query<CountRow>(
      'SELECT count(*)::int AS n FROM public.profiles WHERE id = $1',
      [userId],
    );
    expect(Number(requireRow(gone.rows, 'profile after constrained deletion').n)).toBe(0);
  });

  it('every migration file on disk is recorded as applied by the Supabase CLI (drift-safe)', async () => {
    const files = readdirSync(path.join(REPO_ROOT, 'supabase', 'migrations'))
      .filter((f) => /^\d{4}_.+\.sql$/.test(f))
      .map((f) => f.slice(0, 4))
      .sort();
    expect(files.length).toBeGreaterThanOrEqual(8); // 0000–0007 after #89

    const applied = await owner.query<{ version: string | null }>(
      'SELECT version FROM supabase_migrations.schema_migrations',
    );
    const appliedVersions = new Set(applied.rows.map((r) => r.version));
    const missing = files.filter((v) => !appliedVersions.has(v));
    expect(
      missing,
      `migrations on disk but never applied to this database: ${missing.join(', ')} — ` +
        'the Supabase CLI applies supabase/migrations/*.sql in filename order; restart the stack or `supabase db reset`',
    ).toEqual([]);
  });
});
