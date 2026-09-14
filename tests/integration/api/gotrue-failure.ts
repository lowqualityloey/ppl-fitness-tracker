/**
 * Put the identity service's own explanation into the error text.
 *
 * `#100`'s `100q3` red was `Could not clean up M1-16 test user (500)` — and the only thing the helper
 * reported was the status code, because the delete path never read a body and the create path parsed one
 * and threw it away. So GoTrue answered its own failure and we discarded the answer, which is how a single
 * episodic 500 came to be filed as two unexplained flakes on two different specs (`a11y.spec.ts:163`,
 * `session-runner.spec.ts:111`) depending on which fixture happened to be tearing down.
 *
 * This is a diagnostic, not a gate: it changes no threshold and no expectation about GoTrue. A cleanup
 * failure still fails the run, because leaking a user is a real outcome and a loud red beats a quiet one.
 */
export function describeGoTrueFailure(
  stage: 'create' | 'cleanup',
  status: number,
  body: string,
): string {
  const detail = body.trim().slice(0, 500) || '<empty response body>';
  const who = stage === 'create' ? 'create' : 'clean up';
  // "teardown" is said out loud because a cleanup throw is blamed on whichever spec owns the fixture, and
  // the reader's first instinct is to look for a broken assertion in that spec. There isn't one.
  const phase = stage === 'cleanup' ? ' — thrown by teardown, not by an assertion' : '';
  return `Could not ${who} M1-16 test user (${status})${phase}. GoTrue said: ${detail}`;
}

/**
 * Is this delete failure a Postgres deadlock that is safe to retry?
 *
 * #100's `describeGoTrueFailure` is what made this class nameable, and naming it is what let it be
 * diagnosed. On 2026-09-13 the local Postgres log was read next to that error text, and one of this
 * signature's causes is not an episodic 500 at all — it is a **transaction deadlock**, and both of its
 * participants are pieces of this app. Verbatim from `supabase_db_ppl-fitness-tracker`, the most recent
 * of six such records:
 *
 * ```text
 * 172.18.0.4 2026-09-12 16:16:02.510 UTC [484928] supabase_auth_admin@postgres ERROR:  deadlock detected
 *   DETAIL:  Process 484928 waits for ShareLock on transaction 44532; blocked by process 449820.
 *            Process 449820 waits for ShareLock on transaction 44533; blocked by process 484928.
 *            Process 484928: DELETE FROM "users" AS users WHERE users.id = $1
 *            Process 449820: insert into "sync_mutations" (...) on conflict do nothing returning "mutation_id"
 *   CONTEXT:  while deleting tuple (0,73) in relation "workout_sessions"
 * ```
 *
 * The cycle is the cascade that #89 (`0007_auth_user_cascade.sql`) deliberately added. Deleting an Auth
 * user now cascades `auth.users -> profiles -> workout_sessions -> session_sets / sync_mutations`; a
 * `POST /api/sync` still committing takes a `FOR KEY SHARE` lock on those same `profiles` and
 * `workout_sessions` parents to validate its own FKs. Opposite orders, and Postgres picks a victim. In
 * five of the six records the victim was the admin delete; in the sixth it was the sync insert, at
 * `while locking tuple (0,74) in relation "profiles"` — see the production note below.
 *
 * **Scoped honestly — a named cause, not *the* cause.** Six deadlocks of exactly this shape were recorded
 * locally on 2026-09-12 (three taking the admin delete as the victim, three the sync insert), and the CI
 * teardown 500 of 2026-09-13 carries the message they produce — `gh run view 34755008741 --log-failed`
 * prints `msg="Database error deleting user"` thrown from this file's own call site in
 * `tests/e2e/session-runner.spec.ts`'s `finally`. What is *not* established is the mechanism on the CI
 * side: CI runs its own Postgres, its log is not reachable from here, and the failed-job log has zero
 * `deadlock` lines because it covers the test job and not the database. Locally the auth container has
 * never logged the message either, which proves nothing: both Supabase containers were restarted a day
 * after the six deadlocks, so that log was not running when they happened. So this predicate asserts
 * "a deadlock is a known condition here, and it is the one worth re-issuing a delete for", not
 * "every teardown 500 is a deadlock".
 *
 * **Why it cannot be the SQLSTATE test it wants to be:** the SQLSTATE never crosses the HTTP boundary.
 * Postgres reports this deadlock as a transaction lock wait, GoTrue collapses it into its internal error,
 * and what arrives is a 500 whose only distinguishing text is the message. Two renderings of it have been
 * seen, and both have to keep matching — CI's own body is JSON:
 *
 * ```text
 * {"code":500,"error_code":"unexpected_failure","msg":"Database error deleting user",…}
 * ```
 *
 * while `docs/STATE.md` §8 records the flat `code=500 error_code=… msg="…"` form. Hence token matching:
 * the two substrings that name the condition, rather than any one serialized spelling of them. The match is
 * deliberately conjunctive: a 500 naming anything else, a 404 (already deleted — see the double-clean note
 * in `fixture-isolation.test.ts`), or an HTML page from the proxy in front of GoTrue all return `false` and
 * still fail the run loudly.
 *
 * Note the near neighbour: GoTrue also emits `Database error deleting user identities: …`
 * (`internal/api/admin.go:476` in the GoTrue source, not in this repo), which the substring above accepts.
 * That is deliberate — the same condition one relation down — and it is the reason the match is on the
 * message and not on the whole envelope.
 *
 * **The production half, which is not this fixture's problem and must not be filed as one:** a real user
 * who deletes their account while the outbox flushes hits the same cycle, and the sixth record shows the
 * loser can be the **sync insert** rather than the delete — a lost write the engine has no retry path
 * for. Nothing here fixes that; `docs/STATE.md` §8 carries it forward.
 */
export function isDeadlockedUserDeleteFailure(status: number, body: string): boolean {
  if (status !== 500) return false;
  // GoTrue renders this body in its own `code=… error_code=… msg="…"` form, not as JSON, so the two
  // tokens that name the condition are matched rather than any one serialized spelling of them.
  return body.includes('unexpected_failure') && body.includes('Database error deleting user');
}

/**
 * Attempts permitted for the admin delete, including the first try.
 *
 * Three, because the competing transaction is one committed `POST /api/sync`: the cumulative wait this
 * allows (250 + 750 = 1 s) is already more than twice that endpoint's measured p95 band of 203–413 ms
 * (`tests/e2e/sync-latency.spec.ts:47`, which cites RFC §3, and whose re-documentation `docs/STATE.md` §8
 * records under #92). A larger budget would only delay the report of a teardown that is genuinely
 * broken, and a teardown that has deadlocked three times in a row is not flaking — it is misused.
 */
export const USER_DELETE_ATTEMPTS = 3;

/** How long to wait before attempt `attempt + 1`: 250 ms, then 750 ms. */
export function userDeleteRetryDelayMs(attempt: number): number {
  return 250 * 3 ** attempt;
}

/**
 * The whole retry decision, in one pure function, so the dangerous part of this fix — "could this ever
 * loop, and could it loop on something that should have failed the run?" — is answerable by test rather
 * than by reading a `for(;;)` in a file that needs a live Supabase to execute.
 *
 * `attempt` is zero-based: the number of deletes already *tried and lost*.
 */
export function shouldRetryUserDelete(status: number, body: string, attempt: number): boolean {
  if (attempt >= USER_DELETE_ATTEMPTS - 1) return false;
  return isDeadlockedUserDeleteFailure(status, body);
}
