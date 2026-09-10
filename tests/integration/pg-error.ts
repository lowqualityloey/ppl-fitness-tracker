/**
 * Typed narrowing for Postgres errors thrown inside these suites.
 *
 * Every one of these files asserts on `err.code` / `err.message` after a statement that
 * is *expected* to fail — permission denied, a check constraint, an RLS WITH CHECK
 * rejection. Those fields are real (node-postgres puts them on every `DatabaseError`),
 * but `catch (err)` hands you `unknown`, so the suite was reaching through
 * `(err as any)`, which is precisely the loose casting `PROMPTKIT.md` §6 forbids and what
 * kept `npm run lint` red (D1).
 *
 * The helpers below are deliberately *narrowing*, not *asserting*: they read the fields
 * when present and return `undefined`/`''` otherwise, so a test that expected `42501`
 * still fails loudly when the driver threw something else. A cast to a fake error type
 * would let a wrong-code bug read as a passing assertion, which is the same class of
 * vacuous pass the tenancy gate exists to prevent.
 *
 * Note the shared quirk of the surrounding pattern, left as-is on purpose: several specs
 * `throw new Error('Should have failed…')` inside the `try` whose own `catch` then
 * asserts on the error. If the statement unexpectedly succeeds, the failure surfaces as
 * `expected undefined to be '42501'` rather than the intended message. Improving that is
 * a test-readability change, not part of closing D1.
 */
interface PgErrorFields {
  code?: unknown;
  message?: unknown;
}

function readFields(err: unknown): PgErrorFields {
  return typeof err === 'object' && err !== null ? (err as PgErrorFields) : {};
}

/** The SQLSTATE code, or `undefined` if the throw was not a database error. */
export function pgErrorCode(err: unknown): string | undefined {
  const { code } = readFields(err);
  return typeof code === 'string' ? code : undefined;
}

/** The driver's message, or `''` if the throw carried none. */
export function pgErrorMessage(err: unknown): string {
  const { message } = readFields(err);
  return typeof message === 'string' ? message : '';
}
