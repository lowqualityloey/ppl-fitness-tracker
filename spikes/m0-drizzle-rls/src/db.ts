/**
 * Connection factories for the spike.
 *
 * Three DSNs, and the difference between them is the whole point:
 *
 *  - OWNER_URL          postgres, BYPASSRLS, owns the tables. Migrations and
 *                       seeding only. If a tenancy test ever runs on this, it
 *                       passes vacuously (spec §4.2, gate-defeating case 1).
 *  - APP_DIRECT_URL     app_authenticated, NOBYPASSRLS, owns nothing. What the
 *                       app uses. Every isolation assertion runs on this.
 *  - APP_POOLER_URL     the same role through supavisor in transaction pooling
 *                       mode, which is what Supabase hands you in production.
 *
 * Local Supabase credentials are shared public defaults, safe to inline.
 */
import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

export const OWNER_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
export const APP_ROLE = 'app_authenticated';
export const APP_PASSWORD = 'spike_only_not_a_secret';
export const APP_DIRECT_URL = `postgresql://${APP_ROLE}:${APP_PASSWORD}@127.0.0.1:54322/postgres`;
/** supavisor tenant is `pooler-dev` locally; role is encoded as `<role>.<tenant>`. */
export const APP_POOLER_URL = `postgresql://${APP_ROLE}.pooler-dev:${APP_PASSWORD}@127.0.0.1:54329/postgres`;

export const SUPABASE_API_URL = 'http://127.0.0.1:54321';
export const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
export const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface Handle {
  db: Db;
  pool: Pool;
  close: () => Promise<void>;
}

/**
 * `max: 1` is not a performance choice. A single physical connection forces
 * every logical request onto the same backend, which is the only way to prove
 * that transaction-local claims do not survive into the next request.
 */
export function connect(connectionString: string, max = 1): Handle {
  const pool = new Pool({ connectionString, max });
  const db = drizzle(pool, { schema });
  return { db, pool, close: () => pool.end() };
}

/** Claim shape GoTrue actually issues. Only `sub` is load-bearing for auth.uid(). */
export interface JwtClaims {
  sub: string;
  role: string;
  aud?: string;
  email?: string;
  exp?: number;
  [k: string]: unknown;
}

/**
 * The production pattern from spec §4.2 / ADR-0003 invariant 4.
 * Third arg to set_config is `is_local` — scoped to this transaction only.
 */
export function withUser<T>(db: Db, claims: JwtClaims, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`,
    );
    return fn(tx);
  });
}

/**
 * Hardened variant. Identical to withUser plus one extra statement.
 *
 * Supabase's auth.uid() is
 *   coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
 *            claims ->> 'sub')
 * so the legacy singular GUC takes priority over the object we set. If
 * `request.jwt.claim.sub` is ever present at session scope on a pooled
 * connection it silently wins. Blanking it transaction-locally closes that door.
 */
export function withUserHardened<T>(
  db: Db,
  claims: JwtClaims,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('request.jwt.claim.sub', '', true)`);
    await tx.execute(
      sql`SELECT set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`,
    );
    return fn(tx);
  });
}

/**
 * NEGATIVE CONTROL — do not copy into the app.
 *
 * Identical except `is_local = false`, which writes the claims at session scope.
 * Exists so the spike can demonstrate that the leak ADR-0003 warns about is
 * real. A mitigation you cannot show failing without it is not evidence.
 */
export function withUserLeaky<T>(db: Db, claims: JwtClaims, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('request.jwt.claims', ${JSON.stringify(claims)}, false)`,
    );
    return fn(tx);
  });
}
