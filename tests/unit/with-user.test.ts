import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client, Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { withUser, type JwtClaims } from '../../lib/db/with-user.js';
import * as schema from '../../db/schema/index.js';

/**
 * M1-11: withUser() helper regression tests
 *
 * These tests specifically verify the two-statement GUC ordering that
 * prevents the legacy GUC hazard discovered in Amendment A1.1.
 *
 * The hazard: Supabase's auth.uid() checks request.jwt.claim.sub FIRST,
 * so stale session-scoped values override transaction-local claims.
 *
 * The fix: withUser() blanks the legacy GUC before setting claims.
 */

const APP_ROLE = 'app_authenticated';
const APP_PASSWORD = 'Wd7EmwRWWqY9s7jMVD3kVqnt+OaW5PowxNIxCY5Ful0=';
const OWNER_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const APP_DIRECT_URL = `postgresql://${APP_ROLE}:${APP_PASSWORD}@127.0.0.1:54322/postgres`;

// Test user claims
const userAClaims: JwtClaims = {
  sub: '11111111-1111-1111-1111-111111111111',
  role: 'authenticated',
  email: 'test-a@example.com',
};

const userBClaims: JwtClaims = {
  sub: '22222222-2222-2222-2222-222222222222', 
  role: 'authenticated',
  email: 'test-b@example.com',
};

describe('M1-11: withUser() helper GUC hazard protection', () => {
  let ownerClient: Client;
  let appPool: Pool;
  let appDb: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    ownerClient = new Client({ connectionString: OWNER_URL });
    await ownerClient.connect();

    appPool = new Pool({ connectionString: APP_DIRECT_URL, max: 1 });
    appDb = drizzle(appPool, { schema });

    // Create test profiles for both users
    await ownerClient.query(`
      INSERT INTO profiles (id, email, display_name) 
      VALUES ($1, $2, 'Test User A'), ($3, $4, 'Test User B')
      ON CONFLICT (id) DO NOTHING
    `, [userAClaims.sub, userAClaims.email, userBClaims.sub, userBClaims.email]);

    // Get an existing exercise or create one
    const exerciseResult = await ownerClient.query(`
      INSERT INTO exercises (name, slug, muscle_groups)
      VALUES ('Test Exercise', 'test-exercise', ARRAY['chest'])
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `);
    const exerciseId = exerciseResult.rows[0]!.id;

    // Create a routine day first (required for workout sessions)
    const routineDayResult = await ownerClient.query(`
      INSERT INTO routine_days (name, slug)
      VALUES ('Test Day', 'test-day')
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `);
    const routineDayId = routineDayResult.rows[0]!.id;

    // Create workout sessions first
    const sessionAResult = await ownerClient.query(`
      INSERT INTO workout_sessions (user_id, routine_day_id, client_id, local_date, started_at)
      VALUES ($1, $2, gen_random_uuid(), CURRENT_DATE, NOW())
      RETURNING id
    `, [userAClaims.sub, routineDayId]);
    const sessionAId = sessionAResult.rows[0]!.id;

    const sessionBResult = await ownerClient.query(`
      INSERT INTO workout_sessions (user_id, routine_day_id, client_id, local_date, started_at)
      VALUES ($1, $2, gen_random_uuid(), CURRENT_DATE + 1, NOW())
      RETURNING id
    `, [userBClaims.sub, routineDayId]);
    const sessionBId = sessionBResult.rows[0]!.id;

    // Create test session_sets data 
    await ownerClient.query(`
      INSERT INTO session_sets (user_id, session_id, exercise_id, set_index, weight_kg, reps, client_ts)
      VALUES 
        ($1, $3, $5, 1, 100.0, 10, NOW()),
        ($2, $4, $5, 1, 120.0, 8, NOW())
      ON CONFLICT DO NOTHING
    `, [userAClaims.sub, userBClaims.sub, sessionAId, sessionBId, exerciseId]);
  });

  afterAll(async () => {
    // Clean up test data (cascading deletes will handle session_sets)
    try {
      await ownerClient.query('DELETE FROM workout_sessions WHERE user_id IN ($1, $2)', [userAClaims.sub, userBClaims.sub]);
      await ownerClient.query('DELETE FROM profiles WHERE id IN ($1, $2)', [userAClaims.sub, userBClaims.sub]);
      await ownerClient.query('DELETE FROM routine_days WHERE slug = $1', ['test-day']);
      await ownerClient.query('DELETE FROM exercises WHERE slug = $1', ['test-exercise']);
    } catch (e) {
      console.warn('Cleanup warning:', e);
    }
    await ownerClient.end();
    await appPool.end();
  }, 15000);

  it('should return correct user data under normal conditions', async () => {
    const rows = await withUser(appDb, userAClaims, (tx) =>
      tx.select().from(schema.sessionSets)
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe(userAClaims.sub);
    expect(rows[0]!.weightKg).toBe('100.00'); // User A's data
  });

  it('should defeat legacy GUC hazard - THE REGRESSION TEST', async () => {
    // Simulate the hazard: set session-scoped request.jwt.claim.sub to user B
    // This mimics a stale value from unrelated code path or pooled connection
    await appDb.execute(sql`SELECT set_config('request.jwt.claim.sub', ${userBClaims.sub}, false)`);

    // Verify the trap is set - without our fix, this would return B's data
    const directCheck = await appDb.execute<{ current_sub: string | null }>(
      sql`SELECT current_setting('request.jwt.claim.sub', true) AS current_sub`
    );
    expect(directCheck.rows[0]!.current_sub).toBe(userBClaims.sub);

    // THE TEST: withUser() should override the stale session-scope value
    const rows = await withUser(appDb, userAClaims, (tx) =>
      tx.select().from(schema.sessionSets)
    );

    // Should see A's data, not B's - proves the legacy GUC was overridden
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe(userAClaims.sub);
    expect(rows[0]!.weightKg).toBe('100.00'); // A's data, not B's 120.00

    // Clean up the poisoned session state
    await appDb.execute(sql`SELECT set_config('request.jwt.claim.sub', '', false)`);
  });

  it('should not leak claims after transaction completion', async () => {
    // Use withUser with A's claims
    await withUser(appDb, userAClaims, async (tx) => {
      const rows = await tx.select().from(schema.sessionSets);
      expect(rows[0]!.userId).toBe(userAClaims.sub);
    });

    // After transaction, claims should be cleared (transaction-local scope)
    const currentClaims = await appDb.execute<{ claims: string | null }>(
      sql`SELECT nullif(current_setting('request.jwt.claims', true), '') AS claims`
    );
    expect(currentClaims.rows[0]!.claims).toBeNull();

    // Queries without claims should see nothing
    const unauthedRows = await appDb.select().from(schema.sessionSets);
    expect(unauthedRows).toEqual([]);
  });

  it('should handle back-to-back calls with different users', async () => {
    // Call withUser with B's claims
    const bRows = await withUser(appDb, userBClaims, (tx) =>
      tx.select().from(schema.sessionSets)
    );
    expect(bRows).toHaveLength(1);
    expect(bRows[0]!.userId).toBe(userBClaims.sub);
    expect(bRows[0]!.weightKg).toBe('120.00');

    // Immediately follow with A's claims - should not bleed
    const aRows = await withUser(appDb, userAClaims, (tx) =>
      tx.select().from(schema.sessionSets) 
    );
    expect(aRows).toHaveLength(1);
    expect(aRows[0]!.userId).toBe(userAClaims.sub);
    expect(aRows[0]!.weightKg).toBe('100.00');
  });

  it('should clean up properly on transaction rollback', async () => {
    await expect(
      withUser(appDb, userAClaims, async (tx) => {
        // Verify claims are set during transaction
        const claims = await tx.execute<{ sub: string | null }>(
          sql`SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub' AS sub`
        );
        expect(claims.rows[0]!.sub).toBe(userAClaims.sub);
        
        // Force rollback
        throw new Error('test rollback');
      })
    ).rejects.toThrow('test rollback');

    // Claims should be cleared after rollback
    const currentClaims = await appDb.execute<{ claims: string | null }>(
      sql`SELECT nullif(current_setting('request.jwt.claims', true), '') AS claims`
    );
    expect(currentClaims.rows[0]!.claims).toBeNull();
  }, 10000);

  it('should verify GUC precedence order matches Supabase auth.uid() behavior', async () => {
    // This test documents the exact precedence that creates the hazard
    
    // Set both GUCs with different values (simulating the hazard condition)  
    await appDb.execute(sql`SELECT set_config('request.jwt.claim.sub', ${userBClaims.sub}, false)`); // session scope
    
    await withUser(appDb, userAClaims, async (tx) => {
      // During withUser transaction, both GUCs are set, but our blanking should win
      const legacyGuc = await tx.execute<{ legacy: string }>(
        sql`SELECT nullif(current_setting('request.jwt.claim.sub', true), '') AS legacy`
      );
      const objectGuc = await tx.execute<{ object_sub: string | null }>(
        sql`SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub' AS object_sub`
      );
      
      // Our withUser() should have blanked the legacy GUC
      expect(legacyGuc.rows[0]!.legacy).toBeNull(); // nullif() returns NULL for empty string
      expect(objectGuc.rows[0]!.object_sub).toBe(userAClaims.sub);
      
      // The data access should reflect A, not B
      const rows = await tx.select().from(schema.sessionSets);
      expect(rows[0]!.userId).toBe(userAClaims.sub);
    });

    // Clean up
    await appDb.execute(sql`SELECT set_config('request.jwt.claim.sub', '', false)`);
  }, 10000);
});