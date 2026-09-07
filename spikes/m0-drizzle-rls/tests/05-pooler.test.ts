/**
 * Fidelity check: the same assertions through supavisor in transaction pooling
 * mode, which is what a deployed Supabase project actually puts in front of
 * Postgres. A size-1 node-postgres pool proves the SQL semantics; it does not
 * prove that a server-side pooler multiplexing many clients onto few backends
 * behaves the same way. FMEA row 2 is about the latter.
 *
 * The is_local = false negative control is deliberately NOT repeated here — it
 * would poison a shared upstream backend that other clients may already hold.
 * Direct-connection evidence for that case is in 04-claims-leak.test.ts.
 */
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { APP_POOLER_URL, APP_ROLE, connect, withUser } from '../src/db.js';
import { sessionSets } from '../src/schema.js';
import { userA, userB } from './fixtures.js';

// More clients than the pooler needs backends for, so checkouts genuinely share.
const pooled = connect(APP_POOLER_URL, 10);

afterAll(() => pooled.close());

describe('through supavisor, transaction mode', () => {
  it('still runs as the non-owner app role', async () => {
    const seen = await withUser(pooled.db, userA.claims, async (tx) => {
      const r = await tx.execute<{ current_user: string }>(sql`SELECT current_user`);
      return r.rows[0]!.current_user;
    });

    expect(seen).toBe(APP_ROLE);
  });

  it('still isolates A from B', async () => {
    const rows = await withUser(pooled.db, userA.claims, (tx) => tx.select().from(sessionSets));

    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe(userA.id);
  });

  it('never crosses identities under interleaved concurrent load', async () => {
    // 40 transactions, alternating users, run concurrently against a pool
    // smaller than the request count. If claims escaped transaction scope,
    // some of these would return the other user's row.
    const users = [userA, userB];
    const results = await Promise.all(
      Array.from({ length: 40 }, (_, i) => {
        const u = users[i % 2]!;
        return withUser(pooled.db, u.claims, async (tx) => {
          const rows = await tx.select().from(sessionSets);
          return { expected: u.id, got: rows.map((r) => r.userId) };
        });
      }),
    );

    for (const r of results) {
      expect(r.got).toEqual([r.expected]);
    }
  });

  it('leaves no claims behind for the next checkout', async () => {
    await Promise.all(
      Array.from({ length: 20 }, () =>
        withUser(pooled.db, userB.claims, (tx) => tx.select().from(sessionSets)),
      ),
    );

    // Fresh claim-less queries across several checkouts. Reads the GUC rather
    // than auth.uid(); the app role has no USAGE on the auth schema.
    const probes = await Promise.all(
      Array.from({ length: 20 }, () =>
        pooled.db.execute<{ sub: string | null }>(
          sql`SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub' AS sub`,
        ),
      ),
    );

    for (const p of probes) {
      expect(p.rows[0]!.sub).toBeNull();
    }

    // And behaviourally: no rows visible without claims.
    const rows = await pooled.db.select().from(sessionSets);
    expect(rows).toEqual([]);
  });
});
