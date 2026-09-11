import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * M3-03 (#60): the accessibility assertions every later screen will be held to.
 *
 * This file deliberately covers the two routes that exist *today* — `/` and
 * `/sign-in` — rather than waiting for M3-04's dashboard. A gate that has no
 * subject is indistinguishable from a gate that does not run, which is the failure
 * mode `tests/e2e/` itself demonstrated for five weeks. When M3-04 adds screens
 * they join this list, and the list failing to grow is itself a review signal.
 *
 * axe's `color-contrast` rule is part of the default run, so text contrast is
 * checked against the *rendered* background — which complements the token-level
 * gate in `tests/unit/design/contrast.test.ts`: that one proves the palette is
 * sound in isolation, this one proves it survives being applied to markup.
 */

interface Route {
  path: string;
  label: string;
  /**
   * Whether this route is *expected* to contain an interactive control today.
   * `/` is currently the M1 placeholder — a heading and a paragraph, nothing to
   * operate — so "Tab must land on a control" was a wrong assertion, not a
   * discovered defect: axe reported zero violations and the `<h1>` count was right.
   * The real invariant is that whatever focus can land on must be a genuine control,
   * and that a route which claims to be interactive exposes at least one. M3-04 turns
   * the dashboard into `interactive: true`, which makes the stronger half apply to it.
   */
  interactive: boolean;
}

const routes: ReadonlyArray<Route> = [
  { path: '/', label: 'home', interactive: false },
  { path: '/sign-in', label: 'sign-in', interactive: true },
];

test.describe('accessibility gate', () => {
  for (const route of routes) {
    test(`${route.label} has no automated violations`, async ({ page }) => {
      await page.goto(route.path);

      const results = await new AxeBuilder({ page }).analyze();
      // Fail with the rule ids and node counts, not just "3 violations": the next
      // person to hit this should not have to re-run to learn what broke.
      const summary = results.violations.map(
        (violation) => `${violation.id} (${violation.impact ?? 'unknown'}) × ${violation.nodes.length}`,
      );
      expect(summary, `axe violations on ${route.path}`).toEqual([]);
    });

    test(`${route.label} has one h1 and focus lands on a real control`, async ({ page }) => {
      await page.goto(route.path);

      await expect(page.locator('h1')).toHaveCount(1);

      const controlCount = await page.locator('a, button, input, select, textarea').count();
      if (route.interactive) {
        // An interactive route with nothing focusable is the keyboard-dead page this
        // gate exists to catch, so the count itself is the assertion.
        expect(controlCount, `${route.path}: interactive route must expose a control`).toBeGreaterThan(0);
      }

      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => document.activeElement?.tagName ?? null);
      if (route.interactive) {
        // A Tab that lands nowhere means keyboard users cannot enter the page at all.
        expect(focused, `${route.path}: Tab must move focus into a control`).not.toBeNull();
        expect(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'], `${route.path} first Tab stop`)
          .toContain(focused);
      } else if (focused !== null && focused !== 'BODY') {
        // Placeholder page: no obligation to have a control, but no fake one either.
        expect(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'], `${route.path} first Tab stop`)
          .toContain(focused);
      }
    });
  }
});
