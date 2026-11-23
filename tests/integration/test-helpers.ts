import { expect } from 'vitest';

/** A `count(*)::text` aggregate row. */
export interface CountRow {
  count: string;
}

/**
 * Returns the only row a query was expected to produce, or throws.
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
