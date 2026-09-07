/**
 * M0-06 — does set_config leak identity across pooled requests?
 *
 * ADR-0003 invariant 4 says the third argument to set_config must be `true`.
 * A mitigation with no demonstrated failure mode is an assertion, not evidence,
 * so this file runs the wrong version first and proves it hands one user's
 * identity to the next request on the same physical connection.
 *
 * Every scenario gets its own pool with max: 1, and each asserts the two calls
 * landed on the same backend pid. Without that check, a clean second read
 * could just mean a different connection answered it.
 */
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  APP_DIRECT_URL,
  connect,
  withUser,
  withUserHardened,
  withUserLeaky,
  type Db,
} from '../src/db.js';
import { sessionSets } from '../src/schema.js';
import { userA, userB } from './fixtures.js';

async function backendPid(db: Db): Promise<number> {
  const r = await db.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`);
  return Number(r.rows[0]!.pid);
}

/**
 * Identity as the connection currently sees it. Reads the GUC rather than
 * auth.uid(), because the app role has no USAGE on the auth schema — see
 * sql/001-setup.sql. Same value the policies resolve through.
 */
async function currentSub(db: Db): Promise<string | null> {
  const r = await db.execute<{ sub: string | null }>(
    // nullif is load-bearing: once a transaction-local set_config goes out of
    // scope the GUC reads back as '' rather than unset, and ''::jsonb raises
    // 22P02. This is why Supabase's own auth.uid() wraps it the same way.
    sql`SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub' AS sub`,
  );
  return r.rows[0]!.sub;
}

describe('M0-06: is_local = false leaks (negative control)', () => {
  it('a later claim-less request on the same connection reads B rows', async () => {
    const h = connect(APP_DIRECT_URL, 1);
    try {
      const pidDuring = await withUserLeaky(h.db, userB.claims, async (tx) => {
        const rows = await tx.select().from(sessionSets);
        expect(rows).toHaveLength(1);
        expect(rows[0]!.userId).toBe(userB.id);
        const p = await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`);
        return Number(p.rows[0]!.pid);
      });

      // Simulates the next HTTP request picking up the same pooled connection
      // and, for whatever reason, not setting claims.
      const pidAfter = await backendPid(h.db);
      expect(pidAfter).toBe(pidDuring);

      expect(await currentSub(h.db)).toBe(userB.id);

      const leaked = await h.db.select().from(sessionSets);
      expect(leaked).toHaveLength(1);
      expect(leaked[0]!.userId).toBe(userB.id);
    } finally {
      // Discard the poisoned connection rather than letting the pool reuse it.
      await h.close();
    }
  });
});

describe('M0-06: is_local = true does not leak', () => {
  it('a later claim-less request on the same connection sees nothing', async () => {
    const h = connect(APP_DIRECT_URL, 1);
    try {
      const pidDuring = await withUser(h.db, userB.claims, async (tx) => {
        const rows = await tx.select().from(sessionSets);
        expect(rows).toHaveLength(1);
        const p = await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`);
        return Number(p.rows[0]!.pid);
      });

      const pidAfter = await backendPid(h.db);
      expect(pidAfter).toBe(pidDuring);

      expect(await currentSub(h.db)).toBeNull();

      const rows = await h.db.select().from(sessionSets);
      expect(rows).toEqual([]);
    } finally {
      await h.close();
    }
  });

  it('B claims do not bleed into a following A transaction', async () => {
    const h = connect(APP_DIRECT_URL, 1);
    try {
      await withUser(h.db, userB.claims, (tx) => tx.select().from(sessionSets));
      const rows = await withUser(h.db, userA.claims, (tx) => tx.select().from(sessionSets));

      expect(rows).toHaveLength(1);
      expect(rows[0]!.userId).toBe(userA.id);
    } finally {
      await h.close();
    }
  });

  it('a rolled-back transaction leaves no claims behind', async () => {
    const h = connect(APP_DIRECT_URL, 1);
    try {
      await expect(
        withUser(h.db, userB.claims, async () => {
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      expect(await currentSub(h.db)).toBeNull();
    } finally {
      await h.close();
    }
  });
});

describe('undocumented hazard: auth.uid() prefers the legacy singular GUC', () => {
  it('a session-scoped request.jwt.claim.sub overrides transaction-local claims', async () => {
    // Not in the spec. Found by reading pg_get_functiondef('auth.uid()') on the
    // stock image: the coalesce checks request.jwt.claim.sub FIRST and only
    // falls back to request.jwt.claims ->> 'sub'. So withUser() as written can
    // be overridden by a stale session-scope value it never sets itself.
    const h = connect(APP_DIRECT_URL, 1);
    try {
      await h.db.execute(sql`SELECT set_config('request.jwt.claim.sub', ${userB.id}, false)`);

      const rows = await withUser(h.db, userA.claims, (tx) => tx.select().from(sessionSets));

      // Authenticated as A, reading B data.
      expect(rows).toHaveLength(1);
      expect(rows[0]!.userId).toBe(userB.id);
    } finally {
      await h.close();
    }
  });

  it('withUserHardened blanks the legacy GUC transaction-locally and closes it', async () => {
    const h = connect(APP_DIRECT_URL, 1);
    try {
      await h.db.execute(sql`SELECT set_config('request.jwt.claim.sub', ${userB.id}, false)`);

      const rows = await withUserHardened(h.db, userA.claims, (tx) =>
        tx.select().from(sessionSets),
      );

      expect(rows).toHaveLength(1);
      expect(rows[0]!.userId).toBe(userA.id);
    } finally {
      await h.close();
    }
  });
});
