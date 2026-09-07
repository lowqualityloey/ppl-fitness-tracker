import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client, Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, sql } from 'drizzle-orm';
import * as schema from '../../db/schema/index.js';

/**
 * M1-08: Tenancy integration gate - THE merge gate.
 *
 * This is the single test spec §4.2 calls out by name as the thing that makes
 * "both layers ship" more than ceremony. Two real GoTrue users, authenticated as A,
 * asserting every repository read returns zero rows for B.
 *
 * Ported from M0 spike with widened coverage:
 * - Real GoTrue users (not synthetic test data)
 * - Negative controls proving the test can fail
 * - Pooler coverage ensuring isolation works through connection pooling
 * - Harness validity checks preventing accidental bypass
 *
 * Any failure here means RLS isolation is broken - a P0 security issue.
 */

// Local Supabase credentials (shared defaults, safe to inline)
const SUPABASE_API_URL = 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const APP_ROLE = 'app_authenticated';
const APP_PASSWORD = 'Wd7EmwRWWqY9s7jMVD3kVqnt+OaW5PowxNIxCY5Ful0=';
const OWNER_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const APP_DIRECT_URL = `postgresql://${APP_ROLE}:${APP_PASSWORD}@127.0.0.1:54322/postgres`;
/** supavisor tenant is pooler-dev locally; role encoded as <role>.<tenant> */
const APP_POOLER_URL = `postgresql://${APP_ROLE}.pooler-dev:${APP_PASSWORD}@127.0.0.1:54329/postgres`;

const PASSWORD = 'tenancy-test-password-123';
const EMAILS = ['tenancy-a@example.com', 'tenancy-b@example.com'] as const;

/** Claim shape GoTrue actually issues. Only `sub` is load-bearing for auth.uid(). */
interface JwtClaims {
  sub: string;
  role: string;
  aud?: string;
  email?: string;
  exp?: number;
  [k: string]: unknown;
}

interface SeededUser {
  id: string;
  email: string;
  claims: JwtClaims;
  accessToken: string;
  /** id of the workout_sessions row owned by this user */
  sessionId: string;
  /** id of the session_sets row owned by this user */
  setId: string;
}

type Db = ReturnType<typeof drizzle<typeof schema>>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

interface Handle {
  db: Db;
  pool: Pool;
  close: () => Promise<void>;
}

/**
 * max: 1 is not a performance choice. Single physical connection forces
 * every logical request onto same backend, which is the only way to prove
 * transaction-local claims do not survive into next request.
 */
function connect(connectionString: string, max = 1): Handle {
  const pool = new Pool({ connectionString, max });
  const db = drizzle(pool, { schema });
  return { db, pool, close: () => pool.end() };
}

/**
 * Production pattern from spec §4.2 / ADR-0003 invariant 4.
 * Third arg to set_config is `is_local` — scoped to this transaction only.
 */
function withUser<T>(db: Db, claims: JwtClaims, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`,
    );
    return fn(tx);
  });
}

/**
 * Hardened variant. Identical to withUser plus one extra statement.
 *
 * Supabase's auth.uid() is
 *   coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
 *            claims ->> 'sub')
 * so the legacy singular GUC takes priority over the object we set. If
 * `request.jwt.claim.sub` is ever present at session scope on a pooled
 * connection it silently wins. Blanking it transaction-locally closes that door.
 */
function withUserHardened<T>(db: Db, claims: JwtClaims, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('request.jwt.claim.sub', '', true)`);
    await tx.execute(
      sql`SELECT set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`,
    );
    return fn(tx);
  });
}

/**
 * NEGATIVE CONTROL — do not copy into app.
 *
 * Identical except `is_local = false`, which writes claims at session scope.
 * Exists so we can demonstrate that the leak ADR-0003 warns about is real.
 * A mitigation you cannot show failing without it is not evidence.
 */
function withUserLeaky<T>(db: Db, claims: JwtClaims, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('request.jwt.claims', ${JSON.stringify(claims)}, false)`,
    );
    return fn(tx);
  });
}

function decodeJwtPayload(token: string): JwtClaims {
  const part = token.split('.')[1];
  if (!part) throw new Error('malformed JWT');
  const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  return JSON.parse(json) as JwtClaims;
}

async function createUser(email: string): Promise<{ id: string; accessToken: string; claims: JwtClaims }> {
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
    throw new Error(`admin createUser failed (${created.status}): ${await created.text()}`);
  }
  const user = (await created.json()) as { id: string };

  const signedIn = await fetch(`${SUPABASE_API_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!signedIn.ok) {
    throw new Error(`password grant failed (${signedIn.status}): ${await signedIn.text()}`);
  }
  const session = (await signedIn.json()) as { access_token: string };

  const claims = decodeJwtPayload(session.access_token);
  if (claims.sub !== user.id) {
    throw new Error(`JWT sub ${claims.sub} does not match created user id ${user.id}`);
  }
  return { id: user.id, accessToken: session.access_token, claims };
}

describe('M1-08: Tenancy integration gate (THE MERGE GATE)', () => {
  let ownerClient: Client;
  let appDirect: Handle;
  let appPooler: Handle;
  let userA: SeededUser;
  let userB: SeededUser;

  beforeAll(async () => {
    ownerClient = new Client({ connectionString: OWNER_URL });
    await ownerClient.connect();

    appDirect = connect(APP_DIRECT_URL);
    appPooler = connect(APP_POOLER_URL);

    // Clean up any existing test data
    await cleanupTestUsers();

    // Create real GoTrue users via Admin API
    const [a, b] = await Promise.all([createUser(EMAILS[0]), createUser(EMAILS[1])]);

    // Verify handle_new_user trigger created profiles
    const profileCount = await ownerClient.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM public.profiles WHERE id = ANY($1::uuid[])`,
      [[a.id, b.id]]
    );
    if (profileCount.rows[0]!.count !== '2') {
      throw new Error(
        `handle_new_user trigger did not fire: expected 2 profiles, got ${profileCount.rows[0]!.count}`
      );
    }

    // Seed workout sessions and sets as owner (BYPASSRLS) so rows exist regardless of policy state
    // First get or create a routine_day to satisfy the FK constraint
    const rdResult = await ownerClient.query<{ id: string }>(
      `INSERT INTO public.routine_days (name, slug)
       VALUES ('Push', 'push'), ('Pull', 'pull')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`
    );
    const rdIds = rdResult.rows.map((r) => r.id);
    const rdPushId = rdIds[0]!;
    const rdPullId = rdIds[1] ?? rdPushId;

    const sessionInserted = await ownerClient.query<{ id: string; user_id: string }>(
      `INSERT INTO public.workout_sessions (user_id, routine_day_id, client_id, local_date, started_at)
       VALUES ($1, $3, gen_random_uuid(), '2024-01-01', NOW()),
              ($2, $4, gen_random_uuid(), '2024-01-01', NOW())
       RETURNING id, user_id`,
      [a.id, b.id, rdPushId, rdPullId]
    );

    const getSessionFor = (uid: string) => {
      const row = sessionInserted.rows.find((r) => r.user_id === uid);
      if (!row) throw new Error(`no seeded session for ${uid}`);
      return row.id;
    };

    const aSessionId = getSessionFor(a.id);
    const bSessionId = getSessionFor(b.id);

    const setInserted = await ownerClient.query<{ id: string; user_id: string }>(
      `INSERT INTO public.session_sets (user_id, session_id, exercise_id, set_index, weight_kg, reps, client_ts)
       VALUES ($1, $3, (SELECT id FROM exercises LIMIT 1), 1, 60.00, 8, NOW()),
              ($2, $4, (SELECT id FROM exercises LIMIT 1), 1, 80.00, 5, NOW())
       RETURNING id, user_id`,
      [a.id, b.id, aSessionId, bSessionId]
    );

    const getSetFor = (uid: string) => {
      const row = setInserted.rows.find((r) => r.user_id === uid);
      if (!row) throw new Error(`no seeded set for ${uid}`);
      return row.id;
    };

    userA = { ...a, email: EMAILS[0], sessionId: aSessionId, setId: getSetFor(a.id) };
    userB = { ...b, email: EMAILS[1], sessionId: bSessionId, setId: getSetFor(b.id) };
  });

  afterAll(async () => {
    await cleanupTestUsers();
    await ownerClient.end();
    await appDirect.close();
    await appPooler.close();
  });

  async function cleanupTestUsers(): Promise<void> {
    try {
      // ON DELETE CASCADE from profiles clears user data
      await ownerClient.query(`DELETE FROM auth.users WHERE email = ANY($1::text[])`, [[...EMAILS]]);
    } catch (error) {
      console.warn('Cleanup warning:', error);
    }
  }
  // Scenario 2: Harness validity - preventing gate-defeating case 1
  describe('Scenario 2: Harness validity (prevents vacuous passing)', () => {
    it('should verify app role cannot bypass RLS', async () => {
      const rows = await ownerClient.query<{
        rolname: string;
        rolbypassrls: boolean;
        rolsuper: boolean;
        rolcanlogin: boolean;
      }>(`SELECT rolname, rolbypassrls, rolsuper, rolcanlogin
          FROM pg_roles WHERE rolname = $1`, [APP_ROLE]);

      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]).toMatchObject({
        rolbypassrls: false,
        rolsuper: false,
        rolcanlogin: true,
      });
    });

    it('should verify app role owns no tables (prevents owner exemption)', async () => {
      // Table owner is exempt from own policies unless FORCE is set
      const rows = await ownerClient.query<{ tablename: string }>(
        `SELECT tablename FROM pg_tables
         WHERE schemaname = 'public' AND tableowner = $1`, [APP_ROLE]);

      expect(rows.rows).toEqual([]);
    });

    it('should verify session runs as app_authenticated role', async () => {
      const seen = await withUser(appDirect.db, userA.claims, async (tx) => {
        const r = await tx.execute<{ current_user: string; session_user: string }>(
          sql`SELECT current_user, session_user`,
        );
        return r.rows[0]!;
      });

      expect(seen.current_user).toBe(APP_ROLE);
      expect(seen.session_user).toBe(APP_ROLE);
    });

    it('should verify JWT claims are set correctly', async () => {
      // Read GUC rather than auth.uid() since app role has no USAGE on auth schema
      const sub = await withUser(appDirect.db, userA.claims, async (tx) => {
        const r = await tx.execute<{ sub: string | null }>(
          sql`SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub' AS sub`,
        );
        return r.rows[0]!.sub;
      });

      expect(sub).toBe(userA.id);
    });

    it('should verify app role cannot reach auth schema directly', async () => {
      // Least privilege - policies resolve auth.uid() but app cannot call it directly
      await expect(
        withUser(appDirect.db, userA.claims, (tx) => tx.execute(sql`SELECT auth.uid()`)),
      ).rejects.toMatchObject({ cause: { code: '42501' } });
    });
  });

  // Scenario 1: Core cross-user isolation - the heart of the tenancy gate
  describe('Scenario 1: Cross-user reads (authenticated as A, querying B)', () => {
    it('should return only own workout sessions on unfiltered select', async () => {
      const rows = await withUserHardened(appDirect.db, userA.claims, (tx) => 
        tx.select().from(schema.workoutSessions));

      expect(rows).toHaveLength(1);
      expect(rows[0]!.userId).toBe(userA.id);
    });

    it('should return zero rows when explicitly querying for B workout sessions', async () => {
      // Shape of real bug: handler trusts user_id from request
      const rows = await withUserHardened(appDirect.db, userA.claims, (tx) =>
        tx.select().from(schema.workoutSessions).where(eq(schema.workoutSessions.userId, userB.id)),
      );

      expect(rows).toEqual([]);
    });

    it('should return zero rows when fetching B workout session by primary key', async () => {
      // No user_id predicate at all — RLS is the only protection
      const rows = await withUserHardened(appDirect.db, userA.claims, (tx) =>
        tx.select().from(schema.workoutSessions).where(eq(schema.workoutSessions.id, userB.sessionId)),
      );

      expect(rows).toEqual([]);
    });

    it('should return only own session sets on unfiltered select', async () => {
      const rows = await withUserHardened(appDirect.db, userA.claims, (tx) => 
        tx.select().from(schema.sessionSets));

      expect(rows).toHaveLength(1);
      expect(rows[0]!.userId).toBe(userA.id);
    });

    it('should return zero rows when explicitly querying for B session sets', async () => {
      const rows = await withUserHardened(appDirect.db, userA.claims, (tx) =>
        tx.select().from(schema.sessionSets).where(eq(schema.sessionSets.userId, userB.id)),
      );

      expect(rows).toEqual([]);
    });

    it('should return zero rows when fetching B session set by primary key', async () => {
      const rows = await withUserHardened(appDirect.db, userA.claims, (tx) =>
        tx.select().from(schema.sessionSets).where(eq(schema.sessionSets.id, userB.setId)),
      );

      expect(rows).toEqual([]);
    });

    it('cannot read B profile', async () => {
      const rows = await withUserHardened(appDirect.db, userA.claims, (tx) =>
        tx.select().from(schema.profiles).where(eq(schema.profiles.id, userB.id)),
      );

      expect(rows).toEqual([]);
    });

    it('should have aggregate count that cannot infer B rows', async () => {
      // COUNT(*) has no target list to filter, worth confirming policies apply to scan
      const r = await withUserHardened(appDirect.db, userA.claims, (tx) =>
        tx.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM public.session_sets`),
      );

      expect(r.rows[0]!.n).toBe('1');
    });
  });

  describe('Scenario 1: Cross-user writes (authenticated as A, targeting B)', () => {
    it('should affect zero rows when updating B workout session', async () => {
      const updated = await withUserHardened(appDirect.db, userA.claims, (tx) =>
        tx
          .update(schema.workoutSessions)
          .set({ status: 'in_progress' })
          .where(eq(schema.workoutSessions.id, userB.sessionId))
          .returning({ id: schema.workoutSessions.id }),
      );

      expect(updated).toEqual([]);
    });

    it('should affect zero rows when updating B session set', async () => {
      const updated = await withUserHardened(appDirect.db, userA.claims, (tx) =>
        tx
          .update(schema.sessionSets)
          .set({ reps: 999 })
          .where(eq(schema.sessionSets.id, userB.setId))
          .returning({ id: schema.sessionSets.id }),
      );

      expect(updated).toEqual([]);
    });

    it('should affect zero rows when deleting B workout session', async () => {
      const deleted = await withUserHardened(appDirect.db, userA.claims, (tx) =>
        tx.delete(schema.workoutSessions).where(eq(schema.workoutSessions.id, userB.sessionId)).returning({ id: schema.workoutSessions.id }),
      );

      expect(deleted).toEqual([]);
    });

    it('should affect zero rows when deleting B session set', async () => {
      const deleted = await withUserHardened(appDirect.db, userA.claims, (tx) =>
        tx.delete(schema.sessionSets).where(eq(schema.sessionSets.id, userB.setId)).returning({ id: schema.sessionSets.id }),
      );

      expect(deleted).toEqual([]);
    });

    it('should reject inserting workout session attributed to B (42501, not silent drop)', async () => {
      // WITH CHECK raises 42501 rather than filtering - rejection is correct outcome
      await expect(
        withUserHardened(appDirect.db, userA.claims, (tx) =>
          tx.insert(schema.workoutSessions).values({
            userId: userB.id,
            routineDayId: '00000000-0000-0000-0000-000000000000', // non-existent FK — rejected by RLS before FK check
            clientId: '00000000-0000-0000-0000-000000000001',
            localDate: '2024-01-02',
            status: 'in_progress',
            phase: 'pre_workout',
          }),
        ),
      ).rejects.toMatchObject({ cause: { code: '42501' } });
    });

    it('should reject inserting session set attributed to B (42501, not silent drop)', async () => {
      await expect(
        withUserHardened(appDirect.db, userA.claims, (tx) =>
          tx.insert(schema.sessionSets).values({
            userId: userB.id,
            sessionId: userA.sessionId, // A's session but B's user_id - should fail
            exerciseId: userA.setId, // Just need some UUID
            setIndex: 1,
            weightKg: '100.0',
            reps: 10,
            clientTs: new Date(),
          }),
        ),
      ).rejects.toMatchObject({ cause: { code: '42501' } });
    });

    it('should verify B data survived all attempts intact', async () => {
      // Switch to B's context and verify data is unchanged
      const sessionRows = await withUserHardened(appDirect.db, userB.claims, (tx) =>
        tx.select().from(schema.workoutSessions).where(eq(schema.workoutSessions.id, userB.sessionId)),
      );

      expect(sessionRows).toHaveLength(1);
      expect(sessionRows[0]!.status).toBe('completed'); // Not changed to 'in_progress'

      const setRows = await withUserHardened(appDirect.db, userB.claims, (tx) =>
        tx.select().from(schema.sessionSets).where(eq(schema.sessionSets.id, userB.setId)),
      );

      expect(setRows).toHaveLength(1);
      expect(setRows[0]!.reps).toBe(5); // Not changed to 999
    });
  });

  describe('No claims scenario', () => {
    it('should see nothing when no JWT claims are set', async () => {
      // auth.uid() returns NULL, `user_id = NULL` is NULL, so no row qualifies
      const rows = await appDirect.db.select().from(schema.sessionSets);
      expect(rows).toEqual([]);
    });

    it('should error on garbage sub, not open door', async () => {
      await expect(
        withUser(appDirect.db, { sub: 'not-a-uuid', role: 'authenticated' }, (tx) =>
          tx.select().from(schema.sessionSets),
        ),
      ).rejects.toMatchObject({ cause: { code: '22P02' } });
    });
  });

  // Scenario 3: Negative control - proving the leak is real and fix works
  describe('Scenario 3: Claims leak negative control (is_local = false)', () => {
    it('should leak identity to next request on same connection with withUserLeaky', async () => {
      const leakyConn = connect(APP_DIRECT_URL, 1);
      try {
        const pidDuring = await withUserLeaky(leakyConn.db, userB.claims, async (tx) => {
          const rows = await tx.select().from(schema.sessionSets);
          expect(rows).toHaveLength(1);
          expect(rows[0]!.userId).toBe(userB.id);
          const p = await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`);
          return Number(p.rows[0]!.pid);
        });

        // Simulates next HTTP request picking up same pooled connection without setting claims
        const pidAfter = await leakyConn.db.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`);
        expect(Number(pidAfter.rows[0]!.pid)).toBe(pidDuring);

        // Identity leaked at session scope
        const currentIdentity = await leakyConn.db.execute<{ sub: string | null }>(
          sql`SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub' AS sub`,
        );
        expect(currentIdentity.rows[0]!.sub).toBe(userB.id);

        // Claims-less query reads B's data - THE LEAK
        const leaked = await leakyConn.db.select().from(schema.sessionSets);
        expect(leaked).toHaveLength(1);
        expect(leaked[0]!.userId).toBe(userB.id);
      } finally {
        await leakyConn.close(); // Discard poisoned connection
      }
    });
  });

  describe('Scenario 3: Claims isolation with proper transaction-local scope', () => {
    it('should not leak identity to next request with withUser (is_local = true)', async () => {
      const cleanConn = connect(APP_DIRECT_URL, 1);
      try {
        const pidDuring = await withUser(cleanConn.db, userB.claims, async (tx) => {
          const rows = await tx.select().from(schema.sessionSets);
          expect(rows).toHaveLength(1);
          const p = await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`);
          return Number(p.rows[0]!.pid);
        });

        const pidAfter = await cleanConn.db.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`);
        expect(Number(pidAfter.rows[0]!.pid)).toBe(pidDuring);

        // Identity properly cleared
        const currentIdentity = await cleanConn.db.execute<{ sub: string | null }>(
          sql`SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub' AS sub`,
        );
        expect(currentIdentity.rows[0]!.sub).toBeNull();

        // Claims-less query sees nothing - NO LEAK
        const rows = await cleanConn.db.select().from(schema.sessionSets);
        expect(rows).toEqual([]);
      } finally {
        await cleanConn.close();
      }
    });

    it('should not bleed B claims into following A transaction', async () => {
      const isolatedConn = connect(APP_DIRECT_URL, 1);
      try {
        await withUser(isolatedConn.db, userB.claims, (tx) => tx.select().from(schema.sessionSets));
        const rows = await withUser(isolatedConn.db, userA.claims, (tx) => tx.select().from(schema.sessionSets));

        expect(rows).toHaveLength(1);
        expect(rows[0]!.userId).toBe(userA.id);
      } finally {
        await isolatedConn.close();
      }
    });

    it('should leave no claims after rolled-back transaction', async () => {
      const rollbackConn = connect(APP_DIRECT_URL, 1);
      try {
        await expect(
          withUser(rollbackConn.db, userB.claims, async () => {
            throw new Error('boom');
          }),
        ).rejects.toThrow('boom');

        const currentIdentity = await rollbackConn.db.execute<{ sub: string | null }>(
          sql`SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub' AS sub`,
        );
        expect(currentIdentity.rows[0]!.sub).toBeNull();
      } finally {
        await rollbackConn.close();
      }
    });
  });

  describe('Scenario 4: Legacy GUC hazard and withUserHardened protection', () => {
    it('should demonstrate legacy request.jwt.claim.sub overrides transaction-local claims', async () => {
      // Undocumented hazard: auth.uid() checks request.jwt.claim.sub FIRST
      const hazardConn = connect(APP_DIRECT_URL, 1);
      try {
        await hazardConn.db.execute(sql`SELECT set_config('request.jwt.claim.sub', ${userB.id}, false)`);

        const rows = await withUser(hazardConn.db, userA.claims, (tx) => tx.select().from(schema.sessionSets));

        // Authenticated as A, reading B data - THE HAZARD
        expect(rows).toHaveLength(1);
        expect(rows[0]!.userId).toBe(userB.id);
      } finally {
        await hazardConn.close();
      }
    });

    it('should prove withUserHardened closes the legacy GUC door', async () => {
      const hardenedConn = connect(APP_DIRECT_URL, 1);
      try {
        await hardenedConn.db.execute(sql`SELECT set_config('request.jwt.claim.sub', ${userB.id}, false)`);

        const rows = await withUserHardened(hardenedConn.db, userA.claims, (tx) =>
          tx.select().from(schema.sessionSets),
        );

        // Authenticated as A, reading only A data - PROTECTION WORKS
        expect(rows).toHaveLength(1);
        expect(rows[0]!.userId).toBe(userA.id);
      } finally {
        await hardenedConn.close();
      }
    });
  });

  // Scenario 5: Pooler fidelity - ensuring isolation through supavisor transaction pooling
  describe('Scenario 5: Pooler DSN coverage (production connection pooling)', () => {
    it('should still run as app_authenticated role through pooler', async () => {
      const seen = await withUser(appPooler.db, userA.claims, async (tx) => {
        const r = await tx.execute<{ current_user: string }>(sql`SELECT current_user`);
        return r.rows[0]!.current_user;
      });

      expect(seen).toBe(APP_ROLE);
    });

    it('should still isolate A from B through pooler', async () => {
      const rows = await withUser(appPooler.db, userA.claims, (tx) => tx.select().from(schema.sessionSets));

      expect(rows).toHaveLength(1);
      expect(rows[0]!.userId).toBe(userA.id);
    });

    it('should never cross identities under 40 interleaved concurrent transactions', async () => {
      // 40 transactions alternating users, run concurrently against pooler
      // smaller than request count. If claims escaped transaction scope,
      // some would return other user's data - critical concurrency test
      const users = [userA, userB];
      const results = await Promise.all(
        Array.from({ length: 40 }, (_, i) => {
          const u = users[i % 2]!;
          return withUserHardened(appPooler.db, u.claims, async (tx) => {
            const rows = await tx.select().from(schema.sessionSets);
            return { expected: u.id, got: rows.map((r) => r.userId) };
          });
        }),
      );

      // Zero cross-contamination allowed
      for (const r of results) {
        expect(r.got).toEqual([r.expected]);
      }
    });

    it('should leave no claims behind for next pooler checkout', async () => {
      // Seed claims across multiple pooler transactions
      await Promise.all(
        Array.from({ length: 20 }, () =>
          withUserHardened(appPooler.db, userB.claims, (tx) => tx.select().from(schema.sessionSets)),
        ),
      );

      // Fresh claims-less queries across several checkouts
      const probes = await Promise.all(
        Array.from({ length: 20 }, () =>
          appPooler.db.execute<{ sub: string | null }>(
            sql`SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub' AS sub`,
          ),
        ),
      );

      // All checkouts should see no identity residue
      for (const p of probes) {
        expect(p.rows[0]!.sub).toBeNull();
      }

      // Behavioral verification: no rows visible without claims
      const rows = await appPooler.db.select().from(schema.sessionSets);
      expect(rows).toEqual([]);
    });

    it('should maintain isolation with mixed workout_sessions and session_sets queries', async () => {
      // Additional coverage for both tables through pooler under concurrent load
      const users = [userA, userB];
      const mixedResults = await Promise.all(
        Array.from({ length: 20 }, (_, i) => {
          const u = users[i % 2]!;
          return withUserHardened(appPooler.db, u.claims, async (tx) => {
            const sessions = await tx.select().from(schema.workoutSessions);
            const sets = await tx.select().from(schema.sessionSets);
            return {
              expected: u.id,
              sessionUserIds: sessions.map((s) => s.userId),
              setUserIds: sets.map((s) => s.userId),
            };
          });
        }),
      );

      // Every query should see only own data
      for (const r of mixedResults) {
        expect(r.sessionUserIds).toEqual([r.expected]);
        expect(r.setUserIds).toEqual([r.expected]);
      }
    });
  });

  // The trap this guards against
  describe('The owner bypass trap (proves gate-defeating case 1 is real)', () => {
    it('should show owner connection sees all rows despite FORCE ROW LEVEL SECURITY', async () => {
      // FORCE removes owner exemption but not BYPASSRLS attribute
      // A test pointed at MIGRATION_DATABASE_URL passes while production is wide open
      const ownerDb = drizzle(ownerClient, { schema });
      const all = await ownerDb.select().from(schema.sessionSets);
      expect(all.length).toBeGreaterThanOrEqual(2);

      const forced = await ownerClient.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
        `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'session_sets'`
      );
      expect(forced.rows[0]).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true });
    });
  });
});