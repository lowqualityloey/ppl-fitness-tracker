import { expect } from '@playwright/test';

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
  await expect(page.getByTestId('session-subtitle')).toContainText('Working out');
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
  await expect(page.getByTestId('session-subtitle')).toContainText('Resting');
}
