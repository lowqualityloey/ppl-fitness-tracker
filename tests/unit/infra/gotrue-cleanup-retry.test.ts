/**
 * The cleanup retry may only fire on one thing, and it must stop.
 *
 * Both halves are load-bearing, which is why they are tested rather than commented. A retry that can
 * fire on any 5xx turns a real teardown bug into a green run that leaks users; a retry with no floor on
 * its attempt count turns a leak into a hang. Neither is hypothetical: the signature this one absorbs was
 * filed twice as "unexplained flake" (#100) before anyone read the response body, and the fix proposed in
 * `docs/STATE.md` §8 was "retry with exponential backoff" — correct in shape, but written against a
 * misdiagnosis ("the global teardown is not idempotent") that this suite's own Postgres log has since
 * contradicted with six `deadlock detected` records pairing the admin delete against a `sync_mutations`
 * insert. See `tests/integration/api/gotrue-failure.ts` for the evidence and its limits.
 *
 * The decision is a pure function precisely so this file can test it exhaustively: the call site needs a
 * live Supabase and cannot be exercised here.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isDeadlockedUserDeleteFailure,
  shouldRetryUserDelete,
  USER_DELETE_ATTEMPTS,
  userDeleteRetryDelayMs,
} from '../../integration/api/gotrue-failure';

/** Verbatim from the CI teardown recorded in `docs/STATE.md` §8 — GoTrue's body is not JSON. */
const DEADLOCK_BODY =
  'code=500 error_code=unexpected_failure msg="Database error deleting user" error_id=229157b7-a73f-4a86-aa78-ff605e050292';

/**
 * The real CI payload, byte for byte, read from `gh run view 34755008741 --log-failed`:
 * `Could not clean up M1-16 test user (500) … GoTrue said: {…}`. Pinned here because this is the string the
 * predicate has to catch — if a future edit narrows the match and stops matching *this*, the teardown flake is
 * back and the suite would not say so. Note that GoTrue does serialize JSON on this endpoint, unlike the
 * key=value form above, so both shapes have to work.
 */
const CI_TEARDOWN_BODY =
  '{"code":500,"error_code":"unexpected_failure","msg":"Database error deleting user","error_id":"cc20d3a6-05f2-4926-b75f-05acaf7e9935"}';

/** `__dirname` is `tests/unit/infra`, so three levels up is the repo root. */
const read = (rel: string) => readFileSync(join(__dirname, '..', '..', '..', rel), 'utf8');

describe('cleanup retry: fires on the deadlock and on nothing else', () => {
  it('recognizes the signature in the form GoTrue actually sent', () => {
    expect(isDeadlockedUserDeleteFailure(500, DEADLOCK_BODY)).toBe(true);
    // The payload CI actually returned, in CI's own JSON form — not a paraphrase of it.
    expect(isDeadlockedUserDeleteFailure(500, CI_TEARDOWN_BODY)).toBe(true);
    expect(shouldRetryUserDelete(500, CI_TEARDOWN_BODY, 0)).toBe(true);
    expect(shouldRetryUserDelete(500, CI_TEARDOWN_BODY, USER_DELETE_ATTEMPTS - 1)).toBe(false);
    // Token-matched, so a future GoTrue that does serialize JSON is still caught.
    expect(
      isDeadlockedUserDeleteFailure(
        500,
        '{"code":500,"error_code":"unexpected_failure","msg":"Database error deleting user"}',
      ),
    ).toBe(true);
  });

  it('refuses every other 5xx, including the look-alikes', () => {
    const notTheDeadlock = [
      // Already deleted: the double-clean case `fixture-isolation.test.ts` says must stay loud.
      ['404 on a vanished user', 404, DEADLOCK_BODY],
      ['500 naming a different operation', 500, 'code=500 error_code=unexpected_failure msg="Database error creating user"'],
      ['500 with one token missing', 500, 'msg="Database error deleting user"'],
      ['500 from a proxy page', 500, '<html><body>502 Bad Gateway</body></html>'],
      ['empty body', 500, ''],
      ['upstream timeout', 504, DEADLOCK_BODY],
    ] as const;
    for (const [label, status, body] of notTheDeadlock) {
      expect(shouldRetryUserDelete(status, body, 0), label).toBe(false);
    }
  });

  it('stops, and says so within a budget a teardown can afford', () => {
    // The loop must terminate on its own terms rather than on a timeout the harness would not explain.
    expect(shouldRetryUserDelete(500, DEADLOCK_BODY, 0)).toBe(true);
    expect(shouldRetryUserDelete(500, DEADLOCK_BODY, USER_DELETE_ATTEMPTS - 2)).toBe(true);
    expect(shouldRetryUserDelete(500, DEADLOCK_BODY, USER_DELETE_ATTEMPTS - 1)).toBe(false);
    expect(shouldRetryUserDelete(500, DEADLOCK_BODY, 99)).toBe(false);

    const delays = Array.from({ length: USER_DELETE_ATTEMPTS - 1 }, (_, attempt) =>
      userDeleteRetryDelayMs(attempt),
    );
    const total = delays.reduce((sum, ms) => sum + ms, 0);
    expect(delays).toEqual([250, 750]);
    // A teardown must not become the slowest thing in the run: the whole budget stays under the 2.5 s the
    // E2E settle is already allowed to take.
    expect(total).toBeLessThanOrEqual(2_500);
  });
});

describe('cleanup retry: the call sites cannot drift back to a blind retry', () => {
  const fixtures = read('tests/integration/api/fixtures.ts');
  const e2eAuth = read('tests/e2e/auth.ts');

  it('asks the shared decision function, exactly once, and still throws when it gives up', () => {
    // One condition, not an inline `!res.ok`: an inline copy is how a retry quietly widens.
    expect(fixtures.match(/shouldRetryUserDelete\(/g)?.length).toBe(1);
    expect(fixtures).toContain('shouldRetryUserDelete(removed.status, detail, attempt)');
    expect(fixtures).toMatch(/for \(let attempt = 0; ; attempt \+= 1\)/);
    // The last failure must still reach the report with GoTrue's words and the attempt count, or a
    // genuinely broken teardown would be indistinguishable from a flaky one.
    expect(fixtures).toContain("describeGoTrueFailure('cleanup', removed.status, detail)");
    expect(fixtures).toMatch(/gave up after \$\{attempt \+ 1\} attempts/);
  });

  it('settles the outbox before the delete, and does it with a non-waiting query', () => {
    // Ordering is the whole point: waiting *after* the DELETE cannot prevent the deadlock.
    expect(e2eAuth.indexOf('await settleOutbox(page)')).toBeGreaterThan(-1);
    expect(e2eAuth.indexOf('await settleOutbox(page)')).toBeLessThan(e2eAuth.indexOf('await session.cleanup()'));
    expect(e2eAuth).toMatch(/OUTBOX_SETTLE_MS = 2_500/);
    // `count()` is the locator call that does not wait; a future edit to `textContent()` here would stall
    // every non-runner spec for Playwright's 30 s default instead of the 2.5 s this is budgeted for.
    expect(e2eAuth).toContain('(await badge.count()) === 0');
    expect(e2eAuth).not.toMatch(/getByTestId\('queue-badge'\)\.textContent\(\)/);
  });
});
