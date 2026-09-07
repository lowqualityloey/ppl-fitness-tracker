/**
 * Mutation check: break each control in turn and confirm the suite goes red.
 *
 * A green test suite is not evidence that a control works. It is evidence that
 * the suite passes. This script removes the control, re-runs the relevant
 * tests, requires a non-zero exit, and puts the control back.
 *
 * Existing repo rule this enforces: "A security control does not exist until a
 * merge-gating test proves it runs" (PROMPTKIT.md §6).
 */
import { spawnSync } from 'node:child_process';
import { Client } from 'pg';
import { OWNER_URL } from '../src/db.js';

interface Mutation {
  name: string;
  /** Statements that remove the control. */
  break: string[];
  /** Statements that restore it. */
  restore: string[];
  /** Test files that must fail while the control is missing. */
  expectFailing: string[];
}

const MUTATIONS: Mutation[] = [
  {
    name: 'RLS disabled on session_sets',
    break: ['ALTER TABLE public.session_sets DISABLE ROW LEVEL SECURITY'],
    restore: [
      'ALTER TABLE public.session_sets ENABLE ROW LEVEL SECURITY',
      'ALTER TABLE public.session_sets FORCE ROW LEVEL SECURITY',
    ],
    expectFailing: ['tests/02-isolation.test.ts', 'tests/03-drift.test.ts'],
  },
  {
    name: 'SELECT policy widened to USING (true)',
    break: [
      'DROP POLICY session_sets_select ON public.session_sets',
      'CREATE POLICY session_sets_select ON public.session_sets FOR SELECT TO app_authenticated USING (true)',
    ],
    restore: [
      'DROP POLICY IF EXISTS session_sets_select ON public.session_sets',
      `CREATE POLICY session_sets_select ON public.session_sets
         FOR SELECT TO app_authenticated USING (user_id = (SELECT auth.uid()))`,
    ],
    expectFailing: ['tests/02-isolation.test.ts'],
  },
  {
    name: 'four discrete policies collapsed into one FOR ALL',
    break: [
      'DROP POLICY session_sets_insert ON public.session_sets',
      'DROP POLICY session_sets_update ON public.session_sets',
      'DROP POLICY session_sets_delete ON public.session_sets',
      `CREATE POLICY session_sets_all ON public.session_sets
         FOR ALL TO app_authenticated
         USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()))`,
    ],
    restore: [
      'DROP POLICY IF EXISTS session_sets_all ON public.session_sets',
      'DROP POLICY IF EXISTS session_sets_insert ON public.session_sets',
      `CREATE POLICY session_sets_insert ON public.session_sets
         FOR INSERT TO app_authenticated WITH CHECK (user_id = (SELECT auth.uid()))`,
      'DROP POLICY IF EXISTS session_sets_update ON public.session_sets',
      `CREATE POLICY session_sets_update ON public.session_sets
         FOR UPDATE TO app_authenticated
         USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()))`,
      'DROP POLICY IF EXISTS session_sets_delete ON public.session_sets',
      `CREATE POLICY session_sets_delete ON public.session_sets
         FOR DELETE TO app_authenticated USING (user_id = (SELECT auth.uid()))`,
    ],
    // Isolation still holds here — FOR ALL is a maintainability and
    // least-privilege objection, not an immediate leak. Only the drift/shape
    // check should notice, and that distinction is worth recording.
    expectFailing: ['tests/03-drift.test.ts'],
  },
];

function runVitest(files: string[], skipSetup: boolean) {
  return spawnSync('npx', ['vitest', '--run', ...files], {
    cwd: new URL('..', import.meta.url).pathname,
    encoding: 'utf8',
    // The DDL is idempotent, so letting globalSetup run would repair the
    // mutation before the assertions execute.
    env: { ...process.env, ...(skipSetup ? { SKIP_DB_SETUP: '1' } : {}) },
  });
}

async function exec(statements: string[]) {
  const c = new Client({ connectionString: OWNER_URL });
  await c.connect();
  try {
    for (const s of statements) await c.query(s);
  } finally {
    await c.end();
  }
}

let allGood = true;

for (const m of MUTATIONS) {
  await exec(m.break);
  let failedAsExpected = false;
  try {
    const r = runVitest(m.expectFailing, true);
    failedAsExpected = r.status !== 0;
    const summary = (r.stdout ?? '').match(/Tests\s+.*$/m)?.[0] ?? '(no summary)';
    console.log(
      `${failedAsExpected ? 'CAUGHT  ' : 'MISSED  '} ${m.name}\n           exit=${r.status}  ${summary}`,
    );
  } finally {
    await exec(m.restore);
  }
  if (!failedAsExpected) allGood = false;
}

console.log('\n--- control restored, full suite should be green again ---');
const final = runVitest([], false);
const finalSummary = (final.stdout ?? '').match(/Tests\s+.*$/m)?.[0] ?? '(no summary)';
console.log(`exit=${final.status}  ${finalSummary}`);
if (final.status !== 0) allGood = false;

process.exit(allGood ? 0 : 1);
