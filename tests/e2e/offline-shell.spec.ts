/**
 * M4-22 (#111) — the offline app shell, verified where it actually runs: a browser.
 *
 * The design spec (docs/design/2026-09-16-m4-22-offline-shell.md, PD-4) puts ALL runtime
 * behaviour of `public/sw.js` here rather than in unit tests, for one reason: a classic worker
 * cannot `import` anything, so a unit suite could only ever test a second copy of the logic —
 * a grader for a double. What lives in `tests/unit/infra/sw-shell-source.test.ts` instead is
 * the *policy* as a property of the shipped bytes (no `skipWaiting()`, no `clients.claim()`,
 * no writes on the `/api/` path), which is exactly the part a source can prove.
 *
 * One harness fact this file depends on, learned the expensive way during implementation:
 * `next start` snapshots `public/` at boot. A file created in `public/` after the server is
 * up 404s. That kills the obvious AC-2 trick — rewrite `/sw.js` mid-test to conjure a
 * "second deploy" and observe the waiting worker — because the browser would 404 the update
 * fetch. So the update *arrival* (the "reload to apply" chip path in
 * `src/components/shell-registration.tsx`) has no e2e here, and the file says so at the
 * control that replaces it: eviction is driven through the REAL activate handler by
 * unregister-then-reregister (spec 3), and the never-steal half is pinned statically. The
 * chip's wiring is reviewed, not executed — an honest gap on the card, not a silent one.
 *
 * Also load-bearing: `context.setOffline(true)` affects the browser context only. The
 * `request` fixture is a Node-side APIRequestContext, so every server-truth check below
 * keeps working while the page believes the network is dead — the same split
 * `session-runner.spec.ts` exploits with `route.abort`.
 *
 * And a trap this file paid for on its own opening control run, stated so nobody re-pays:
 * `page.waitForFunction` with an **async** predicate is a silent no-op. The function returns
 * a Promise the moment it is called, a Promise is truthy, and the "wait" resolves instantly
 * no matter what the awaited value would have been. Every predicate below that needs to read
 * asynchronous browser state therefore runs Node-side through `expect.poll` + `page.evaluate`,
 * which does await. The synchronous form (`controller !== null`) stays on `waitForFunction`.
 */
import { expect, test, type Page } from '@playwright/test';

import { authHeaders, type TestSession } from '../integration/api/fixtures';
import { signInFreshUser } from './auth';
import {
  WORKOUT_FLOW_TIMEOUT_MS,
  completedSetCount,
  firstTick,
  startPushDay,
  waitForSynced,
  warmUpAndStart,
} from './runner-fixtures';

/**
 * Budget for specs that boot the worker: registration → install (precache of every URL in
 * the build manifest, ~21 files off the local server) → activate → a controlled reload →
 * the store-confirmation poll. Measured during implementation; stated rather than grown into
 * a wall-clock default.
 */
const SHELL_BOOT_TIMEOUT_MS = 45_000;

/** The prefixes `public/sw.js` owns. Nothing else in the app creates cache names like these. */
const SHELL_PREFIX = 'shell-';
const ASSETS_PREFIX = 'assets-';

async function cacheKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => caches.keys());
}

/**
 * Wait until the worker is ACTIVE and then hand the page a navigation it controls.
 *
 * `navigator.serviceWorker.ready` resolves on first activation, but a page loaded *before*
 * that never becomes controlled — the worker does not `clients.claim()`, by policy
 * (ASSUMPTION-m4-004). So the controlled page is a second navigation, and the promise of
 * this helper is `navigator.serviceWorker.controller !== null` on return.
 */
async function bringUnderShellControl(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  await page.waitForFunction(
    () => navigator.serviceWorker.controller !== null,
    undefined,
    { timeout: 10_000 },
  );
}

/**
 * Wait until the CURRENT document is actually in the shell cache.
 *
 * `networkFirstDocument` stores on success via `cache.put`, asynchronously after the
 * response has already reached the page — so "the reload returned" does not mean "the next
 * offline reload will be served". This poll is the difference between a spec that races its
 * own premise and one that waits for it.
 */
async function expectDocumentStored(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(async (href: string) => {
          const key = (await caches.keys()).find((n) => n.startsWith('shell-'));
          if (!key) return false;
          return Boolean(await (await caches.open(key)).match(href));
        }, page.url()),
      { timeout: 10_000, message: 'the shell never stored the current navigation document' },
    )
    .toBe(true);
}

/**
 * The nuclear button, used only by the negative control: no worker, no caches.
 *
 * Order matters — unregister first so no live worker can be mid-activate when the caches
 * go, and re-register is harmless: while offline, the update fetch itself cannot land.
 */
async function discardShell(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((r) => r.unregister()));
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  });
  await page.reload();
  await page.waitForFunction(
    () => navigator.serviceWorker.controller === null,
    undefined,
    { timeout: 10_000 },
  );
}

test.describe('offline shell (M4-22)', () => {
  test('AC-1: a visited session page reloads with no network at all, and the queued tick replays on return', async ({
    page,
    request,
  }) => {
    test.setTimeout(WORKOUT_FLOW_TIMEOUT_MS + SHELL_BOOT_TIMEOUT_MS);
    const auth: TestSession = await signInFreshUser(page, 'e2e-shell-offline-reload');
    try {
      await startPushDay(page);
      const sessionId = new URL(page.url()).pathname.split('/').pop() as string;
      await warmUpAndStart(page);

      await bringUnderShellControl(page);
      await expectDocumentStored(page);

      // The simulation session-runner.spec.ts could not run in M3: the whole context dead,
      // document included. That gap is what #111 exists to close, so this is the first spec
      // in the estate that gets to use the honest failure mode.
      await page.context().setOffline(true);
      const tick = firstTick(page);
      await tick.click();
      await expect(tick).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('sync-status')).toContainText('1 waiting to sync');

      await page.reload(); // the load-bearing line: served from cache, or everything below fails
      expect(new URL(page.url()).pathname).toBe(`/session/${sessionId}`);
      await expect(tick).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('sync-status')).toContainText('1 waiting to sync');

      const still = await request.get(`/api/sessions/${sessionId}`, {
        headers: authHeaders(auth) as Record<string, string>,
      });
      expect(still.status()).toBe(200);
      expect(completedSetCount(await still.json())).toBe(0);

      await page.context().setOffline(false);
      await waitForSynced(page);
      const drained = await request.get(`/api/sessions/${sessionId}`, {
        headers: authHeaders(auth) as Record<string, string>,
      });
      expect(completedSetCount(await drained.json())).toBe(1);
    } finally {
      await page.context().setOffline(false);
      await auth.cleanup();
    }
  });

  test('control: with the worker discarded, the same offline reload cannot happen', async ({
    page,
  }) => {
    /*
     * Not decoration. Without it, spec 1's green could be read as "Chromium kept the page
     * alive anyway", and the whole card would be resting on an unexamined alternative. This
     * asserts the failure direction: no worker → `ERR_INTERNET_DISCONNECTED` is what an
     * offline reload actually is. If a product change ever makes the SW unable to serve,
     * spec 1 goes red and this one stays green; together they say which side moved.
     */
    test.setTimeout(SHELL_BOOT_TIMEOUT_MS);
    const auth = await signInFreshUser(page, 'e2e-shell-offline-control');
    try {
      await page.goto('/');
      await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
      await discardShell(page);

      await page.context().setOffline(true);
      const error = await page.reload().catch((e: unknown) => e);
      expect(String(error)).toContain('ERR_INTERNET_DISCONNECTED');
    } finally {
      await page.context().setOffline(false);
      await auth.cleanup();
    }
  });

  test('AC-2: activating evicts stale shell generations but keeps the previous pair', async ({
    page,
  }) => {
    /*
     * The real activate handler, on the real file, with the generations seeded by hand —
     * including the keep-previous rule that is the only reason a deploy cannot strand the
     * FIRST offline reload (a stored document names its own build's hashed chunks).
     * Unregister-then-reregister is what makes a genuine install→activate happen without a
     * second deploy the harness cannot conjure (see the file header: `public/` is a boot
     * snapshot). Cache names survive unregister, so the fakes are still on disk for the new
     * worker's sweep to find.
     */
    test.setTimeout(SHELL_BOOT_TIMEOUT_MS);
    await page.goto('/sign-in');
    await bringUnderShellControl(page);

    const current = (await cacheKeys(page)).filter(
      (n) => n.startsWith(SHELL_PREFIX) || n.startsWith(ASSETS_PREFIX),
    );
    expect(current.length).toBeGreaterThanOrEqual(1);

    await page.evaluate(async () => {
      // Creation order matters: CacheStorage enumeration is create-order, and the handler's
      // "most recent other" is defined over it. These two fakes are deliberately older.
      await caches.open('shell-0000000000000000');
      await caches.open('assets-0000000000000000');
      await caches.open('shell-1111111111111111');
      await caches.open('assets-1111111111111111');
    });

    await page.evaluate(async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
    });
    await page.reload(); // fresh document → the registration component registers anew
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));

    await expect
      .poll(async () => !(await cacheKeys(page)).includes('shell-0000000000000000'), {
        timeout: 10_000,
        message: 'the oldest stale generation was never evicted',
      })
      .toBe(true);

    const after = await cacheKeys(page);
    const shellCurrent = after.filter((n) => n.startsWith(SHELL_PREFIX));
    expect(shellCurrent.some((n) => !n.endsWith('0000000000000000') && !n.endsWith('1111111111111111'))).toBe(true);
    // oldest other: gone, both halves.
    expect(after).not.toContain('shell-0000000000000000');
    expect(after).not.toContain('assets-0000000000000000');
    // previous other: kept, both halves — the keep-previous rule, executed.
    expect(after).toContain('shell-1111111111111111');
    expect(after).toContain('assets-1111111111111111');
    // and the sweep never touches foreign namespaces (there are none, but say it anyway).
    expect(after.some((n) => n.startsWith(SHELL_PREFIX) || n.startsWith(ASSETS_PREFIX))).toBe(true);

    await page.evaluate(async () => {
      await caches.delete('shell-1111111111111111');
      await caches.delete('assets-1111111111111111');
    });
  });

  test('AC-3/PD-7: /sign-in renders offline from its stored copy and names the failure honestly', async ({
    page,
  }) => {
    test.setTimeout(SHELL_BOOT_TIMEOUT_MS);
    await page.goto('/sign-in');
    await bringUnderShellControl(page);
    await expectDocumentStored(page);

    await page.context().setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();

    await page.getByLabel('Email address').fill('nobody-not-really@example.com');
    await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
    // PD-7: a network-layer failure must never read as a server refusal. The generic copy
    // would tell the user the app rejected them; there was no "the app" to reject anything.
    await expect(page.getByTestId('sign-in-message')).toContainText(
      'You appear to be offline. Reconnect and try again.',
    );
    await expect(page.getByTestId('sign-in-message')).not.toContainText('Unable to request');
    await page.context().setOffline(false);
  });

  test('PD-2: signing out destroys the stored user documents the shell kept', async ({
    page,
  }) => {
    /*
     * The mitigation leg of the privacy decision (PD-2): the shell cached SSR'd documents
     * that carry this athlete's data, and the cookie's death has to take the copies with it.
     * Asserted as content, not cache existence: after sign-out the shell may legitimately
     * hold the fresh, unauthenticated /sign-in document the post-sign-out navigation itself
     * stores. What may NOT survive is any /session/... document.
     */
    test.setTimeout(WORKOUT_FLOW_TIMEOUT_MS + SHELL_BOOT_TIMEOUT_MS);
    const auth = await signInFreshUser(page, 'e2e-shell-signout-purge');
    try {
      await startPushDay(page);
      await bringUnderShellControl(page);
      await expectDocumentStored(page);
      const cachedPaths = async () =>
        page.evaluate(
          async ([shellPrefix]) => {
            const urls: string[] = [];
            for (const key of (await caches.keys()).filter((k) =>
              k.startsWith(shellPrefix as string),
            )) {
              const cache = await caches.open(key);
              for (const request of await cache.keys()) urls.push(new URL(request.url).pathname);
            }
            return urls;
          },
          [SHELL_PREFIX] as string[],
        );
      expect(await cachedPaths()).toContain(
        new URL(page.url()).pathname, // proof the premise — the user document WAS stored
      );

      await page.goto('/settings');
      await page.getByTestId('sign-out').click();
      await expect(page).toHaveURL(/\/sign-in/, { timeout: 15_000 });
      await expect
        .poll(
          () =>
            page.evaluate(async () => {
              for (const key of (await caches.keys()).filter((k) => k.startsWith('shell-'))) {
                for (const request of await (await caches.open(key)).keys()) {
                  if (new URL(request.url).pathname.startsWith('/session/')) return false;
                }
              }
              return true;
            }),
          { timeout: 10_000, message: 'a /session/ document outlived sign-out' },
        )
        .toBe(true);
    } finally {
      await auth.cleanup();
    }
  });
});
