/**
 * M1-07 Mutation check: break each RLS control and prove drift test catches it.
 *
 * A green test suite is not evidence that a control works. It is evidence that
 * the suite passes. This script removes controls, re-runs the drift test,
 * requires a non-zero exit, and puts the control back.
 *
 * Implements the mutation testing pattern from M0 spike for M1-07 merge gate.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

interface Mutation {
  name: string;
  /** Statements that remove the control (create vulnerability). */
  break: string[];
  /** Statements that restore it. */
  restore: string[];
  /** Test file that must fail while the control is missing. */
  expectFailing: string;
}

const MUTATIONS: Mutation[] = [
  {
    name: 'RLS disabled on profiles table',
    break: ['ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY'],
    restore: [
      'ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY',
      'ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY',
    ],
    expectFailing: 'tests/integration/schema-drift.test.ts',
  },
  {
    name: 'RLS not forced on workout_sessions table', 
    break: ['ALTER TABLE public.workout_sessions NO FORCE ROW LEVEL SECURITY'],
    restore: ['ALTER TABLE public.workout_sessions FORCE ROW LEVEL SECURITY'],
    expectFailing: 'tests/integration/schema-drift.test.ts',
  },
  {
    name: 'Zero policies - RLS enabled but no protection',
    break: [
      'DROP POLICY profiles_select ON public.profiles',
      'DROP POLICY profiles_insert ON public.profiles', 
      'DROP POLICY profiles_update ON public.profiles',
      'DROP POLICY profiles_delete ON public.profiles',
    ],
    restore: [
      `CREATE POLICY profiles_select ON public.profiles
         FOR SELECT TO app_authenticated USING (id = (SELECT auth.uid()))`,
      `CREATE POLICY profiles_insert ON public.profiles
         FOR INSERT TO app_authenticated WITH CHECK (id = (SELECT auth.uid()))`,
      `CREATE POLICY profiles_update ON public.profiles
         FOR UPDATE TO app_authenticated
         USING (id = (SELECT auth.uid())) WITH CHECK (id = (SELECT auth.uid()))`,
      `CREATE POLICY profiles_delete ON public.profiles
         FOR DELETE TO app_authenticated USING (id = (SELECT auth.uid()))`,
    ],
    expectFailing: 'tests/integration/schema-drift.test.ts',
  },
  {
    name: 'FOR ALL policy - violates discrete policy invariant',
    break: [
      'DROP POLICY session_sets_select ON public.session_sets',
      'DROP POLICY session_sets_insert ON public.session_sets',
      'DROP POLICY session_sets_update ON public.session_sets', 
      'DROP POLICY session_sets_delete ON public.session_sets',
      `CREATE POLICY session_sets_all ON public.session_sets
         FOR ALL TO app_authenticated
         USING (user_id = (SELECT auth.uid())) 
         WITH CHECK (user_id = (SELECT auth.uid()))`,
    ],
    restore: [
      'DROP POLICY IF EXISTS session_sets_all ON public.session_sets',
      `CREATE POLICY session_sets_select ON public.session_sets
         FOR SELECT TO app_authenticated USING (user_id = (SELECT auth.uid()))`,
      `CREATE POLICY session_sets_insert ON public.session_sets
         FOR INSERT TO app_authenticated WITH CHECK (user_id = (SELECT auth.uid()))`,
      `CREATE POLICY session_sets_update ON public.session_sets
         FOR UPDATE TO app_authenticated
         USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()))`,
      `CREATE POLICY session_sets_delete ON public.session_sets
         FOR DELETE TO app_authenticated USING (user_id = (SELECT auth.uid()))`,
    ],
    expectFailing: 'tests/integration/schema-drift.test.ts',
  },
  {
    name: 'Unprotected table - future migration scenario',
    break: [
      `CREATE TABLE public.unprotected_future_table (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         user_id uuid NOT NULL,
         secret_data text NOT NULL
       )`,
      'GRANT SELECT, INSERT, UPDATE, DELETE ON public.unprotected_future_table TO app_authenticated',
    ],
    restore: ['DROP TABLE IF EXISTS public.unprotected_future_table'],
    expectFailing: 'tests/integration/schema-drift.test.ts',
  },
  {
    // M4-00 (#89): the auth->profiles cascade (migration 0007) is the physical form of
    // ADR-0002's identity invariant; a profile that outlives its auth.users row is
    // stranded data that no policy will ever show. The expectFailing suite deletes real
    // GoTrue users over BOTH the admin API and owner SQL and asserts the whole ownership
    // chain vanishes, so dropping the FK must turn it red. This entry is the scripted,
    // permanent form of docs/tests/2026-09-12-m4-089-break-each-gate-audit.md entry 6.
    // The restore re-validates against the live table: the suite's afterAll (and the
    // 23503 refusal test's self-cleanup) leave no orphan profile behind, so a restore
    // failure would itself be a finding, not plumbing.
    name: 'auth->profiles cascade FK dropped (0007 / #89)',
    break: ['ALTER TABLE public.profiles DROP CONSTRAINT profiles_id_auth_users_fkey'],
    restore: [
      `ALTER TABLE public.profiles
         ADD CONSTRAINT profiles_id_auth_users_fkey
         FOREIGN KEY (id) REFERENCES auth.users (id)
         ON DELETE CASCADE ON UPDATE NO ACTION`,
    ],
    expectFailing: 'tests/integration/auth-user-cascade.test.ts',
  },
];

// Spawn the project's Vitest CLI directly: `npx` is not executable through
// spawnSync on Windows. Resolve it from this file, not the caller's cwd.
const VITEST_ENTRYPOINT = fileURLToPath(
  new URL('../node_modules/vitest/vitest.mjs', import.meta.url),
);

function runVitest(testFile: string): { status: number; output: string } {
  const result = spawnSync(process.execPath, [VITEST_ENTRYPOINT, 'run', testFile], {
    encoding: 'utf8',
    stdio: 'pipe',
  });

  return {
    status: result.status ?? 1,
    output: result.stdout + result.stderr,
  };
}

async function exec(statements: string[]): Promise<void> {
  const client = new Client({
    connectionString: process.env.MIGRATION_DATABASE_URL,
  });
  
  await client.connect();
  try {
    for (const statement of statements) {
      await client.query(statement);
    }
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  console.log('🔬 M1-07 Mutation Check: Proving drift detection catches all violation types\n');
  
  let allGood = true;

  for (const mutation of MUTATIONS) {
    console.log(`💥 Breaking: ${mutation.name}`);
    await exec(mutation.break);
    
    let failedAsExpected = false;
    try {
      const result = runVitest(mutation.expectFailing);
      failedAsExpected = result.status !== 0;
      
      const testMatch = result.output.match(/Tests\s+.*$/m);
      const summary = testMatch?.[0] ?? '(no test summary found)';
      
      if (failedAsExpected) {
        console.log(`✅ CAUGHT   exit=${result.status}  ${summary}`);
      } else {
        console.log(`❌ MISSED   exit=${result.status}  ${summary}`);
        console.log('   ^ This means the test did NOT catch the vulnerability!');
        allGood = false;
      }
    } finally {
      console.log(`🔧 Restoring control...`);
      await exec(mutation.restore);
    }
    console.log('');
  }

  console.log('--- Control restored, full test should pass again ---');
  const finalResult = runVitest('tests/integration/schema-drift.test.ts');
  const finalMatch = finalResult.output.match(/Tests\s+.*$/m);
  const finalSummary = finalMatch?.[0] ?? '(no test summary found)';
  
  if (finalResult.status === 0) {
    console.log(`✅ RESTORED  exit=${finalResult.status}  ${finalSummary}`);
  } else {
    console.log(`❌ BROKEN   exit=${finalResult.status}  ${finalSummary}`);
    console.log('   ^ This means the restore failed - controls not properly restored!');
    allGood = false;
  }

  if (allGood) {
    console.log('\n🎉 All mutation tests PASSED - drift detection catches every violation type!');
    process.exit(0);
  } else {
    console.log('\n💥 Some mutation tests FAILED - drift detection has gaps!');
    process.exit(1);
  }
}

// Verify environment
if (!process.env.MIGRATION_DATABASE_URL) {
  console.error('❌ MIGRATION_DATABASE_URL environment variable required');
  process.exit(1);
}

main().catch((error) => {
  console.error('❌ Mutation check failed:', error);
  process.exit(1);
});