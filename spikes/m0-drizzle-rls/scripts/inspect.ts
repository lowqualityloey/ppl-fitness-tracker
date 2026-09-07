/**
 * Baseline fidelity probe.
 *
 * Before asserting anything about our own role, record what the stock Supabase
 * image actually gives us. Two things matter for the spike's validity:
 *
 *  1. Which pre-existing roles carry BYPASSRLS. If the role the test harness
 *     connects as can bypass RLS, every isolation assertion passes vacuously
 *     (spec §4.2, gate-defeating case 1).
 *  2. The exact body of auth.uid(). Our policies compare user_id against it,
 *     so we need to know which claim it reads and from which GUC.
 */
import { Client } from 'pg';

const OWNER_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function main() {
  const c = new Client({ connectionString: OWNER_URL });
  await c.connect();

  const version = await c.query<{ server_version: string }>('SHOW server_version');
  console.log(`server_version = ${version.rows[0]!.server_version}`);

  console.log('\n--- role attributes (stock image) ---');
  const roles = await c.query(
    `SELECT rolname, rolsuper, rolbypassrls, rolcanlogin, rolinherit
       FROM pg_roles
      WHERE rolname NOT LIKE 'pg\\_%'
      ORDER BY rolname`,
  );
  console.table(roles.rows);

  console.log('\n--- auth.uid() definition ---');
  const uid = await c.query<{ def: string }>(
    `SELECT pg_get_functiondef('auth.uid()'::regprocedure) AS def`,
  );
  console.log(uid.rows[0]!.def);

  console.log('\n--- auth.jwt() definition ---');
  const jwt = await c.query<{ def: string }>(
    `SELECT pg_get_functiondef('auth.jwt()'::regprocedure) AS def`,
  );
  console.log(jwt.rows[0]!.def);

  console.log('\n--- public tables already present ---');
  const tables = await c.query(
    `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  );
  console.table(tables.rows.length ? tables.rows : [{ tablename: '(none)', rowsecurity: null }]);

  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
