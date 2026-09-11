import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createTestSession, type TestSession } from '../integration/api/fixtures.js';
import {
  armNoMouseGuard,
  completeWorkoutByKeyboard,
  pointerEventCount,
  startPushDayByKeyboard,
  firstTick,
  startPushDay,
  waitForSynced,
  warmUpAndStart,
} from './runner-fixtures';

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
  { path: '/', label: 'home', interactive: true },
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


/**
 * G-M3-5 (M3-10, #67): keyboard-only completion of a full session.
 *
 * "Tab works" is not this gate. `armNoMouseGuard` makes `page.mouse.*` throw and counts real
 * pointer events page-side, so the test cannot quietly lean on a click; and the session is asserted
 * finished on the **server**, because a UI that walks through its phases on screen while the engine
 * refuses every mutation is the shape of a false pass here.
 */
// G-M3-5. The guard is the point: `armNoMouseGuard` makes `page.mouse.*` throw and counts pointer
// events page-side, so a future edit that reaches for `.click()` fails naming the rule.
test('a whole session can be completed with the keyboard alone', async ({ page }) => {
  const auth = await createTestSession('e2e-a11y-kbd');
  try {
    await armNoMouseGuard(page);
    await page.goto('/');
    await page.context().addCookies(
      auth.cookies.map((c) => ({ name: c.name, value: c.value, url: new URL(page.url()).origin })),
    );
    await startPushDayByKeyboard(page);
    await completeWorkoutByKeyboard(page);

    expect(
      await pointerEventCount(page),
      'the flow used a pointer; the keyboard-only claim is void',
    ).toBe(0);

    const sessionId = new URL(page.url()).pathname.split('/').pop()!;
    const stored = await page.request.get(`/api/sessions/${sessionId}`, {
      headers: { Cookie: auth.cookie },
    });
    expect(stored.status()).toBe(200);
    const body = (await stored.json()) as { data: { status: string; sets: { isCompleted: boolean }[] } };
    expect(body.data.status).toBe('completed');
    expect(body.data.sets.every((set) => set.isCompleted)).toBe(true);
  } finally {
    await auth.cleanup();
  }
});

/**
 * G-M3-6: no state carried by colour alone.
 *
 * axe cannot test this — it checks that colour *differs enough*, and a red/green pair passes
 * beautifully while remaining unreadable to the ~8% of men with red-green deficiency. The assertion
 * has to be that each state also has a **non-chromatic** carrier: a glyph, a word, or an attribute.
 *
 * `✓ Logged` / `○ Not logged` is that proof for the control that matters most: an athlete standing
 * at a bar with a phone in a sweaty hand needs the state to survive a screen they cannot parse by
 * hue. The check is written to fail if someone "simplifies" the button down to a coloured circle,
 * because that version looks cleaner in a screenshot and reads as nothing at all in a gym.
 */
// G-M3-6, and note the shape of the finding: axe cannot test this at all, because axe only asks
// whether colours differ enough. A red/green pair scores perfectly while being unreadable to about
// 8% of men.
test('state is carried by glyph and word, not by colour', async ({ page }) => {
  const auth = await createTestSession('e2e-a11y-colour');
  try {
    await page.goto('/');
    await page.context().addCookies(
      auth.cookies.map((c) => ({ name: c.name, value: c.value, url: new URL(page.url()).origin })),
    );
    await startPushDay(page);
    await warmUpAndStart(page);

    const tick = firstTick(page);
    /*
     * One `evaluate` per snapshot, not four awaited reads.
     *
     * The first draft read `innerText`, the glyph, `aria-pressed` and the computed colour as four
     * separate round trips. A tick is an optimistic update that the reconciliation refetch can
     * *revert*, so those four reads can straddle a state change — and then the log prints a button
     * whose `aria-pressed` moved while its word did not, which is not a real DOM state at all. It
     * looked like a product defect for exactly that reason. Snapshotting inside the page reads one
     * consistent moment, which is the only unit this assertion is meaningful over.
     */
    interface TickState {
      text: string;
      glyph: string;
      pressed: string | null;
      background: string;
      border: string;
      textColour: string;
    }
    const snapshot = async (): Promise<TickState> =>
      await tick.evaluate((el) => {
        const style = getComputedStyle(el);
        const glyph = el.querySelector('span[aria-hidden=\"true\"]');
        return {
          text: (el.textContent ?? '').trim(),
          glyph: (glyph?.textContent ?? '').trim(),
          pressed: el.getAttribute('aria-pressed'),
          background: style.backgroundColor,
          border: style.borderColor,
          textColour: style.color,
        };
      });
    const before = await snapshot();
    await tick.click();
    await expect(tick).toHaveAttribute('aria-pressed', 'true');
    const after = await snapshot();
    /*
     * Deliberately **not** `waitForSynced` before the second snapshot.
     *
     * The first version captured `after` only once the queue had drained, and in this flow the row
     * was back to `Not logged` by then — completion asserted true, sync reported clean, and the
     * server's reconciled view disagrees. That is a data question (filed alongside this slice), not
     * a colour question, and conflating them would let a lost set hide inside an accessibility gate.
     * G-M3-6 is about what the two DOM states convey to a user, so the two states are compared
     * directly, and #67's other specs are where persistence is proven.
     */

    console.log('TICK_STATE>>>', JSON.stringify({ before, after }));
    /*
     * The invariant, stated the way G-M3-6 actually means it.
     *
     * The goal forbids colour being the **only** carrier of a state; it does not require colour to
     * change. Demanding that every channel move is a stronger claim than the spec's, and the first
     * run proved the stronger claim false for a reason that is not a defect: the tick's background
     * is `rgba(0,0,0,0)` in *both* states, so this control carries completion by word and glyph and
     * deliberately not by hue. That version passes the requirement and would have failed my test.
     *
     * So: the non-chromatic channels must **all** move, and colour may or may not. If colour ever
     * *is* the differentiator — which is what the `if` below is watching for — the words must still
     * be there, because then someone has started relying on the thing this goal forbids.
     */
    expect(after.pressed, 'completion is not in the accessibility tree').not.toBe(before.pressed);
    expect(after.glyph, 'the state glyph did not change').not.toBe(before.glyph);
    expect(after.text, 'the state word did not change').not.toBe(before.text);
    const chromaticChanged =
      after.background !== before.background ||
      after.border !== before.border ||
      after.textColour !== before.textColour;
    console.log(`TICK_COLOUR>>> hueCarriesState=${chromaticChanged}`);
    if (chromaticChanged) {
      expect(after.text, 'colour started carrying state on its own').toMatch(/Logged/i);
    }

    // Phase identity is a sentence, not a badge hue.
    await expect(page.getByTestId('session-subtitle')).toContainText(/Working out|Resting|Stretching|Finishing/);

    // Every badge on the screen that changes tone says something in words: a tone-only badge is the
    // same defect wearing a different name.
    const badges = await page.locator('[data-testid="queue-badge"], [data-testid="phase-gate"]').allInnerTexts();
    for (const badge of badges) expect(badge.trim().length, 'a state badge with no text').toBeGreaterThan(0);
  } finally {
    await auth.cleanup();
  }
});

/** G-M3-5: axe on the three routes the goal names, with a real session on screen. */
test('axe is clean on /history and on a live session', async ({ page }) => {
  const auth = await createTestSession('e2e-a11y-threeroutes');
  const checked: TestSession = auth;
  try {
    await page.goto('/');
    const origin = new URL(page.url()).origin;
    await page.context().addCookies(
      checked.cookies.map((c) => ({ name: c.name, value: c.value, url: origin })),
    );
    for (const path of ['/history', '/']) {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations.map((v) => `${v.id} on ${path}`)).toEqual([]);
    }
    await startPushDay(page);
    await warmUpAndStart(page);
    await firstTick(page).click();
    const live = await new AxeBuilder({ page }).analyze();
    expect(live.violations.map((v) => `${v.id} on /session/[id]`)).toEqual([]);
  } finally {
    await auth.cleanup();
  }
});
