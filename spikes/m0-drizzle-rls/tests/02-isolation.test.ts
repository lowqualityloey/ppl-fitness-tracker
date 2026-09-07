/**
 * M0-02 and M0-03 — the core question.
 *
 * Two users exist. Authenticated as A, every Drizzle read, write, update and
 * delete aimed at B must come back empty or rejected. Reads go through the
 * Drizzle query builder, not raw SQL, because the ORM path is what ships.
 */
import { eq, sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { APP_DIRECT_URL, connect, withUser } from '../src/db.js';
import { profiles, sessionSets } from '../src/schema.js';
import { userA, userB } from './fixtures.js';

const app = connect(APP_DIRECT_URL);

afterAll(() => app.close());

describe('M0-02/03: cross-user reads', () => {
  it('an unfiltered select returns only A rows', async () => {
    const rows = await withUser(app.db, userA.claims, (tx) => tx.select().from(sessionSets));

    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe(userA.id);
  });

  it('explicitly asking for B rows returns zero', async () => {
    // The shape of a real bug: a handler that trusts a user id from the request.
    const rows = await withUser(app.db, userA.claims, (tx) =>
      tx.select().from(sessionSets).where(eq(sessionSets.userId, userB.id)),
    );

    expect(rows).toEqual([]);
  });

  it('fetching B row by its primary key returns zero', async () => {
    // No user_id predicate at all — RLS is the only thing standing here.
    const rows = await withUser(app.db, userA.claims, (tx) =>
      tx.select().from(sessionSets).where(eq(sessionSets.id, userB.setId)),
    );

    expect(rows).toEqual([]);
  });

  it('cannot read B profile', async () => {
    const rows = await withUser(app.db, userA.claims, (tx) =>
      tx.select().from(profiles).where(eq(profiles.id, userB.id)),
    );

    expect(rows).toEqual([]);
  });

  it('aggregate count cannot be used to infer B rows', async () => {
    // A COUNT(*) has no target list to filter, so it is worth confirming that
    // policies apply to the scan and not just to returned columns.
    const r = await withUser(app.db, userA.claims, (tx) =>
      tx.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM public.session_sets`),
    );

    expect(r.rows[0]!.n).toBe('1');
  });
});

describe('M0-02/03: cross-user writes', () => {
  it('updating B row affects zero rows', async () => {
    const updated = await withUser(app.db, userA.claims, (tx) =>
      tx
        .update(sessionSets)
        .set({ reps: 999 })
        .where(eq(sessionSets.id, userB.setId))
        .returning({ id: sessionSets.id }),
    );

    expect(updated).toEqual([]);
  });

  it('deleting B row affects zero rows', async () => {
    const deleted = await withUser(app.db, userA.claims, (tx) =>
      tx.delete(sessionSets).where(eq(sessionSets.id, userB.setId)).returning({ id: sessionSets.id }),
    );

    expect(deleted).toEqual([]);
  });

  it('inserting a row attributed to B is rejected, not silently dropped', async () => {
    // WITH CHECK raises 42501 rather than filtering. A rejection is the correct
    // outcome: a silent drop would let the client believe the write landed.
    await expect(
      withUser(app.db, userA.claims, (tx) =>
        tx.insert(sessionSets).values({
          userId: userB.id,
          exerciseSlug: 'smuggled',
          setIndex: 1,
        }),
      ),
      // Drizzle wraps driver errors in DrizzleQueryError; the pg error, and so
      // the SQLSTATE, hangs off `cause`.
    ).rejects.toMatchObject({ cause: { code: '42501' } });
  });

  it('B row survived both attempts intact', async () => {
    const rows = await withUser(app.db, userB.claims, (tx) =>
      tx.select().from(sessionSets).where(eq(sessionSets.id, userB.setId)),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.reps).toBe(5);
  });
});

describe('no claims at all', () => {
  it('a query with no JWT claims set sees nothing', async () => {
    // auth.uid() returns NULL, `user_id = NULL` is NULL, so no row qualifies.
    const rows = await app.db.select().from(sessionSets);
    expect(rows).toEqual([]);
  });

  it('a garbage sub is an error, not an open door', async () => {
    await expect(
      withUser(app.db, { sub: 'not-a-uuid', role: 'authenticated' }, (tx) =>
        tx.select().from(sessionSets),
      ),
    ).rejects.toMatchObject({ cause: { code: '22P02' } });
  });
});
