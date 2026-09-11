import type { Page } from '@playwright/test';
import { createTestSession, type TestSession } from '../integration/api/fixtures';

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

  return session;
}
