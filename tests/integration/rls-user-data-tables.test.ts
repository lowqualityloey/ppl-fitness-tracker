import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Client } from 'pg';

// Local Supabase credentials (shared defaults, safe to inline)
const SUPABASE_API_URL = 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const TEST_PASSWORD = 'test-password-m1-06';
const TEST_EMAILS = ['rls-user-data-a@example.com', 'rls-user-data-b@example.com'];

interface TestUser {
  id: string;
  email: string;
  accessToken: string;
  claims: { sub: string; role: string; email: string };
}

describe('M1-06: RLS on user-data tables', () => {
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
    // Clean user data between tests but keep users themselves
    const directUserIdTables = [
      'workout_sessions', 'session_sets', 
      'personal_records', 'sync_mutations', 'import_batches'
    ];
    
    for (const table of directUserIdTables) {
      await ownerClient.query(`DELETE FROM ${table} WHERE user_id IN ($1, $2)`, [userA.id, userB.id]);
    }
    
    // session_tasks cascades when workout_sessions are deleted, so no separate cleanup needed
  });

  async function cleanupTestData(): Promise<void> {
    try {
      // Delete users via GoTrue Admin API (cascades to profiles via FK)
      for (const email of TEST_EMAILS) {
        const user = await getUserByEmail(email);
        if (user) {
          await fetch(`${SUPABASE_API_URL}/auth/v1/admin/users/${user.id}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
            },
          });
        }
      }
    } catch (error) {
      console.warn('Cleanup warning:', error);
    }
  }

  async function createTestUser(email: string): Promise<TestUser> {
    // Create user via GoTrue Admin API
    const response = await fetch(`${SUPABASE_API_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password: TEST_PASSWORD,
        email_confirm: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create user: ${await response.text()}`);
    }

    const user = await response.json();
    
    // Generate access token
    const tokenResponse = await fetch(`${SUPABASE_API_URL}/auth/v1/admin/generate_link`, {
      method: 'POST', 
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'magiclink',
        email,
      }),
    });

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.properties?.access_token;

    if (!accessToken) {
      throw new Error('Failed to get access token for test user');
    }

    return {
      id: user.id,
      email: user.email,
      accessToken,
      claims: {
        sub: user.id,
        role: 'authenticated',
        email: user.email,
      },
    };
  }

  async function getUserByEmail(email: string) {
    const response = await fetch(`${SUPABASE_API_URL}/auth/v1/admin/users`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
    });

    if (!response.ok) return null;
    
    const { users } = await response.json();
    return users.find((u: any) => u.email === email);
  }

  async function execAsUser(user: TestUser, sql: string, values?: any[]): Promise<any> {
    const appClient = new Client({
      connectionString: process.env.MIGRATION_DATABASE_URL?.replace(
        'postgres:postgres',
        'app_authenticated:Wd7EmwRWWqY9s7jMVD3kVqnt+OaW5PowxNIxCY5Ful0='
      ),
    });
    
    await appClient.connect();
    
    try {
      // Set JWT claims per ADR-0003 A1.1 pattern
      await appClient.query('SET request.jwt.claims TO $1', [JSON.stringify(user.claims)]);
      
      const result = await appClient.query(sql, values);
      return result;
    } finally {
      await appClient.end();
    }
  }

  // Scenario 1: Happy path — own data fully accessible
  describe('Scenario 1: Own data access', () => {
    it('user A can read their own profile', async () => {
      const result = await execAsUser(userA, 'SELECT id, email FROM profiles WHERE id = $1', [userA.id]);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].id).toBe(userA.id);
      expect(result.rows[0].email).toBe(userA.email);
    });

    it('user A can insert and read their own workout session', async () => {
      // Insert workout session
      const sessionId = 'test-session-' + Date.now();
      await execAsUser(userA, 
        'INSERT INTO workout_sessions (id, user_id, routine_day_slug, session_date, status, phase) VALUES ($1, $2, $3, $4, $5, $6)',
        [sessionId, userA.id, 'test-routine', '2024-01-01', 'completed', 'rest']
      );

      // Read it back
      const result = await execAsUser(userA, 'SELECT id, user_id FROM workout_sessions WHERE id = $1', [sessionId]);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].user_id).toBe(userA.id);
    });

    it('user A can update and delete their own data', async () => {
      // Create session_set for user A
      const setId = 'test-set-' + Date.now();
      await execAsUser(userA,
        'INSERT INTO session_sets (id, user_id, exercise_slug, set_index, weight_kg, reps) VALUES ($1, $2, $3, $4, $5, $6)',
        [setId, userA.id, 'squat', 1, 100.5, 10]
      );

      // Update it
      await execAsUser(userA, 'UPDATE session_sets SET reps = 12 WHERE id = $1', [setId]);
      let result = await execAsUser(userA, 'SELECT reps FROM session_sets WHERE id = $1', [setId]);
      expect(result.rows[0].reps).toBe(12);

      // Delete it
      await execAsUser(userA, 'DELETE FROM session_sets WHERE id = $1', [setId]);
      result = await execAsUser(userA, 'SELECT * FROM session_sets WHERE id = $1', [setId]);
      expect(result.rows).toHaveLength(0);
    });
  });

  // Scenario 2: Negative — cross-user read, update, delete all return zero
  describe('Scenario 2: Cross-user isolation', () => {
    let userBSessionId: string;
    let userBSetId: string;

    beforeEach(async () => {
      // Create test data for user B as owner
      userBSessionId = 'test-b-session-' + Date.now();
      userBSetId = 'test-b-set-' + Date.now();

      await ownerClient.query(
        'INSERT INTO workout_sessions (id, user_id, routine_day_slug, session_date, status, phase) VALUES ($1, $2, $3, $4, $5, $6)',
        [userBSessionId, userB.id, 'test-routine', '2024-01-01', 'completed', 'rest']
      );

      await ownerClient.query(
        'INSERT INTO session_sets (id, user_id, exercise_slug, set_index, weight_kg, reps) VALUES ($1, $2, $3, $4, $5, $6)',
        [userBSetId, userB.id, 'squat', 1, 100.5, 10]
      );
    });

    it('user A cannot read user B profile', async () => {
      const result = await execAsUser(userA, 'SELECT * FROM profiles WHERE id = $1', [userB.id]);
      expect(result.rows).toHaveLength(0);
    });

    it('user A gets zero rows when querying user B workout_sessions', async () => {
      const result = await execAsUser(userA, 'SELECT * FROM workout_sessions WHERE user_id = $1', [userB.id]);
      expect(result.rows).toHaveLength(0);
    });

    it('user A gets zero rows when fetching user B session by PK', async () => {
      // No user_id filter - RLS is the only protection
      const result = await execAsUser(userA, 'SELECT * FROM workout_sessions WHERE id = $1', [userBSessionId]);
      expect(result.rows).toHaveLength(0);
    });

    it('user A gets zero rows when querying user B session_sets', async () => {
      const result = await execAsUser(userA, 'SELECT * FROM session_sets WHERE user_id = $1', [userB.id]);
      expect(result.rows).toHaveLength(0);
    });

    it('user A cannot update user B data (zero rows affected)', async () => {
      const result = await execAsUser(userA, 'UPDATE session_sets SET reps = 99 WHERE id = $1', [userBSetId]);
      expect(result.rowCount).toBe(0);
      
      // Verify B's data unchanged
      const check = await ownerClient.query('SELECT reps FROM session_sets WHERE id = $1', [userBSetId]);
      expect(check.rows[0].reps).toBe(10); // Original value
    });

    it('user A cannot delete user B data (zero rows affected)', async () => {
      const result = await execAsUser(userA, 'DELETE FROM session_sets WHERE id = $1', [userBSetId]);
      expect(result.rowCount).toBe(0);
      
      // Verify B's data still exists
      const check = await ownerClient.query('SELECT * FROM session_sets WHERE id = $1', [userBSetId]);
      expect(check.rows).toHaveLength(1);
    });

    it('unfiltered queries only return own data', async () => {
      // Create some data for A as well
      await execAsUser(userA,
        'INSERT INTO session_sets (user_id, exercise_slug, set_index, weight_kg, reps) VALUES ($1, $2, $3, $4, $5)',
        [userA.id, 'bench', 1, 80.0, 8]
      );

      // Unfiltered query should only see A's data
      const result = await execAsUser(userA, 'SELECT user_id FROM session_sets');
      expect(result.rows.length).toBeGreaterThan(0);
      
      // All returned rows should belong to user A
      for (const row of result.rows) {
        expect(row.user_id).toBe(userA.id);
      }
    });
  });

  // Scenario 3: Cross-user insert attempts are rejected
  describe('Scenario 3: Cross-user insert rejection', () => {
    it('user A cannot insert with user B id in workout_sessions', async () => {
      await expect(
        execAsUser(userA,
          'INSERT INTO workout_sessions (user_id, routine_day_slug, session_date, status, phase) VALUES ($1, $2, $3, $4, $5)',
          [userB.id, 'test-routine', '2024-01-01', 'completed', 'rest']
        )
      ).rejects.toThrow(/new row violates row-level security policy/);
    });

    it('user A cannot insert with user B id in session_sets', async () => {
      await expect(
        execAsUser(userA,
          'INSERT INTO session_sets (user_id, exercise_slug, set_index, weight_kg, reps) VALUES ($1, $2, $3, $4, $5)',
          [userB.id, 'squat', 1, 100.5, 10]
        )
      ).rejects.toThrow(/new row violates row-level security policy/);
    });

    it('user A cannot insert with user B id in personal_records', async () => {
      await expect(
        execAsUser(userA,
          'INSERT INTO personal_records (user_id, exercise_slug, record_type, weight_kg, reps) VALUES ($1, $2, $3, $4, $5)',
          [userB.id, 'squat', '1rm', 200.0, 1]
        )
      ).rejects.toThrow(/new row violates row-level security policy/);
    });
  });

  // Scenario 4: profiles cannot be re-keyed
  describe('Scenario 4: Profile re-keying protection', () => {
    it('user A cannot change their own profile ID', async () => {
      await expect(
        execAsUser(userA, 'UPDATE profiles SET id = $1 WHERE id = $2', [userB.id, userA.id])
      ).rejects.toThrow(/new row violates row-level security policy/);
    });
  });

  // Additional coverage for all user-data tables
  describe('Coverage: All user-data tables', () => {
    it('session_tasks isolation works correctly', async () => {
      // First create a workout session for user B
      const sessionId = 'test-b-session-tasks-' + Date.now();
      await ownerClient.query(
        'INSERT INTO workout_sessions (id, user_id, routine_day_slug, session_date, status, phase) VALUES ($1, $2, $3, $4, $5, $6)',
        [sessionId, userB.id, 'test-routine', '2024-01-01', 'completed', 'rest']
      );
      
      // Insert task as owner for user B's session
      const taskId = 'test-task-' + Date.now();
      await ownerClient.query(
        'INSERT INTO session_tasks (id, session_id, task_key, client_ts) VALUES ($1, $2, $3, $4)',
        [taskId, sessionId, 'warmup', '2024-01-01 12:00:00+00']
      );

      // User A cannot see it
      const result = await execAsUser(userA, 'SELECT * FROM session_tasks WHERE id = $1', [taskId]);
      expect(result.rows).toHaveLength(0);

      // User A cannot insert into B's session
      const userASessionId = 'test-a-session-' + Date.now(); 
      await execAsUser(userA,
        'INSERT INTO workout_sessions (id, user_id, routine_day_slug, session_date, status, phase) VALUES ($1, $2, $3, $4, $5, $6)',
        [userASessionId, userA.id, 'test-routine', '2024-01-02', 'completed', 'rest']
      );
      
      await expect(
        execAsUser(userA, 'INSERT INTO session_tasks (session_id, task_key, client_ts) VALUES ($1, $2, $3)', 
          [sessionId, 'warmup', '2024-01-01 12:00:00+00']) // B's session
      ).rejects.toThrow(/new row violates row-level security policy/);
    });

    it('sync_mutations isolation works correctly', async () => {
      // Insert as owner for user B
      const mutationId = 'test-mutation-' + Date.now();
      await ownerClient.query(
        'INSERT INTO sync_mutations (id, user_id, table_name, operation, record_id) VALUES ($1, $2, $3, $4, $5)',
        [mutationId, userB.id, 'session_sets', 'insert', 'some-set-id']
      );

      // User A cannot see it
      const result = await execAsUser(userA, 'SELECT * FROM sync_mutations WHERE id = $1', [mutationId]);
      expect(result.rows).toHaveLength(0);
    });

    it('import_batches isolation works correctly', async () => {
      // Insert as owner for user B  
      const batchId = 'test-batch-' + Date.now();
      await ownerClient.query(
        'INSERT INTO import_batches (id, user_id, source_app, import_status) VALUES ($1, $2, $3, $4)',
        [batchId, userB.id, 'strongapp', 'pending']
      );

      // User A cannot see it
      const result = await execAsUser(userA, 'SELECT * FROM import_batches WHERE id = $1', [batchId]);
      expect(result.rows).toHaveLength(0);
    });
  });
});