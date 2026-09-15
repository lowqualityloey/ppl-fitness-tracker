import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * M4-06 (#95) — the error sink, measured in the artifact that ships.
 *
 * Why a browser spec for something the unit tests already cover: the claim that matters
 * is not "the reporter calls capture" but **"the app's error traffic never leaves its
 * own origin, and its policy says so"**. Those two halves are checked in different
 * builds — `lib/http/csp.ts` is a string, `next.config.ts`'s `tunnelRoute` becomes a
 * rewrite only after a production build — and a regression that separates them (the
 * policy keeps `connect-src 'self'` while the SDK starts posting to `*.ingest.sentry.io`
 * again) is invisible to both. This file reads the built routes manifest, so the split
 * is a failure rather than a Friday.
 *
 * AC-2's client half is here too, and it is deliberately unglamorous: with no DSN in the
 * environment — the state this repo's CI runs in, since the e2e job sets no Sentry vars —
 * a seeded failure must leave the page working. "Telemetry absence never becomes an
 * outage" is a property of the running bundle, not of a unit test's branch.
 */

const MANIFEST = resolve(process.cwd(), '.next/routes-manifest.json');

interface Rewrite {
  source: string;
  destination: string;
  has?: { key: string }[];
}

/**
 * Next 16 nests the three phases under a top-level `rewrites` object. Read it from the
 * file rather than from a type in this spec: the shape is what broke here first —
 * looking for `beforeFiles` at the root finds an empty array and the assertion passes on
 * *nothing*, which is how a guard ends up guarding nothing.
 */
function allRewrites(): Rewrite[] {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as {
    rewrites?: { beforeFiles?: Rewrite[]; afterFiles?: Rewrite[]; fallback?: Rewrite[] };
  };
  const r = manifest.rewrites ?? {};
  return [...(r.beforeFiles ?? []), ...(r.afterFiles ?? []), ...(r.fallback ?? [])];
}

function tunnelRewrites(): Rewrite[] {
  return allRewrites().filter((rewrite) => rewrite.source.startsWith('/monitoring'));
}

test.describe('M4-06 error sink', () => {
  test('the production build routes Sentry ingest through the same origin', () => {
    const tunnels = tunnelRewrites();
    expect(
      tunnels.length,
      `no /monitoring rewrite in the built manifest — connect-src is 'self', so a browser SDK that lost its tunnel would be blocked by our own policy. Rewrites: ${JSON.stringify(allRewrites().map((r) => r.source))}`,
    ).toBeGreaterThan(0);

    // Sentry installs one rewrite per shape (region-aware and plain), matched in order,
    // and both must stay inside Sentry's ingest host — the hop the CSP no longer lets the
    // browser make itself. `toBeGreaterThan(0)` alone would pass on a single stale entry.
    for (const tunnel of tunnels) {
      expect(tunnel.destination).toMatch(
        /^https:\/\/o:orgid\.ingest\.(?::region\.)?sentry\.io\/api\/:projectid\/envelope\//,
      );
      expect((tunnel.has ?? []).map((h) => h.key)).toEqual(expect.arrayContaining(['o', 'p']));
    }
  });

  test('the served policy and the built rewrite agree that the browser never names Sentry', async ({
    request,
  }) => {
    const res = await request.get('/sign-in');
    const csp = res.headers()['content-security-policy'] ?? '';
    expect(csp, 'the document must carry the policy').not.toBe('');
    expect(csp).not.toContain('sentry.io');
    const connect = csp.match(/connect-src([^;]*)/)![1]!.trim().split(/\s+/);
    expect(new Set(connect)).toEqual(new Set([`'self'`]));
  });

  test('the tunnel path is claimed by the build rather than falling through to the 404 page', async ({
    request,
  }) => {
    // Deliberately asserts only what is environment-independent. Whether the upstream
    // hop answers 200, 502 or times out depends on egress from wherever the suite runs;
    // that the *route is owned* — and so a dropped `tunnelRoute` would 404 instead — is
    // the fact under test. The event payload's shape is covered by
    // `tests/unit/errors/sentry-transport.test.ts`, not by calling Sentry's endpoint.
    const res = await request.post('/monitoring?o=123456&p=7654321', {
      data: 'e2e probe envelope\n',
      headers: { 'content-type': 'application/x-sentry-envelope' },
    });
    expect(res.status(), await res.text()).not.toBe(404);
  });

  test('AC-2: with no DSN configured, a client-side failure leaves the page working', async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (error) => pageErrors.push(error));

    await page.goto('/sign-in');
    const email = page.locator('#email');
    await email.fill('athlete@example.com');
    await expect(email).toHaveValue('athlete@example.com');

    // Seed the failure the way the island meets it: a rejected promise nobody handles.
    // With no transport installed this must cost nothing at all — no crash, no spinner,
    // no second error of our own.
    await page.evaluate(() => {
      void Promise.reject(new Error('seeded unhandled rejection'));
    });
    await page.waitForTimeout(150);

    await email.fill('athlete+two@example.com');
    await expect(email).toHaveValue('athlete+two@example.com');

    // The honest shape of this assertion. Chromium reports an unhandled rejection to the
    // window regardless of any SDK, so "zero page errors" was never this app's to promise
    // — the claim AC-2 makes is that the *absence* of the sink costs nothing extra. So:
    // exactly one error, the seed itself, and nothing from our reporting path beside it.
    expect(pageErrors.map((error) => error.message)).toEqual(['seeded unhandled rejection']);
  });
});
