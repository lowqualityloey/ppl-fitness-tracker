import { expect } from '@playwright/test';
import { POLL_INTERVAL_VISIBLE_MS } from '../../src/app/state/sync-engine';

export const START_DAY = 'Push Day';

/**
 * Budget for the two specs that walk a whole workout.
 *
 * Measured at **31.9 s** on this machine against the production build for
 * `walks a whole workout…`, which is 17 set writes, four phase advances, three task
 * completions, and a queue drain — every one of them a real authenticated round trip
 * through `next start`, because the point of these specs is that nothing is stubbed. The
 * default 30 s was failing by two seconds, so the honest choice was between cutting the
 * scenario and stating the cost. `#61` set this precedent with `ROUTE_BUDGET_MS`: a named
 * budget with the measurement in the comment, never a loosened assertion. The assertions
 * below are unchanged.
 */
export const WORKOUT_FLOW_TIMEOUT_MS = 90_000;

/**
 * A server-truth phase label can lag one poll, and that is the app's design rather than its defect.
 *
 * `src/app/session/[id]/runner.tsx:459` renders the subtitle from `serverView.phase`, and `:1155-1160`
 * states the intent outright — "The client *asks*; it does not decide… a transition the server refuses
 * arrives as a rejection plus a refetch". So a phase becomes visible only after: enqueue → possibly
 * deferred to the next cycle by `sync-engine.ts:211`'s single-flight guard or `:216`'s backoff window →
 * POST → applied → invalidate → `GET /api/sessions/[id]` → render. The deferral quantum is
 * `POLL_INTERVAL_VISIBLE_MS`.
 *
 * Two cycles plus a refetch is the honest bound. Playwright's 5 000 ms default is **inside** it, which is
 * the root cause of every label red in docs/rca/m4-100-contention-ledger.md (`a11y.spec.ts:102` on CI,
 * `session-runner.spec.ts:201`, `timers.spec.ts:277`, and `dashboard.spec.ts:125` at a 4.0 s baseline).
 * The value is imported, not retyped, so the window cannot drift away from the interval it is derived
 * from; `tests/unit/infra/e2e-phase-window.test.ts` fails if the relationship stops holding.
 */
export const PHASE_LABEL_WINDOW_MS = 2 * POLL_INTERVAL_VISIBLE_MS + 2_000;

/**
 * Assert a phase label with the window its own propagation path requires.
 *
 * The bare `toContainText(...)` default is what made correct behaviour look flaky: it gave a
 * poll-delivered server fact less time than the poll is allowed to take.
 */
export async function expectPhase(
  page: import('@playwright/test').Page,
  // Exactly the app's labels: `PHASE_LABEL` in `src/app/session/[id]/runner.tsx:75-81`. The guard in
  // tests/unit/infra/e2e-phase-window.test.ts fails if the two lists ever disagree, because this one is
  // hand-written and the app's is not. 'Finishing' used to appear here as a loose prefix of
  // 'Finishing up', which typecheck surfaced the moment the union replaced free-form strings.
  label: 'Warming up' | 'Working out' | 'Resting' | 'Stretching' | 'Finishing up',
): Promise<void> {
  await expect(page.getByTestId('session-subtitle')).toContainText(label, {
    timeout: PHASE_LABEL_WINDOW_MS,
  });
}

export async function startPushDay(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: `Start ${START_DAY}` }).click();
  await expect(page).toHaveURL(/\/session\/[0-9a-f-]{36}/);
  await expect(page.getByRole('heading', { level: 1, name: START_DAY })).toBeVisible();
}

/** The first tick target the seeded day provides. */
export function firstTick(page: import('@playwright/test').Page) {
  return page.locator('[data-testid^="tick-"]').first();
}

/** Wait for the queue to empty, which is the screen's own claim that it is synced. */
export async function waitForSynced(page: import('@playwright/test').Page) {
  await expect(page.getByTestId('sync-status')).toContainText('All changes synced', {
    timeout: 20_000,
  });
}

/**
 * Cross the first gate the way an athlete does: tick the warm-up, advance.
 *
 * This is not ceremony. `assertSetMutationAllowed` refuses every set change outside
 * `exercise`/`rest`, so a spec that ticks on arrival is refused by the server — which is
 * exactly what happened when these tests were first written, and what pinned the fact that
 * the phase machine, not the screen, decides what a tick means.
 */
export async function warmUpAndStart(page: import('@playwright/test').Page) {
  // The hint names the gate before the server has to refuse it.
  await expect(page.getByTestId('phase-gate')).toContainText('Warm-up done');
  await expect(page.getByTestId('sets-locked')).toBeVisible();
  await expect(page.locator('[data-testid^="tick-"]').first()).toBeDisabled();

  await page.getByTestId('task-warm_up').click();
  await waitForSynced(page);
  await page.getByTestId('advance-phase').click();
  await expectPhase(page, 'Working out');
  await expect(page.locator('[data-testid^="tick-"]').first()).toBeEnabled();
}

/**
 * Cross the warm-up gate *and* the ungated move into rest, which is where the timers live.
 *
 * Split out from #64's specs rather than copied: `warmUpAndStart` encodes the phase machine's
 * order, and a second copy in a second file is a rule that drifts the first time a gate moves.
 */
export async function advanceIntoRest(page: import('@playwright/test').Page) {
  await warmUpAndStart(page);
  await page.getByTestId('advance-phase').click();
  await expectPhase(page, 'Resting');
}

/**
 * Keyboard-only driving (M3-10, #67, G-M3-5).
 *
 * Lives in the shared fixture rather than in the a11y spec because #60's completion flow already
 * encodes the phase-machine order (`assertSetMutationAllowed` refuses a set change outside
 * exercise/rest, so ticking on arrival is rejected). A second copy of that order in a second file is
 * a rule that drifts — and drift here would leave a keyboard-only test completing a workout the app
 * can never complete by mouse.
 */

/**
 * Focus the *control* and activate it without a pointer.
 *
 * Two details that are the whole function:
 *
 * - The locator often resolves to a `<label>`, because a task row is a label wrapping a checkbox.
 *   A label is not focusable, so `focus()` + a key press on it is a no-op that looks like the app
 *   ignoring the keyboard. The focusable control is looked for inside.
 * - **Space, not Enter.** Enter activates a `<button>` but does nothing to a checkbox; Space
 *   activates both. An earlier draft pressed Enter everywhere and the keyboard test "failed" on a
 *   phase gate that was never reached — which is the right outcome for the test, and the wrong
 *   diagnosis to leave in the file.
 */
export async function pressActivate(locator: import('@playwright/test').Locator): Promise<void> {
  const control = locator.or(locator.locator('input, select, textarea, a[href], button').first());
  const target = (await control.count()) > 0 ? control : locator;
  const checkbox = target.locator('input[type="checkbox"]').first();
  const focusable = (await checkbox.count()) > 0 ? checkbox : target;
  await focusable.focus();
  await focusable.press('Space');
}

/**
 * Every legacy `localStorage` name the new app must never write.
 *
 * Four come from `LEGACY_KEYS` in the importer; `guest_mode` is the fifth, set by the old
 * dashboard's own scripts. It belongs in the list because the invariant is about the *namespace*,
 * not about which names the importer happens to read.
 */
export const LEGACY_LOCALSTORAGE_KEYS: readonly string[] = [
  'pushWorkoutProgress',
  'legsWorkoutProgress',
  'pullDayProgress',
  'userStats',
  'guest_mode',
];

/**
 * Make mouse input impossible for the rest of the test, and *count* what the page actually received.
 *
 * Two guards, because each alone is weak. Monkey-patching `page.mouse` means any future edit that
 * reaches for `.click()` fails immediately with a sentence naming the rule, instead of quietly
 * passing a "keyboard-only" test that used a mouse. The page-side counter catches the subtler case:
 * a helper that dispatches a synthetic pointer event would slip past the Node-side patch entirely.
 *
 * `click` is deliberately **not** counted: Enter on a focused button legitimately fires a `click`
 * event, and forbidding that would forbid keyboard activation itself. Pointer, mouse-press, and
 * touch events are the mouse-only ones.
 */
export async function armNoMouseGuard(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __pointerEvents: string[] };
    w.__pointerEvents = [];
    for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart']) {
      document.addEventListener(type, () => w.__pointerEvents.push(type), true);
    }
  });
  const mouse = page.mouse as unknown as Record<string, unknown>;
  for (const method of ['click', 'down', 'up', 'move', 'dblclick']) {
    mouse[method] = async () => {
      throw new Error(
        `keyboard-only: page.mouse.${method}() is not available. Activate controls with focus() + press('Enter').`,
      );
    };
  }
}

export function pointerEventCount(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => {
    const w = window as unknown as { __pointerEvents?: string[] };
    return w.__pointerEvents?.length ?? 0;
  });
}

/** The legacy dashboard's Start button, reached without a pointer. */
export async function startPushDayByKeyboard(
  page: import('@playwright/test').Page,
): Promise<void> {
  await page.goto('/');
  await pressActivate(page.getByRole('button', { name: `Start ${START_DAY}` }));
  await expect(page).toHaveURL(/\/session\/[0-9a-f-]{36}/);
}

/**
 * Complete a whole session — warm-up through finish — using the keyboard alone.
 *
 * The assertions between phases are not decoration: each is the proof that the keyboard path
 * actually crossed a gate. A key press that did nothing would otherwise sail through to
 * `finish-session` and fail there, and the failure would read like a finish-button bug.
 */
export async function completeWorkoutByKeyboard(
  page: import('@playwright/test').Page,
): Promise<void> {
  await expect(page.getByTestId('phase-gate')).toContainText('Warm-up');
  await pressActivate(page.getByTestId('task-warm_up'));
  await waitForSynced(page);
  await pressActivate(page.getByTestId('advance-phase'));
  await expectPhase(page, 'Working out');

  const ticks = page.locator('[data-testid^="tick-"]');
  const total = await ticks.count();
  expect(total).toBeGreaterThan(0);
  for (let index = 0; index < total; index += 1) {
    const tick = ticks.nth(index);
    if ((await tick.getAttribute('aria-pressed')) === 'false') await pressActivate(tick);
  }
  await waitForSynced(page);

  await pressActivate(page.getByTestId('advance-phase'));
  await expectPhase(page, 'Resting');
  await pressActivate(page.getByTestId('task-main_workout'));
  await waitForSynced(page);

  await pressActivate(page.getByTestId('advance-phase'));
  await expectPhase(page, 'Stretching');
  await pressActivate(page.getByTestId('task-stretch'));
  await waitForSynced(page);

  await pressActivate(page.getByTestId('advance-phase'));
  await expectPhase(page, 'Finishing up');
  await pressActivate(page.getByTestId('finish-session'));
  /*
   * `waitForSynced` cannot prove a finish. It waits for the badge to read "All changes synced", and
   * at this moment the badge is *already* reading that — the click handler enqueues and drains
   * asynchronously, so the poll can pass before the `session.finish` mutation has even left. The
   * status is then read from the server, which still says `in_progress`, and the failure looks like
   * the keyboard not working. It was the assertion being early, not the input.
   *
   * So wait on the thing actually being claimed: the session's status, as the server holds it.
   */
  const sessionId = new URL(page.url()).pathname.split('/').pop()!;
  await expect
    .poll(
      async () => {
        const response = await page.request.get(`/api/sessions/${sessionId}`);
        if (!response.ok()) return `http ${response.status()}`;
        const body = (await response.json()) as { data?: { status?: string } };
        return body.data?.status ?? 'unknown';
      },
      { timeout: 20_000, message: 'the session never reached `completed` after a keyboard finish' },
    )
    .toBe('completed');
}
