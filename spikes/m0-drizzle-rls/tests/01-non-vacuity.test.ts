/**
 * M0-01 and M0-04 — is the harness capable of failing at all?
 *
 * Every other assertion in this spike is worthless if the connection under
 * test can bypass RLS. Spec §4.2 names this as gate-defeating case 1. So this
 * file runs first and proves three things: the app role has no bypass
 * attribute, it owns nothing, and the session really is running as that role.
 *
 * It also demonstrates the inverse — that the owner connection DOES see
 * everything, even with FORCE ROW LEVEL SECURITY set. That is the trap.
 */
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { APP_DIRECT_URL, APP_ROLE, OWNER_URL, connect, withUser } from '../src/db.js';
import { sessionSets } from '../src/schema.js';
import { userA } from './fixtures.js';

const app = connect(APP_DIRECT_URL);
const owner = connect(OWNER_URL);

afterAll(async () => {
  await Promise.all([app.close(), owner.close()]);
});

describe('M0-01: the app role cannot bypass RLS', () => {
  it('has NOBYPASSRLS, NOSUPERUSER', async () => {
    const rows = await owner.db.execute<{
      rolname: string;
      rolbypassrls: boolean;
      rolsuper: boolean;
      rolcanlogin: boolean;
    }>(sql`SELECT rolname, rolbypassrls, rolsuper, rolcanlogin
             FROM pg_roles WHERE rolname = ${APP_ROLE}`);

    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({
      rolbypassrls: false,
      rolsuper: false,
      rolcanlogin: true,
    });
  });

  it('does not inherit a bypass attribute through any granted role', async () => {
    // NOINHERIT alone is not enough to reason about; ask Postgres directly.
    const rows = await owner.db.execute<{ granted: string }>(sql`
      SELECT r.rolname AS granted
        FROM pg_auth_members m
        JOIN pg_roles r ON r.oid = m.roleid
        JOIN pg_roles g ON g.oid = m.member
       WHERE g.rolname = ${APP_ROLE}
         AND (r.rolbypassrls OR r.rolsuper)`);

    expect(rows.rows).toEqual([]);
  });

  it('owns no table in the public schema', async () => {
    // A table owner is exempt from its own policies unless FORCE is set, so
    // ownership is a second, independent escape hatch.
    const rows = await owner.db.execute<{ tablename: string }>(sql`
      SELECT tablename FROM pg_tables
       WHERE schemaname = 'public' AND tableowner = ${APP_ROLE}`);

    expect(rows.rows).toEqual([]);
  });
});

describe('M0-04: the session under test is really the app role', () => {
  it('reports current_user = app_authenticated inside withUser', async () => {
    const seen = await withUser(app.db, userA.claims, async (tx) => {
      const r = await tx.execute<{ current_user: string; session_user: string }>(
        sql`SELECT current_user, session_user`,
      );
      return r.rows[0]!;
    });

    expect(seen.current_user).toBe(APP_ROLE);
    expect(seen.session_user).toBe(APP_ROLE);
  });

  it('carries the JWT sub GoTrue issued, read back from the GUC', async () => {
    // Read the GUC rather than calling auth.uid(): the app role has no USAGE on
    // the auth schema (see sql/001-setup.sql), which is intentional.
    const sub = await withUser(app.db, userA.claims, async (tx) => {
      const r = await tx.execute<{ sub: string | null }>(
        sql`SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub' AS sub`,
      );
      return r.rows[0]!.sub;
    });

    expect(sub).toBe(userA.id);
  });

  it('cannot reach the auth schema directly', async () => {
    // Least privilege, and the reason every identity probe in this suite reads
    // the GUC instead of auth.uid(). Policies still resolve auth.uid() fine.
    await expect(
      withUser(app.db, userA.claims, (tx) => tx.execute(sql`SELECT auth.uid()`)),
    ).rejects.toMatchObject({ cause: { code: '42501' } });
  });
});

describe('the trap this guards against', () => {
  it('the owner connection sees every row despite FORCE ROW LEVEL SECURITY', async () => {
    // FORCE removes the *owner* exemption but does not touch the BYPASSRLS
    // attribute, and Supabase ships `postgres` with rolbypassrls = true.
    // A tenancy test pointed at MIGRATION_DATABASE_URL therefore passes while
    // production is wide open.
    const all = await owner.db.select().from(sessionSets);
    expect(all.length).toBeGreaterThanOrEqual(2);

    const forced = await owner.db.execute<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      sql`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'session_sets'`,
    );
    expect(forced.rows[0]).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true });
  });
});
