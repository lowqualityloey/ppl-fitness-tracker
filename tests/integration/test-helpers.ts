import { expect } from 'vitest';

/** A `count(*)::text` aggregate row. */
export interface CountRow {
  count: string;
}

/**
 * The app-role connection for tests that must connect as `app_authenticated`.
 * Credentials are environment-only; there is no inline fallback.
 */
export function appRoleConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL (app-role connection) is required for this test');
  }
  return url;
}

/**
 * The direct (54322) app-role connection for tests that need session-scoped
 * behavior. Derived from DATABASE_URL so no password is copied into test source.
 */
export function appRoleDirectConnectionString(): string {
  const url = new URL(appRoleConnectionString());
  url.hostname = '127.0.0.1';
  url.port = '54322';
  const [role] = url.username.split('.');
  if (!role) throw new Error('DATABASE_URL has no app-role username');
  url.username = role;
  return url.toString();
}

/**
 * Returns the first row a query produced, or throws when there is none.
 *
 * `noUncheckedIndexedAccess` makes `rows[0]` possibly undefined, and a non-null
 * assertion would silence that without checking. This narrows explicitly and
 * names the read that came back empty, so a missing row fails as a test error
 * rather than as a `TypeError` two lines later.
 */
export function requireRow<T>(rows: readonly T[], description: string): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`Expected one row for ${description}, got none`);
  }
  return row;
}

/**
 * Returns the row at `index`, or throws with the index and total row count.
 * Use after an exact-length assertion when reading a non-first row.
 */
export function requireRowAt<T>(rows: readonly T[], index: number, description: string): T {
  const row = rows[index];
  if (row === undefined) {
    throw new Error(`Expected row ${index} for ${description}, got ${rows.length} row(s)`);
  }
  return row;
}

/**
 * Assert that a query rejected with the Postgres SQLSTATE `sqlState`.
 *
 * `drizzle-orm` 0.45 wraps the pg driver error in a `DrizzleQueryError`, so the
 * SQLSTATE sits on `cause.code` — one level below the rejection itself, where
 * `rejects.toMatchObject({ code })` found it on 0.36. Walking the cause chain
 * keeps the assertion true whichever layer throws, without loosening it: the
 * SQLSTATE still has to be present, so a dropped connection (`ECONNREFUSED`), a
 * different constraint violation, or a query that simply resolved all fail here.
 */
export async function expectSqlState(
  operation: Promise<unknown>,
  sqlState: string,
): Promise<void> {
  let rejection: unknown;
  let rejected = false;
  try {
    await operation;
  } catch (error) {
    rejected = true;
    rejection = error;
  }

  expect(
    rejected,
    `expected the query to reject with SQLSTATE ${sqlState}, but it resolved`,
  ).toBe(true);

  expect(
    sqlStateChain(rejection),
    `expected SQLSTATE ${sqlState} in the rejection cause chain`,
  ).toContain(sqlState);
}

/** Every `code` found walking `error.cause` from the rejection down, outer first. */
function sqlStateChain(rejection: unknown): string[] {
  const codes: string[] = [];
  let current: unknown = rejection;

  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    const { code } = current as Error & { code?: unknown };
    if (typeof code === 'string') codes.push(code);
    current = current.cause;
  }

  return codes;
}
