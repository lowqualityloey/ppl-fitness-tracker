import { SyncResponseDataSchema, type SyncResponseData } from '../../lib/contracts/sync.js';

/**
 * Builds a `POST /api/sync` response body for browser specs — and refuses to build one the
 * contract would not accept.
 *
 * This module exists because the spec it feeds used to hand-write its JSON.
 * `tests/e2e/session-runner.spec.ts` fulfilled the route with a `state: { session: {…} }` key:
 * `SyncResponseDataSchema` was `.strict()` and its `state` (pre-#105) was a *whole session
 * graph*, not an object wrapping one, so the server had never been able to produce the bytes the
 * test was asserting against. A browser was driven through fiction, and the suite said so what
 * passed. #105 deleted the field; this builder is the fix's other half — without it, the next
 * mock that needs a rejection to render can invent a shape again, because
 * `route.fulfill({ body })` accepts any string and no parser was ever going to look at it.
 *
 * So every fixture body here goes through `SyncResponseDataSchema.parse` — strict, at build
 * time. A wrong shape throws in the spec that authored it instead of becoming a passing test
 * about bytes nobody ships. That `.parse` is load-bearing, and it is watched:
 * `tests/unit/contracts/sync-response-fixture.test.ts` injects the two failures this file exists
 * to prevent and asserts both throw.
 *
 * Not a `.spec.ts` file, and it deliberately imports nothing from `@playwright/test` or
 * `tests/integration/api/fixtures.ts`: vitest collects only test files, and the guard needs to
 * import this in a plain Node process — no browser, no server, no Supabase env, no module-scope
 * configuration check that throws at collection time.
 */
export function syncResponseBody(data: SyncResponseData): string {
  const parsed = SyncResponseDataSchema.parse(data);
  return JSON.stringify({ ok: true, data: parsed });
}

/**
 * The one refusal shape the runner's rejection path needs: batch drained, item refused, and the
 * server's real reason code beside it.
 *
 * `CONFLICT` is not a convenient string. It is what a refused set mutation actually returns: the
 * lifecycle gate (`lib/domain/sessions/transition-table.ts:assertSetMutationAllowed`) throws
 * `SessionConflictError`, and `rejectionReason` in `lib/domain/sync/sync-engine.ts` maps that to
 * `CONFLICT` — an equivalence `tests/integration/api/sync.test.ts` already asserts against the
 * live route rather than taking on faith. The mock this replaces used `'ILLEGAL_TRANSITION'`, a
 * label no server code path has ever emitted: the same species of invention as the deleted
 * `state` key, corrected in the same change.
 */
export function refusedSyncResponseBody(mutationId: string, serverSeq = 1): string {
  return syncResponseBody({
    serverSeq,
    applied: [],
    rejected: [{ mutationId, reason: 'CONFLICT' }],
    clockSkewMs: 0,
  });
}
