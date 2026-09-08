import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';

/**
 * M1-07: Schema drift detection - the merge gate.
 *
 * RLS is per-table. A migration that adds a table and forgets RLS protection
 * is unprotected, and no isolation test written today would notice because the
 * table doesn't exist yet. Spec §4.2 calls this "gate-defeating case 2."
 *
 * This test is designed to be a CI merge gate - it must pass for PRs to merge.
 * Any violation of RLS shape requirements will cause PR failure.
 *
 * Four violation types caught:
 * 1. RLS not enabled (relrowsecurity = false)
 * 2. RLS not forced (relforcerowsecurity = false)  
 * 3. Zero policies (RLS enabled but no policies = broken deploy)
 * 4. FOR ALL policies (violates "never FOR ALL" invariant)
 */

describe('M1-07: Schema drift detection (MERGE GATE)', () => {
  let ownerClient: Client;

  beforeAll(async () => {
    ownerClient = new Client({
      connectionString: process.env.MIGRATION_DATABASE_URL,
    });
    await ownerClient.connect();
  });

  afterAll(async () => {
    await ownerClient.end();
  });

  /** 
   * The canonical drift query from M0 spike, widened for FOR ALL detection.
   * Returns one row per offending table with diagnostic columns.
   */
  const DRIFT_QUERY = `
    SELECT c.relname                                        AS table_name,
           c.relrowsecurity                                 AS rls_enabled,
           c.relforcerowsecurity                            AS rls_forced,
           (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policy_count,
           (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid AND p.polcmd = '*') AS for_all_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND (c.relrowsecurity IS FALSE
            OR c.relforcerowsecurity IS FALSE
            OR NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
            OR EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polcmd = '*'))
     ORDER BY c.relname
  `;

  interface DriftRow {
    table_name: string;
    rls_enabled: boolean;
    rls_forced: boolean;
    policy_count: string | number; // pg returns count as string
    for_all_count: string | number;
  }

  it('should find zero violating tables in current M1-03/05/06 schema', async () => {
    const result = await ownerClient.query<DriftRow>(DRIFT_QUERY);
    
    if (result.rows.length > 0) {
      console.error('RLS violations found:');
      for (const row of result.rows) {
        console.error(`  ${row.table_name}: rls_enabled=${row.rls_enabled}, rls_forced=${row.rls_forced}, policy_count=${row.policy_count}, for_all_count=${row.for_all_count}`);
      }
    }
    
    expect(result.rows).toHaveLength(0);
  });

  it('should catch table with RLS disabled (violation type 1)', async () => {
    // Create throwaway table with no RLS
    await ownerClient.query(`CREATE TABLE public.drift_test_no_rls (id uuid PRIMARY KEY)`);
    
    try {
      const result = await ownerClient.query<DriftRow>(DRIFT_QUERY);
      const violation = result.rows.find(r => r.table_name === 'drift_test_no_rls');
      
      expect(violation).toBeDefined();
      expect(violation!.rls_enabled).toBe(false);
      expect(violation!.rls_forced).toBe(false);
      expect(Number(violation!.policy_count)).toBe(0);
    } finally {
      await ownerClient.query(`DROP TABLE public.drift_test_no_rls`);
    }
  });

  it('should catch table with RLS enabled but zero policies (violation type 2)', async () => {
    // Create table with RLS enabled but no policies - broken deploy scenario
    await ownerClient.query(`CREATE TABLE public.drift_test_no_policies (id uuid PRIMARY KEY)`);
    await ownerClient.query(`ALTER TABLE public.drift_test_no_policies ENABLE ROW LEVEL SECURITY`);
    await ownerClient.query(`ALTER TABLE public.drift_test_no_policies FORCE ROW LEVEL SECURITY`);
    
    try {
      const result = await ownerClient.query<DriftRow>(DRIFT_QUERY);
      const violation = result.rows.find(r => r.table_name === 'drift_test_no_policies');
      
      expect(violation).toBeDefined();
      expect(violation!.rls_enabled).toBe(true);
      expect(violation!.rls_forced).toBe(true);
      expect(Number(violation!.policy_count)).toBe(0); // This flags it as violation
    } finally {
      await ownerClient.query(`DROP TABLE public.drift_test_no_policies`);
    }
  });

  it('should catch table with FOR ALL policy (violation type 3)', async () => {
    // Create table with FOR ALL policy - violates "never FOR ALL" invariant
    await ownerClient.query(`CREATE TABLE public.drift_test_for_all (id uuid PRIMARY KEY, user_id uuid NOT NULL)`);
    await ownerClient.query(`ALTER TABLE public.drift_test_for_all ENABLE ROW LEVEL SECURITY`);
    await ownerClient.query(`ALTER TABLE public.drift_test_for_all FORCE ROW LEVEL SECURITY`);
    await ownerClient.query(`
      CREATE POLICY drift_test_for_all_policy ON public.drift_test_for_all
        FOR ALL TO app_authenticated 
        USING (user_id = (SELECT auth.uid())) 
        WITH CHECK (user_id = (SELECT auth.uid()))
    `);
    
    try {
      const result = await ownerClient.query<DriftRow>(DRIFT_QUERY);
      const violation = result.rows.find(r => r.table_name === 'drift_test_for_all');
      
      expect(violation).toBeDefined();
      expect(violation!.rls_enabled).toBe(true);
      expect(violation!.rls_forced).toBe(true);
      expect(Number(violation!.policy_count)).toBe(1);
      expect(Number(violation!.for_all_count)).toBe(1); // This flags it as violation
    } finally {
      await ownerClient.query(`DROP TABLE public.drift_test_for_all`);
    }
  });

  it('should verify all protected tables carry four discrete policies, never FOR ALL', async () => {
    // Verify the "four discrete policies" pattern from M1-05/M1-06
    // polcmd: 'r' SELECT, 'a' INSERT, 'w' UPDATE, 'd' DELETE, '*' ALL
    
    const protectedTables = [
      // Content tables (M1-05)
      'exercises', 'routine_days', 'routine_exercises',
      // User-data tables (M1-06) 
      'profiles', 'workout_sessions', 'session_sets', 'session_tasks',
      'personal_records', 'sync_mutations', 'sync_entity_versions',
      'sync_changes', 'import_batches'
    ];

    const result = await ownerClient.query<{ relname: string; cmds: string[] }>(`
      SELECT c.relname, array_agg(p.polcmd::text ORDER BY p.polcmd::text) AS cmds
        FROM pg_policy p 
        JOIN pg_class c ON c.oid = p.polrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname = ANY($1)
       GROUP BY c.relname 
       ORDER BY c.relname
    `, [protectedTables]);

    expect(result.rows).toHaveLength(protectedTables.length);
    
    for (const row of result.rows) {
      // Each table should have exactly 4 discrete policies: SELECT, INSERT, UPDATE, DELETE
      expect(row.cmds.sort()).toEqual(['a', 'd', 'r', 'w']);
      // No table should have FOR ALL policies
      expect(row.cmds).not.toContain('*');
    }
  });

  it('should verify complete RLS coverage across all application tables', async () => {
    // Final comprehensive check: every table in public schema should be protected
    // (except system tables we don't control)
    
    const result = await ownerClient.query(`
      SELECT c.relname,
             c.relrowsecurity AS rls_enabled,
             c.relforcerowsecurity AS rls_forced,
             (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policy_count
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace  
       WHERE n.nspname = 'public'
         AND c.relkind = 'r'
         AND c.relname NOT LIKE 'pg_%'  -- Exclude any system tables
       ORDER BY c.relname
    `);

    const applicationTables = result.rows.filter(r => 
      // Our 12 application tables from the M2 schema
      ['exercises', 'routine_days', 'routine_exercises', 'profiles',
       'workout_sessions', 'session_sets', 'session_tasks',
       'personal_records', 'sync_mutations', 'sync_entity_versions',
       'sync_changes', 'import_batches'].includes(r.relname)
    );

    expect(applicationTables).toHaveLength(12);
    
    for (const table of applicationTables) {
      expect(table.rls_enabled).toBe(true);
      expect(table.rls_forced).toBe(true);
      expect(Number(table.policy_count)).toBeGreaterThan(0);
    }
  });
});