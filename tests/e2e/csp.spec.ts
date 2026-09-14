import { expect, test, type Page } from '@playwright/test';
import { signInFreshUser } from './auth';

/**
 * M4-24 (#142) — CSP baseline against the PRODUCTION server.
 *
 * The card is blunt about why this file talks to `next:start` and not a dev server:
 * a green build is not the signal under a nonce policy — Next builds fine and fails at
 * runtime instead, so every scenario here rides the same prod server (`playwright.config.ts`
 * webServer) the whole battery already uses.
 *
 * Deviation recorded for the PR (card AC-3, "the existing battery, unmodified"): the card
 * pictures the violation listener riding a shared fixture; the battery has no shared page
 * fixture — specs import `test` from @playwright/test and create their own pages, and
 * retrofitting a global fixture means rewriting 13 spec files, which "unmodified" forbids.
 * The all-pages sweep below substitutes: it loads every distinct page type (unauthenticated,
 * dashboard, settings, history, history/{id}, session runner, progress, 404) with a violation
 * listener and asserts zero. A later card that needs a new origin fails here loudly instead of
 * degrading a workout screen.
 *
 * Watched-red results, both mutations run on 2026-09-15 against a rebuilt prod server, each
 * edit alone and reverted after (byte-identical `cmp` on restore):
 *  (a) drop the response-header set in src/middleware.ts → tests 1–3 go red, each on its own
 *      claim: "/ carries no CSP", "un-nonce'd markup executed — script-src is decorative",
 *      "no frame-ancestors violation was named by the browser". Tests 2 and 3 are therefore
 *      also AC-2's and AC-4's pre-change controls: the attack the card blocks was proven
 *      possible on the same build with the header removed. The sweep stays GREEN — with no
 *      policy there is nothing to violate — so it is one-directional: it catches a widening,
 *      never a removal. That is a property of the design, not a defect to fix here.
 *  (b) append 'unsafe-inline' to script-src in lib/http/csp.ts → only test 1 goes red, beside
 *      the three unit assertions in tests/unit/http/csp.test.ts. Test 2 stays green because a
 *      CSP3 browser disregards 'unsafe-inline' whenever script-src carries a nonce or hash:
 *      the token can come back and the door is still shut, which is exactly why the card bans
 *      it by *text* ("no directive in the production string contains 'unsafe-inline'") and why
 *      that assertion is the gate — behaviour alone would not notice the smuggling.
 */

const DOCUMENT_PATHS = [
  '/',
  '/sign-in',
  '/history',
  '/settings',
  '/progress/bench-press',
  '/definitely-not-a-page-404',
];

const CSP_RE = /content-security-policy/i;

function nonceFrom(csp: string): string {
  const m = csp.match(/'nonce-([^' ]+)'/);
  expect(m, `policy carries no nonce:\n${csp}`).not.toBeNull();
  return m![1]!;
}

function connectSrcFrom(csp: string): string[] {
  const m = csp.match(/connect-src([^;]*)/);
  expect(m, `policy has no connect-src:\n${csp}`).not.toBeNull();
  return m![1]!.trim().split(/\s+/);
}

/** Collects CSP-violation console messages for the page it's called on. */
function watchViolations(page: Page): string[] {
  const violations: string[] = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (CSP_RE.test(text) || /Content Security Policy/i.test(text)) {
      violations.push(text);
    }
  });
  return violations;
}

test.describe('M4-24 CSP baseline', () => {
  test('every document, API and 404 response carries the policy, nosniff and a per-request nonce', async ({
    request,
  }) => {
    const seenNonces = new Set<string>();

    for (const path of DOCUMENT_PATHS) {
      const res = await request.get(path);
      const csp = res.headers()['content-security-policy'];
      expect(csp, `${path} carries no CSP`).toBeTruthy();
      expect(csp, `${path} missing default-src`).toContain(`default-src 'self'`);
      expect(csp, `${path} missing frame-ancestors`).toContain(`frame-ancestors 'none'`);
      expect(csp, `${path} missing base-uri`).toContain(`base-uri 'self'`);
      expect(csp, `${path} missing form-action`).toContain(`form-action 'self'`);
      expect(csp, `${path} missing object-src`).toContain(`object-src 'none'`);
      expect(csp, `${path} script-src carries no nonce`).toMatch(/'nonce-[^ ]+'/);
      expect(res.headers()['x-content-type-options'], `${path} missing nosniff`).toBe('nosniff');
      seenNonces.add(nonceFrom(csp!));
    }

    // /api/sync per AC-1's explicit list.
    const sync = await request.post('/api/sync', { data: {} });
    const syncCsp = sync.headers()['content-security-policy'];
    expect(syncCsp, '/api/sync carries no CSP').toBeTruthy();
    expect(sync.headers()['x-content-type-options']).toBe('nosniff');

    // Nonce freshness: the requests above already produced >1 nonce — the check that stops a
    // build-time constant being mistaken for a nonce. Two deliberate double-hits below.
    const a = await request.get('/sign-in');
    const b = await request.get('/sign-in');
    const nA = nonceFrom(a.headers()['content-security-policy']!);
    const nB = nonceFrom(b.headers()['content-security-policy']!);
    expect(nA).not.toEqual(nB);
    expect(seenNonces.size).toBeGreaterThan(1);

    // No 'unsafe-inline' anywhere in the production string (dev concessions ride NODE_ENV
    // and this server is the prod build the battery runs).
    expect(syncCsp).not.toContain(`'unsafe-inline'`);

    // AC-5's live half: the Sentry door, pinned by set comparison.
    expect(new Set(connectSrcFrom(a.headers()['content-security-policy']!))).toEqual(
      new Set([`'self'`, 'https://*.sentry.io', 'https://*.ingest.sentry.io']),
    );
  });

  test('the policy is enforced, not decorative: injected HTML script never runs while the app does', async ({
    page,
  }) => {
    const violations = watchViolations(page);
    await page.goto('/sign-in');
    const before = violations.length;

    // AC-2's fixture, vector chosen by measurement. A DOM-appended <script> from the
    // test's OWN evaluate channel RUNS under 'strict-dynamic' (measured 2026-09-15: the
    // CDP creator context inherits trust — CSP stops HTML injection, not arbitrary code
    // execution, which is strict-dynamic's documented bargain). The faithful analogue of
    // the attack the AC describes is parser-supplied markup: an inline script arriving as
    // document content. srcdoc gives exactly that, same-origin, no server fixture needed.
    // A second vector — the inline event handler attribute — is measured blocked too; both
    // blocks were verified against the running prod server before this test trusted them.
    await page.evaluate(() => {
      const f = document.createElement('iframe');
      f.style.display = 'none';
      f.srcdoc = '<scr' + 'ipt>parent.window.__cspProbeRan = true;</scr' + 'ipt>';
      document.body.appendChild(f);
      const i = document.createElement('img');
      i.src = '/no-such-img-404';
      i.setAttribute('onerror', 'window.__cspHandlerRan = true');
      document.body.appendChild(i);
    });
    await page.waitForTimeout(800);
    const effects = await page.evaluate(
      () => '__cspProbeRan' in window || '__cspHandlerRan' in window,
    );
    expect(effects, 'un-nonce’d markup executed — script-src is decorative').toBe(false);

    // ...and the browser said so, naming script-src (inline script AND inline handler).
    const scriptViolations = violations.slice(before).filter((v) => /script-src/i.test(v));
    expect(scriptViolations.length, 'no script-src violation was logged').toBeGreaterThanOrEqual(2);

    // AC-2's other half — the page's OWN scripts did execute: hydration is real (typing
    // reaches React state via the controlled input) and the form posts.
    await page.fill('#email', 'csp-enforcement-probe@example.invalid');
    const [response] = await Promise.all([
      page.waitForResponse((r) => new URL(r.url()).pathname === '/auth/signin'),
      page.click('button[type="submit"]'),
    ]);
    expect(response.status()).toBeLessThan(500);
    // Nothing in this page's own execution violated the policy: the ONLY violations are
    // this card's deliberately un-nonce’d fixture.
    expect(violations.filter((v) => !/script-src/i.test(v))).toEqual([]);
  });

  test('clickjacking protection is the real thing: framing is refused and frame-ancestors is named', async ({
    page,
  }) => {
    const violations = watchViolations(page);
    await page.goto('/sign-in');
    const frame = page.evaluate(() => {
      const f = document.createElement('iframe');
      f.src = '/sign-in';
      f.setAttribute('title', 'csp-frame-probe');
      document.body.appendChild(f);
    });
    void frame;
    await expect
      .poll(() => violations.some((v) => /frame-ancestors/i.test(v)), {
        message: 'no frame-ancestors violation was named by the browser',
      })
      .toBe(true);
    // The framed document never renders: no frame navigated to the inner /sign-in.
    const inner = page.frames().find((f) => f.url().includes('/sign-in') && f !== page.mainFrame());
    expect(inner, 'the iframe reached a rendered document').toBeUndefined();
  });

  test('the app never violates its own policy on any page it serves (all-page-types sweep)', async ({
    page,
  }) => {
    const violations = watchViolations(page);

    // Unauthenticated documents.
    await page.goto('/sign-in');
    await page.goto('/definitely-not-a-page-404');

    const auth = await signInFreshUser(page, 'e2e-csp-sweep');
    let sessionId: string | null = null;
    try {
      for (const path of ['/', '/settings', '/history', '/progress/bench-press']) {
        await page.goto(path);
        await page.waitForTimeout(400); // hydration + client fetches settle
      }

      // The runner — the most client-JS-heavy page in the app (timers, audio cue, outbox
      // sync engine) — started the way a user starts it.
      await page.goto('/');
      await page.getByRole('button', { name: 'Start Push' }).click();
      await page.waitForURL(/\/session\/[^/]+/);
      await page.waitForTimeout(1_500);
      sessionId = new URL(page.url()).pathname.split('/').pop() ?? null;

      // And the one-session report on a real session.
      if (sessionId) {
        await page.goto(`/history/${sessionId}`);
        await page.waitForTimeout(400);
      }
    } finally {
      await auth.cleanup();
    }

    expect(violations, `CSP violations during the sweep:\n${violations.join('\n')}`).toEqual([]);
  });
});
