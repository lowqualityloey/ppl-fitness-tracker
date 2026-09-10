/**
 * Environment preflight for the DB-backed suites.
 *
 * Exists because of a real 2026-09-11 incident in this checkout: `npm run test:red`
 * produced 21 failures, of which 10 were HTTP 500s from `/api/sessions` and `/api/sync`
 * and looked exactly like product regressions in code that had been reviewed and merged.
 * The actual cause was that `.env.local` carried a stale `app_authenticated` password,
 * while migration `0001` creates that role with a different hard-coded literal. Wrong
 * credential, unrelated-looking symptom, ~30 minutes to disprove a false theory (the
 * route suites pass 19/19 where handlers exist once the credential is correct).
 *
 * This script separates "the environment is broken" from "the code is broken" in about
 * two seconds, and never prints a secret — it compares SHA-256 prefixes.
 *
 * Usage: npm run db:up && npm run test:api:preflight
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

const results: string[] = [];
let failed = false;

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function passwordOf(connectionString: string): string | undefined {
  const match = /\/\/[^:\/]+:([^@]+)@/.exec(connectionString);
  return match?.[1] === undefined ? undefined : decodeURIComponent(match[1]);
}

async function check(name: string, run: () => Promise<string>): Promise<void> {
  try {
    results.push(`  ok    ${name} — ${await run()}`);
  } catch (error) {
    failed = true;
    const detail = error instanceof Error ? error.message : String(error);
    results.push(`  FAIL  ${name} — ${detail}`);
  }
}

async function main(): Promise<void> {
  const appUrl = process.env.DATABASE_URL;
  const ownerUrl = process.env.MIGRATION_DATABASE_URL;
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';

  if (!appUrl || !ownerUrl) {
    console.error(
      'DATABASE_URL and MIGRATION_DATABASE_URL must be set.\n' +
        'Try:  npm run db:up && set -a && . ./.env.local && set +a && npm run test:api:preflight',
    );
    process.exit(2);
  }

  await check('owner connection (direct 54322)', async () => {
    const client = new Client({ connectionString: ownerUrl });
    await client.connect();
    try {
      const { rows } = await client.query<{ cu: string; n: string }>(
        'select current_user as cu, (select count(*)::text from pg_tables where schemaname = $1) as n',
        ['public'],
      );
      const row = rows[0];
      if (!row) throw new Error('no row returned');
      if (row.cu !== 'postgres') throw new Error(`expected owner role, connected as ${row.cu}`);
      return `connected as postgres, ${row.n} public tables`;
    } finally {
      await client.end();
    }
  });

  await check('app-role connection (DATABASE_URL)', async () => {
    const client = new Client({ connectionString: appUrl });
    await client.connect();
    try {
      const { rows } = await client.query<{ cu: string; rls: string }>(
        'select current_user as cu, (select rolbypassrls::text from pg_roles where rolname = current_user) as rls',
      );
      const row = rows[0];
      if (!row) throw new Error('no row returned');
      if (row.cu !== 'app_authenticated') {
        throw new Error(`expected app_authenticated, connected as ${row.cu} — RLS would be bypassed`);
      }
      if (row.rls !== 'false') throw new Error('app role has BYPASSRLS; ADR-0003 is not in force');
      return 'connected as app_authenticated, BYPASSRLS=false';
    } finally {
      await client.end();
    }
  });

  await check('app-role password matches the migration literal', async () => {
    const literal = /PASSWORD '([^']+)'/
      .exec(readFileSync('supabase/migrations/0001_app_authenticated_role_trigger.sql', 'utf8'))?.[1];
    if (!literal) return 'no literal password in 0001 (nothing to compare — verify by hand)';
    const envPw = passwordOf(appUrl);
    if (envPw === undefined) return 'DATABASE_URL carries no password segment';
    if (digest(envPw) !== digest(literal)) {
      throw new Error(
        `credential drift: DATABASE_URL password (${digest(envPw)}, len ${envPw.length}) ` +
          `!= migration 0001 literal (${digest(literal)}, len ${literal.length}). ` +
          'This makes every route return HTTP 500 — it is not a code bug. Fix .env.local.',
      );
    }
    return `aligned (${digest(literal)})`;
  });

  await check('GoTrue reachable', async () => {
    const response = await fetch(`${baseUrl}/auth/v1/health`);
    if (!response.ok) throw new Error(`${baseUrl}/auth/v1/health returned ${response.status}`);
    return `${baseUrl} is serving (status ${response.status})`;
  });

  console.log('API integration environment preflight');
  console.log(results.join('\n'));
  if (failed) {
    console.log('\nPreflight failed. Do not read a red test suite as a code regression until this is green.');
    process.exit(1);
  }
  console.log('\nPreflight green. `npm run test:api` results can be trusted as code signal.');
}

void main();
