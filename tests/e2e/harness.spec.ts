import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * M3-03 (#60): the harness must be observed failing before anything built on it
 * is allowed to pass.
 *
 * `playwright.config.ts` has existed since M1 with `testDir: "./tests/e2e"` —
 * a directory that did not exist until this file. Intake debt **D7** named that
 * precisely and stayed open for weeks, because "the E2E gate is green" reads like
 * evidence while `npx playwright test` reports `no tests found` and exits non-zero
 * only if someone looks. A detector that has never been seen to fire is not a
 * disarmed detector; it is an unread one.
 *
 * So the first spec in this directory is not a feature test. It proves, in both
 * directions, that the accessibility assertion machinery works:
 *
 *   1. a real violation is reported (the thing we need catching), and
 *   2. the same probe without the violation is clean (so it is not simply always
 *      red, which would be just as useless as always green).
 *
 * Both directions are asserted *in the same test*, so the pair cannot rot apart:
 * if someone weakens the assertion to `expect(...).toBeDefined()`, the clean-half
 * fails.
 */

test.describe('E2E harness self-proof', () => {
  test('axe reports a violation that exists and stays quiet when it does not', async ({ page }) => {
    await page.goto('/');

    // Half 1 — inject an unnamed image and require axe to name that exact rule.
    await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.id = 'harness-probe';
      probe.innerHTML = '<img src="/clearly-absent-probe.png">';
      document.body.append(probe);
    });

    const withViolation = await new AxeBuilder({ page }).include('#harness-probe').analyze();
    expect(
      withViolation.violations.map((violation) => violation.id),
      'the harness must catch an image with no accessible name',
    ).toContain('image-alt');

    // Half 2 — fix the markup in place; the same rule must now be silent.
    await page.evaluate(() => {
      const probe = document.querySelector('#harness-probe img');
      probe?.setAttribute('alt', 'A deliberately named probe image');
    });

    const withoutViolation = await new AxeBuilder({ page }).include('#harness-probe').analyze();
    expect(
      withoutViolation.violations.map((violation) => violation.id),
      'the harness must not invent violations (an always-red gate catches nothing)',
    ).not.toContain('image-alt');
  });

  test('the suite is pointed at a production server, not a dev one', async ({ request }) => {
    /**
     * Every number this directory produces is a prod-mode number, because
     * `webServer` runs `next:build && next:start`. That only holds if nothing else
     * is sitting on :3001 — and a dev server on the port is invisible in the
     * results: the tests still pass, the latencies are just measuring a different
     * build. M2-06 already refused to quote a dev-mode p95 as production evidence,
     * so this guard is what keeps that promise mechanically rather than by note.
     *
     * `reuseExistingServer: !process.env.CI` means a leftover `next dev` on 3001 is
     * *reused* locally, which is exactly the failure this spec exists to catch.
     */
    const html = await (await request.get('/')).text();

    for (const devOnly of ['/_next/webpack-hmr', 'react-refresh', 'next-dev-indicator']) {
      expect(html, `E2E must not run against a dev server (found ${devOnly})`).not.toContain(devOnly);
    }
  });
});
