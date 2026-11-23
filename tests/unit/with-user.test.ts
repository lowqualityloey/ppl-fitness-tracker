import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { withUser, type JwtClaims } from '../../lib/db/with-user.js';
import * as schema from '../../db/schema/index.js';
import { appRoleDirectConnectionString } from '../integration/test-helpers.js';

type AppDb = NodePgDatabase<typeof schema> & { $client: Pool };

/**
 * M1-11: withUser() helper regression tests — GUC ordering only.
 *
 * These tests verify the two-statement GUC ordering that prevents the
 * legacy GUC hazard discovered in Amendment A1.1. They use only
 * current_setting() queries, which require no table grants, so they run
 * cleanly on any branch regardless of which M1 migrations are applied.
 *
 * Tests that also verify RLS isolation live in tests/integration/tenancy.test.ts.
 *
 * The hazard: auth.uid() checks request.jwt.claim.sub FIRST.
 * A session-scoped (is_local=false) value in that GUC silently outranks
 * transaction-local request.jwt.claims, causing the wrong user's rows to
 * be returned even though you correctly called set_config with the right claims.
 *
 * The fix: withUser() blanks request.jwt.claim.sub (is_local=true) BEFORE
 * seeding request.jwt.claims, removing the legacy path entirely.
 */

const APP_DIRECT_URL = appRoleDirectConnectionString();

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

// Helper: read current GUC values without any table access
async function readGucs(db: AppDb | Parameters<Parameters<AppDb['transaction']>[0]>[0]) {
  const result = await db.execute<{ legacy_sub: string | null; claims_sub: string | null }>(
    sql`SELECT
      nullif(current_setting('request.jwt.claim.sub', true), '') AS legacy_sub,
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub' AS claims_sub`
  );
  return result.rows[0]!;
}

describe('M1-11: withUser() helper — GUC ordering hazard protection', () => {
  let appPool: Pool;
  let appDb: AppDb;

  beforeAll(async () => {
    appPool = new Pool({ connectionString: APP_DIRECT_URL, max: 1 });
    appDb = drizzle(appPool, { schema }) as AppDb;
  });

  afterAll(async () => {
    // Leave GUCs clean for any subsequent test suites
    await appPool.query("SELECT set_config('request.jwt.claim.sub', '', false)");
    await appPool.query("SELECT set_config('request.jwt.claims', '', false)");
    await appPool.end();
  });

  it('should set claims correctly inside a transaction', async () => {
    await withUser(appDb, userAClaims, async (tx) => {
      const { legacy_sub, claims_sub } = await readGucs(tx);
      // Legacy GUC must be blank — our first set_config clears it
      expect(legacy_sub).toBeNull();
      // Object GUC must have the correct sub
      expect(claims_sub).toBe(userAClaims.sub);
    });
  });

  it('should clear claims after transaction completes (is_local = true)', async () => {
    await withUser(appDb, userAClaims, async (tx) => {
      // inside: claims are set
      const inside = await readGucs(tx);
      expect(inside.claims_sub).toBe(userAClaims.sub);
    });

    // outside: transaction-local GUCs are gone
    const outside = await readGucs(appDb);
    expect(outside.legacy_sub).toBeNull();
    expect(outside.claims_sub).toBeNull();
  });

  it('should defeat legacy GUC hazard — THE REGRESSION TEST', async () => {
    // Poison the session-scoped legacy GUC with user B's id.
    // Without the withUser() blanking step, auth.uid() would resolve to B
    // even though we're about to authenticate as A.
    await appDb.execute(
      sql`SELECT set_config('request.jwt.claim.sub', ${userBClaims.sub}, false)`
    );

    // Confirm the poison is in place
    const poisoned = await readGucs(appDb);
    expect(poisoned.legacy_sub).toBe(userBClaims.sub);

    // withUser() with A's claims must neutralise the stale legacy value
    await withUser(appDb, userAClaims, async (tx) => {
      const inside = await readGucs(tx);
      // Legacy GUC blanked — no longer visible
      expect(inside.legacy_sub).toBeNull();
      // Object GUC carries A's sub, not B's
      expect(inside.claims_sub).toBe(userAClaims.sub);
    });

    // Clean up session-scoped value
    await appDb.execute(sql`SELECT set_config('request.jwt.claim.sub', '', false)`);
  });

  it('should not bleed claims between back-to-back calls', async () => {
    // Call for A
    await withUser(appDb, userAClaims, async (tx) => {
      const g = await readGucs(tx);
      expect(g.claims_sub).toBe(userAClaims.sub);
    });

    // Claims must be cleared before B's call starts
    const between = await readGucs(appDb);
    expect(between.claims_sub).toBeNull();

    // Call for B
    await withUser(appDb, userBClaims, async (tx) => {
      const g = await readGucs(tx);
      expect(g.claims_sub).toBe(userBClaims.sub);
    });
  });

  it('should clear claims after transaction rollback', async () => {
    await expect(
      withUser(appDb, userAClaims, async (tx) => {
        // Claims are set inside the transaction
        const inside = await readGucs(tx);
        expect(inside.claims_sub).toBe(userAClaims.sub);
        throw new Error('forced rollback');
      })
    ).rejects.toThrow('forced rollback');

    // After rollback, transaction-local GUCs are gone
    const after = await readGucs(appDb);
    expect(after.legacy_sub).toBeNull();
    expect(after.claims_sub).toBeNull();
  });

  it('should also blank legacy GUC when starting clean (defensive)', async () => {
    // Even with no prior poisoning, withUser() always issues the blanking statement
    await withUser(appDb, userAClaims, async (tx) => {
      const g = await readGucs(tx);
      expect(g.legacy_sub).toBeNull(); // blanked, even though it was never set
      expect(g.claims_sub).toBe(userAClaims.sub);
    });
  });
});
