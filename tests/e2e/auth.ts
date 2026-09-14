import type { Page } from '@playwright/test';
import { createTestSession, type TestSession } from '../integration/api/fixtures';

/**
 * Ceiling on the best-effort settle in `settleOutbox` below. Two things bound it from opposite
 * directions: the competing transaction is one committed `POST /api/sync`, measured at 203–413 ms p95
 * (`PROMPTKIT.md` §3), so anything under a second is too tight to be a fair chance; and several specs
 * here run within a third of their declared timeout, so a settle that can eat ten seconds would turn a
 * teardown guard into a new timeout flake. 2.5 s is roughly six of those p95s.
 */
const OUTBOX_SETTLE_MS = 2_500;

/**
 * Wait, briefly, for the browser's outbox to stop writing.
 *
 * Why this exists is the deadlock documented in `gotrue-failure.ts`: the runner enqueues a mutation on
 * every tap and the engine flushes it asynchronously, so a spec that ends its assertions and immediately
 * calls `cleanup()` fires `DELETE /auth/v1/admin/users/{id}` while its own last `POST /api/sync` is still
 * committing. Postgres then has the cascade and the FK-parent lock on the same `profiles` /
 * `workout_sessions` rows in opposite orders, and one of them is `40P01`.
 *
 * It is best-effort on purpose, for two reasons that are both load-bearing:
 * - Specs like the offline and route-aborted ones *want* a queue that never drains. Waiting for
 *   "All changes synced" there would hang to the ceiling and then be wrong anyway.
 * - The guarantee is not this function. `cleanup()` retries the deadlock itself; this only removes the
 *   common cause so the retry stays the rare path rather than the normal one.
 *
 * It never throws and never fails a run: a settle that could mask a real teardown problem would be worse
 * than the flake it prevents.
 */
async function settleOutbox(page: Page): Promise<void> {
  const deadline = Date.now() + OUTBOX_SETTLE_MS;
  try {
    const badge = page.getByTestId('queue-badge').first();
    for (;;) {
      // `count()` is the only locator query that does not wait. Reaching for `textContent()` here would
      // block on Playwright's 30 s action timeout in every spec that is not on the runner — dashboard,
      // history, settings, a11y — which is most of the suite, and would convert a 2.5 s guard into the
      // largest flake this file has ever shipped.
      if ((await badge.count()) === 0) return;
      const text = await badge.textContent();
      if (text === null) return;
      // Only "waiting to sync" means work the server has not yet committed, and a committed transaction
      // has already dropped the locks this cycle needs — so that one string is the whole signal.
      // "refused by the server" deliberately does *not* block: `Outbox.discardRefused`
      // (`src/app/state/outbox.ts`) removes a refused mutation from the queue, so a badge reading
      // "3 refused" has `pendingCount === 0` and nothing in flight. Blocking there would make every spec
      // that exercises the refusal path pay the full ceiling in teardown for a race that cannot exist.
      if (!text.includes('waiting to sync')) return;
      if (Date.now() >= deadline) return;
      await page.waitForTimeout(100);
    }
  } catch {
    // A closed page or a detached element means there is no browser left to contend with.
  }
}

/**
 * Authenticated browser state for the E2E suite, obtained the same way the API
 * suites obtain theirs — by asking the real auth server for a real session.
 *
 * Two alternatives were rejected. Signing in through `/sign-in` in the browser
 * needs an mailbox to read the magic link from (GoTrue sends mail; no SMTP is
 * configured, which is exactly deferred issue #16). Handing the page a token to
 * paste would fabricate state the product never sees. Both would also make the
 * suite's notion of "signed in" differ from the app's.
 *
 * So: `createTestSession` creates a user through the GoTrue admin API and signs it
 * in with a throwaway password through `@supabase/ssr`'s cookie jar — the same code
 * path `lib/supabase/server.ts` uses in production — and the resulting cookies are
 * installed into the browser context. The cookies are the ones the real
 * `setAll` wrote, including the `sb-…-auth-token.0/.1` chunking, which is why the
 * jar is reused instead of hand-assembling names here.
 *
 * This is still a shortcut in one respect and it should be said plainly: it does
 * not exercise the browser side of `/auth/confirm`. M1-13's redirect allowlist and
 * link exchange are covered by `tests/integration/auth-confirm.test.ts`; a spec
 * that walks the magic link end to end belongs with #16 once mail can be delivered
 * in CI, not as a mock pretending to be that flow.
 */
export async function signInFreshUser(page: Page, label: string): Promise<TestSession> {
  const session = await createTestSession(label);

  // Derive the absolute origin from wherever the browser currently is, so this
  // helper does not carry a second copy of the base URL that could disagree with
  // `playwright.config.ts`. Navigating first is deliberate: `page.goto('/')`
  // resolves the config's relative baseURL and leaves a real absolute URL behind.
  await page.goto('/');
  const origin = new URL(page.url()).origin;

  await page.context().addCookies(
    session.cookies.map((cookie) => ({ name: cookie.name, value: cookie.value, url: origin })),
  );

  /*
   * Wrapping here rather than at the ~40 call sites is the point: every spec already writes
   * `finally { await auth.cleanup(); }`, and a guard that has to be remembered is a guard that gets
   * forgotten in the next spec. The wrapper is transparent — same `userId`, same `cookie` jar — with
   * settle-before-delete as the only behavioural change.
   *
   * Stated plainly so it is not mistaken for full coverage: `a11y.spec.ts`, `sla.spec.ts`,
   * `lighthouse.spec.ts`, `progress.spec.ts`, `legacy-parity.spec.ts` and `sync-latency.spec.ts` mint at
   * least one identity with `createTestSession` directly (they drive the app over HTTP, or through
   * Chrome's `--extra-headers`, rather than through a signed-in Playwright page). Those sessions have no
   * page whose outbox could be settled, so they get the retry in `fixtures.ts` and nothing else — which is
   * the right ordering anyway: the retry is the guarantee, this is the courtesy.
   */
  return {
    ...session,
    cleanup: async () => {
      await settleOutbox(page);
      await session.cleanup();
    },
  };
}
