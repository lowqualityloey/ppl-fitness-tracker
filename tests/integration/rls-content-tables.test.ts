import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Client } from 'pg';

// Local Supabase credentials (shared defaults, safe to inline)
const SUPABASE_API_URL = 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const TEST_PASSWORD = 'test-password-m1-05';
const TEST_EMAILS = ['rls-test-user-a@example.com', 'rls-test-user-b@example.com'];

interface TestUser {
  id: string;
  email: string;
  accessToken: string;
  claims: { sub: string; role: string; email: string };
}

describe('M1-05: RLS on content tables', () => {
  let ownerClient: Client;
  let userA: TestUser;
  let userB: TestUser;

  beforeAll(async () => {
    // Owner client for setup/teardown
    ownerClient = new Client({
      connectionString: process.env.MIGRATION_DATABASE_URL,
    });
    await ownerClient.connect();

    // Clean up any existing test data
    await cleanupTestData();

    // Create test users via GoTrue Admin API
    userA = await createTestUser(TEST_EMAILS[0]!);
    userB = await createTestUser(TEST_EMAILS[1]!);
  });

  afterAll(async () => {
    await cleanupTestData();
    await ownerClient.end();
  });

  beforeEach(async () => {
    // Clean exercise data between tests but keep users
    await ownerClient.query(`DELETE FROM exercises WHERE slug LIKE 'test-%'`);
    await ownerClient.query(`DELETE FROM routine_days WHERE slug LIKE 'test-%'`);
  });

  async function cleanupTestData(): Promise<void> {
    // Clean up test users and their data
    await ownerClient.query(`DELETE FROM auth.users WHERE email = ANY($1::text[])`, [TEST_EMAILS]);
    await ownerClient.query(`DELETE FROM exercises WHERE slug LIKE 'test-%'`);
    await ownerClient.query(`DELETE FROM routine_days WHERE slug LIKE 'test-%'`);
  }

  async function createTestUser(email: string): Promise<TestUser> {
    // Create user via GoTrue Admin API
    const created = await fetch(`${SUPABASE_API_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password: TEST_PASSWORD,
        email_confirm: true
      }),
    });

    if (!created.ok) {
      throw new Error(`GoTrue createUser failed (${created.status}): ${await created.text()}`);
    }

    const user = (await created.json()) as { id: string };

    // Sign in to get access token
    const signedIn = await fetch(`${SUPABASE_API_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: TEST_PASSWORD }),
    });

    if (!signedIn.ok) {
      throw new Error(`Password grant failed (${signedIn.status}): ${await signedIn.text()}`);
    }

    const session = (await signedIn.json()) as { access_token: string };

    // Decode JWT claims
    const claims = decodeJwtPayload(session.access_token);

    return {
      id: user.id,
      email,
      accessToken: session.access_token,
      claims
    };
  }

  function decodeJwtPayload(token: string): { sub: string; role: string; email: string } {
    const part = token.split('.')[1];
    if (!part) throw new Error('malformed JWT');
    const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return JSON.parse(json);
  }

  async function executeAsUser(user: TestUser, query: string, params: any[] = []): Promise<any> {
    const userClient = new Client({
      connectionString: process.env.MIGRATION_DATABASE_URL?.replace(
        'postgres:postgres',
        'app_authenticated:Wd7EmwRWWqY9s7jMVD3kVqnt+OaW5PowxNIxCY5Ful0='
      ),
    });

    try {
      await userClient.connect();

      // Set JWT claims for this transaction (ADR-0003 A1.1 pattern)
      await userClient.query('BEGIN');
      await userClient.query(`SELECT set_config('request.jwt.claim.sub', '', true)`);
      await userClient.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify(user.claims)
      ]);

      const result = await userClient.query(query, params);
      await userClient.query('COMMIT');
      return result;
    } catch (error) {
      await userClient.query('ROLLBACK');
      throw error;
    } finally {
      await userClient.end();
    }
  }

  describe('Scenario 1: System rows are universally readable', () => {
    it('should allow all users to read system exercises with owner_user_id IS NULL', async () => {
      // Create a system exercise (owner_user_id IS NULL)
      const systemExercise = await ownerClient.query(`
        INSERT INTO exercises (slug, name, muscle_groups, owner_user_id)
        VALUES ('test-bench-press-system', 'System Bench Press', '{"chest"}', NULL)
        RETURNING id, slug, name
      `);
      const exerciseId = systemExercise.rows[0].id;

      // Both users should be able to read the system exercise
      const userAResult = await executeAsUser(userA, 
        `SELECT id, slug, name FROM exercises WHERE id = $1`, 
        [exerciseId]
      );
      expect(userAResult.rows).toHaveLength(1);
      expect(userAResult.rows[0].slug).toBe('test-bench-press-system');

      const userBResult = await executeAsUser(userB,
        `SELECT id, slug, name FROM exercises WHERE id = $1`,
        [exerciseId]
      );
      expect(userBResult.rows).toHaveLength(1);
      expect(userBResult.rows[0].slug).toBe('test-bench-press-system');
    });

    it('should allow all users to read system routine_days', async () => {
      // Create a system routine day
      const systemDay = await ownerClient.query(`
        INSERT INTO routine_days (slug, name, owner_user_id)
        VALUES ('test-push-system', 'Test Push Day', NULL)
        RETURNING id, slug, name
      `);
      const dayId = systemDay.rows[0].id;

      // Both users should be able to read the system routine day
      const userAResult = await executeAsUser(userA,
        `SELECT id, slug, name FROM routine_days WHERE id = $1`,
        [dayId]
      );
      expect(userAResult.rows).toHaveLength(1);

      const userBResult = await executeAsUser(userB,
        `SELECT id, slug, name FROM routine_days WHERE id = $1`,
        [dayId]
      );
      expect(userBResult.rows).toHaveLength(1);
    });

    it('should allow all users to read routine_exercises associations', async () => {
      // Create system exercise and routine day
      const exercise = await ownerClient.query(`
        INSERT INTO exercises (slug, name, muscle_groups, owner_user_id)
        VALUES ('test-squat-system', 'System Squat', '{"legs"}', NULL)
        RETURNING id
      `);
      
      const routineDay = await ownerClient.query(`
        INSERT INTO routine_days (slug, name, owner_user_id) 
        VALUES ('test-legs-system', 'Test Legs Day', NULL)
        RETURNING id
      `);

      const association = await ownerClient.query(`
        INSERT INTO routine_exercises (routine_day_id, exercise_id, order_index, target_sets, target_reps)
        VALUES ($1, $2, 0, 3, 10)
        RETURNING id
      `, [routineDay.rows[0].id, exercise.rows[0].id]);

      // Both users should be able to read the association
      const userAResult = await executeAsUser(userA,
        `SELECT id FROM routine_exercises WHERE id = $1`,
        [association.rows[0].id]
      );
      expect(userAResult.rows).toHaveLength(1);

      const userBResult = await executeAsUser(userB,
        `SELECT id FROM routine_exercises WHERE id = $1`, 
        [association.rows[0].id]
      );
      expect(userBResult.rows).toHaveLength(1);
    });
  });

  describe('Scenario 2: User overrides are owner-scoped', () => {
    it('should allow users to read only their own exercise overrides', async () => {
      // User A creates an exercise override
      const userAOverride = await executeAsUser(userA, `
        INSERT INTO exercises (slug, name, muscle_groups, owner_user_id)
        VALUES ('test-bench-press-user-a', 'User A Bench Press', '{"chest"}', $1)
        RETURNING id, slug
      `, [userA.id]);

      const overrideId = userAOverride.rows[0].id;

      // User A should see their override
      const userARead = await executeAsUser(userA,
        `SELECT id, slug FROM exercises WHERE id = $1`,
        [overrideId]
      );
      expect(userARead.rows).toHaveLength(1);
      expect(userARead.rows[0].slug).toBe('test-bench-press-user-a');

      // User B should NOT see User A's override
      const userBRead = await executeAsUser(userB,
        `SELECT id, slug FROM exercises WHERE id = $1`,
        [overrideId]
      );
      expect(userBRead.rows).toHaveLength(0);
    });
  });

  describe('Scenario 3: Cannot write to system rows or other users overrides', () => {
    it('should prevent users from updating system exercises', async () => {
      // Create system exercise
      const systemExercise = await ownerClient.query(`
        INSERT INTO exercises (slug, name, muscle_groups, owner_user_id)
        VALUES ('test-deadlift-system', 'System Deadlift', '{"back"}', NULL)
        RETURNING id
      `);
      const exerciseId = systemExercise.rows[0].id;

      // User A attempts to update system exercise (should affect 0 rows)
      const updateResult = await executeAsUser(userA,
        `UPDATE exercises SET name = 'Hacked Deadlift' WHERE id = $1`,
        [exerciseId]
      );
      expect(updateResult.rowCount).toBe(0);

      // Verify the system exercise was not modified
      const verification = await ownerClient.query(
        `SELECT name FROM exercises WHERE id = $1`,
        [exerciseId]
      );
      expect(verification.rows[0].name).toBe('System Deadlift');
    });

    it('should prevent users from updating other users exercise overrides', async () => {
      // User A creates an override
      const userAOverride = await executeAsUser(userA, `
        INSERT INTO exercises (slug, name, muscle_groups, owner_user_id)
        VALUES ('test-squat-user-a', 'User A Squat', '{"legs"}', $1)
        RETURNING id
      `, [userA.id]);
      const overrideId = userAOverride.rows[0].id;

      // User B attempts to update User A's override (should affect 0 rows)
      const updateResult = await executeAsUser(userB,
        `UPDATE exercises SET name = 'Hacked by User B' WHERE id = $1`,
        [overrideId]
      );
      expect(updateResult.rowCount).toBe(0);

      // Verify User A's override was not modified
      const verification = await executeAsUser(userA,
        `SELECT name FROM exercises WHERE id = $1`,
        [overrideId]
      );
      expect(verification.rows[0].name).toBe('User A Squat');
    });

    it('should prevent users from inserting system exercises (owner_user_id IS NULL)', async () => {
      // User A attempts to create a system exercise (should fail)
      try {
        await executeAsUser(userA, `
          INSERT INTO exercises (slug, name, muscle_groups, owner_user_id)
          VALUES ('test-hack-system', 'Hacked System Exercise', '{"chest"}', NULL)
        `);
        throw new Error('Should have failed due to RLS policy');
      } catch (err) {
        // Should fail because INSERT policy requires owner_user_id = auth.uid()
        // which cannot be NULL
        expect((err as any)?.message).toContain('new row violates row-level security policy');
      }
    });

    it('should prevent users from modifying routine_days (read-only in v1)', async () => {
      // Create system routine day
      const routineDay = await ownerClient.query(`
        INSERT INTO routine_days (slug, name, owner_user_id)
        VALUES ('test-push-readonly', 'Test Push (Read Only)', NULL)
        RETURNING id
      `);
      const dayId = routineDay.rows[0].id;

      // User A attempts to update (should affect 0 rows due to USING (false))
      const updateResult = await executeAsUser(userA,
        `UPDATE routine_days SET name = 'Hacked Push Day' WHERE id = $1`,
        [dayId]
      );
      expect(updateResult.rowCount).toBe(0);

      // User A attempts to insert (should fail due to WITH CHECK (false))
      try {
        await executeAsUser(userA, `
          INSERT INTO routine_days (slug, name, owner_user_id)
          VALUES ('test-user-day', 'User Day', $1)
        `, [userA.id]);
        throw new Error('Should have failed due to RLS policy');
      } catch (err) {
        expect((err as any)?.message).toContain('new row violates row-level security policy');
      }
    });

    it('should prevent users from modifying routine_exercises (read-only in v1)', async () => {
      // Create system data
      const exercise = await ownerClient.query(`
        INSERT INTO exercises (slug, name, muscle_groups, owner_user_id)
        VALUES ('test-press-readonly', 'Test Press', '{"chest"}', NULL)
        RETURNING id
      `);

      const routineDay = await ownerClient.query(`
        INSERT INTO routine_days (slug, name, owner_user_id)
        VALUES ('test-push-readonly2', 'Test Push 2', NULL)
        RETURNING id
      `);

      const association = await ownerClient.query(`
        INSERT INTO routine_exercises (routine_day_id, exercise_id, order_index, target_sets, target_reps)
        VALUES ($1, $2, 0, 3, 8)
        RETURNING id
      `, [routineDay.rows[0].id, exercise.rows[0].id]);

      // User A attempts to update (should affect 0 rows)
      const updateResult = await executeAsUser(userA,
        `UPDATE routine_exercises SET target_sets = 5 WHERE id = $1`,
        [association.rows[0].id]
      );
      expect(updateResult.rowCount).toBe(0);

      // User A attempts to insert (should fail)
      try {
        await executeAsUser(userA, `
          INSERT INTO routine_exercises (routine_day_id, exercise_id, order_index, target_sets, target_reps)
          VALUES ($1, $2, 1, 4, 6)
        `, [routineDay.rows[0].id, exercise.rows[0].id]);
        throw new Error('Should have failed due to RLS policy');
      } catch (err) {
        expect((err as any)?.message).toContain('new row violates row-level security policy');
      }
    });
  });

  describe('Scenario 4: Grant check - RLS vs missing grants', () => {
    it('should return filtered results, not permission denied errors', async () => {
      // Create mixed data: system exercise + user A override
      const systemExercise = await ownerClient.query(`
        INSERT INTO exercises (slug, name, muscle_groups, owner_user_id)
        VALUES ('test-system-grant-check', 'System Exercise', '{"chest"}', NULL)
        RETURNING id
      `);

      const userAOverride = await executeAsUser(userA, `
        INSERT INTO exercises (slug, name, muscle_groups, owner_user_id)
        VALUES ('test-user-a-grant-check', 'User A Exercise', '{"back"}', $1)
        RETURNING id
      `, [userA.id]);

      // User A should see both (system + their override)
      const userAResult = await executeAsUser(userA,
        `SELECT slug FROM exercises WHERE slug LIKE '%-grant-check' ORDER BY slug`
      );
      expect(userAResult.rows).toHaveLength(2);
      expect(userAResult.rows.map((r: { slug: string }) => r.slug)).toEqual([
        'test-system-grant-check',
        'test-user-a-grant-check'
      ]);

      // User B should see only system exercise (filtered, not permission denied)
      const userBResult = await executeAsUser(userB,
        `SELECT slug FROM exercises WHERE slug LIKE '%-grant-check' ORDER BY slug`
      );
      expect(userBResult.rows).toHaveLength(1);
      expect(userBResult.rows[0].slug).toBe('test-system-grant-check');

      // This should be a successful query returning filtered results,
      // NOT a "permission denied for table exercises" error
    });
  });
});