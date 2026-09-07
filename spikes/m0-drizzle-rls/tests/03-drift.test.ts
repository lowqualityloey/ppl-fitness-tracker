/**
 * M0-05 — the drift detector.
 *
 * RLS is per-table. A migration that adds a table and forgets
 * ENABLE ROW LEVEL SECURITY is unprotected, and no isolation test written
 * today would notice, because the table does not exist yet. Spec §4.2 calls
 * this gate-defeating case 2.
 *
 * sql/001-setup.sql deliberately creates `unprotected_future_table` with no
 * RLS and no policies, so this file can prove the detector fires rather than
 * merely prove it runs.
 */
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { APP_DIRECT_URL, OWNER_URL, connect } from '../src/db.js';

const owner = connect(OWNER_URL);
const app = connect(APP_DIRECT_URL);

afterAll(async () => {
  await Promise.all([owner.close(), app.close()]);
});

/** The query intended for CI. Returns one row per offending table. */
const DRIFT_QUERY = sql`
  SELECT c.relname                                        AS table_name,
         c.relrowsecurity                                  AS rls_enabled,
         c.relforcerowsecurity                             AS rls_forced,
         (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policy_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind = 'r'
     AND (c.relrowsecurity IS FALSE
          OR c.relforcerowsecurity IS FALSE
          OR NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid))
   ORDER BY c.relname`;

interface DriftRow extends Record<string, unknown> {
  table_name: string;
  rls_enabled: boolean;
  rls_forced: boolean;
  /** node-postgres returns bigint/count as a string. */
  policy_count: string | number;
}

describe('M0-05: pg_tables drift check', () => {
  it('flags exactly the table that was left unprotected', async () => {
    const r = await owner.db.execute<DriftRow>(DRIFT_QUERY);

    expect(r.rows.map((x) => x.table_name)).toEqual(['unprotected_future_table']);
    expect(r.rows[0]).toMatchObject({ rls_enabled: false, rls_forced: false });
    expect(Number(r.rows[0]!.policy_count)).toBe(0);
  });

  it('confirms the flagged table really is readable across users', async () => {
    // What the detector is buying. Without it this table leaks silently.
    const rows = await app.db.execute<{ n: string }>(
      sql`SELECT count(*)::text AS n FROM public.unprotected_future_table`,
    );

    expect(rows.rows[0]!.n).toBe('2');
  });

  it('a table with RLS enabled but zero policies is still flagged', async () => {
    // Enabling RLS with no policies denies everything, which looks safe but is
    // a broken deploy rather than a secure one. The detector must not call it OK.
    await owner.db.execute(sql`CREATE TABLE public.drift_probe (id uuid PRIMARY KEY)`);
    await owner.db.execute(sql`ALTER TABLE public.drift_probe ENABLE ROW LEVEL SECURITY`);
    await owner.db.execute(sql`ALTER TABLE public.drift_probe FORCE ROW LEVEL SECURITY`);
    try {
      const r = await owner.db.execute<DriftRow>(DRIFT_QUERY);
      const probe = r.rows.find((x) => x.table_name === 'drift_probe');
      expect(probe).toBeDefined();
      expect(Number(probe!.policy_count)).toBe(0);
    } finally {
      await owner.db.execute(sql`DROP TABLE public.drift_probe`);
    }
  });

  it('the two protected tables each carry four discrete policies, never FOR ALL', async () => {
    // polcmd: 'r' SELECT, 'a' INSERT, 'w' UPDATE, 'd' DELETE, '*' ALL.
    const r = await owner.db.execute<{ relname: string; cmds: string[] }>(sql`
      SELECT c.relname, array_agg(p.polcmd::text ORDER BY p.polcmd::text) AS cmds
        FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
       WHERE c.relname IN ('profiles', 'session_sets')
       GROUP BY c.relname ORDER BY c.relname`);

    expect(r.rows).toHaveLength(2);
    for (const row of r.rows) {
      expect(row.cmds.sort()).toEqual(['a', 'd', 'r', 'w']);
      expect(row.cmds).not.toContain('*');
    }
  });
});
