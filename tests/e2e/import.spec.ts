import { expect, test } from '@playwright/test';
import { signInFreshUser } from './auth';

/**
 * The legacy import dialog (M3-09, #66, tasks 3 and 4).
 *
 * `addInitScript` seeds `localStorage` before any app code runs, because the panel reads the slots
 * when it is used rather than when it mounts — the same order a real browser has the data in.
 */

const PUSH_SLOT = JSON.stringify({
  currentPhase: 'main-workout',
  state: {
    mainWorkoutSets: { 'ex1-set1': true, 'ex1-set2': false },
    warmupExercises: { 'cardio-done': true },
  },
  timestamp: Date.parse('2026-08-01T09:00:00.000Z'),
});

const LEGS_SLOT = JSON.stringify({
  currentPhase: 'main-workout',
  state: { mainWorkoutSets: { 'ex2-set1': true } },
  checkboxStates: { 'ex2-set1': true },
  timerStates: { cardio: { seconds: 120, isRunning: false } },
});

async function seedSlots(page: import('@playwright/test').Page, slots: Record<string, string>) {
  await page.addInitScript(
    (payload: Record<string, string>) => {
      for (const [key, value] of Object.entries(payload)) window.localStorage.setItem(key, value);
    },
    slots,
  );
}

test.describe('legacy import', () => {
  test('reports what it created and what it could not recover, and the log shows the sessions', async ({
    page,
  }) => {
    const auth = await signInFreshUser(page, 'e2e-import-full');
    await seedSlots(page, { pushWorkoutProgress: PUSH_SLOT, legsWorkoutProgress: LEGS_SLOT });
    try {
      await page.goto('/settings');
      await page.getByTestId('import-run').click();

      await expect(page.getByTestId('import-report')).toBeVisible();
      await expect(page.getByTestId('import-slots')).toContainText('pushWorkoutProgress — read and sent');

      // The counts are read back from the dialog rather than hardcoded, and the history route is
      // then asserted against *that* number: the claim is "the log shows what the report says it
      // created", which survives the importer's rules changing under us.
      const counts = (await page.getByTestId('import-counts').innerText()).trim();
      const created = Number(counts.match(/^(\d+)/)?.[1] ?? '0');
      expect(created).toBeGreaterThan(0);

      // The failure mode the card names: "Import successful" and nothing else. Legacy never stored
      // weight, reps, or per-set timing, and the dialog has to say so on screen.
      await expect(page.getByTestId('import-not-recovered')).toContainText(/weight|reps/i);

      await page.goto('/history');
      await expect(page.getByTestId('history-row')).toHaveCount(created);
      await expect(page.getByTestId('history-row').first()).toContainText('Imported');
      await expect(page.getByTestId('history-row').first()).toContainText('recorded without load');

      // And the source data is untouched — decommissioning the old app is M4's decision.
      expect(
        await page.evaluate(() => window.localStorage.getItem('pushWorkoutProgress')),
        'import must not delete the legacy slot',
      ).not.toBeNull();
    } finally {
      await auth.cleanup();
    }
  });

  test('a second run replays without creating a second copy', async ({ page }) => {
    const auth = await signInFreshUser(page, 'e2e-import-replay');
    await seedSlots(page, { pushWorkoutProgress: PUSH_SLOT });
    try {
      await page.goto('/settings');
      await page.getByTestId('import-run').click();
      const first = (await page.getByTestId('import-counts').innerText()).trim();
      await page.goto('/history');
      const rows = await page.getByTestId('history-row').count();

      await page.goto('/settings');
      await page.getByTestId('import-run').click();
      const second = (await page.getByTestId('import-counts').innerText()).trim();
      await page.goto('/history');

      expect(second).toBe(first);
      await expect(page.getByTestId('history-row')).toHaveCount(rows);
    } finally {
      await auth.cleanup();
    }
  });

  test('reports a malformed slot by name only and still imports the readable ones', async ({
    page,
  }) => {
    const auth = await signInFreshUser(page, 'e2e-import-malformed');
    await seedSlots(page, {
      pushWorkoutProgress: PUSH_SLOT,
      // Recoverable content would be echoed nowhere; the slot is named, its contents never are.
      legsWorkoutProgress: '{"currentPhase": "main-workout", "checkboxStates": {oops',
      userStats: '{"bodyWeight":88.4}',
    });
    try {
      await page.goto('/settings');
      await page.getByTestId('import-run').click();

      await expect(page.getByTestId('import-slots')).toContainText(
        'legsWorkoutProgress — could not be parsed, skipped',
      );
      await expect(page.getByTestId('import-slots')).toContainText(
        'userStats — left alone: body measurements are not modelled',
      );
      await expect(page.getByTestId('import-report')).toBeVisible();
      await expect(page.getByTestId('import-counts')).not.toContainText('0 sessions created');

      const body = await page.locator('body').innerText();
      expect(body).not.toContain('checkboxStates');
      expect(body).not.toContain('88.4');
    } finally {
      await auth.cleanup();
    }
  });

  test('says there is nothing to import when the browser holds no legacy data', async ({ page }) => {
    const auth = await signInFreshUser(page, 'e2e-import-empty');
    try {
      await page.goto('/settings');
      await page.getByTestId('import-run').click();
      await expect(page.getByTestId('import-error')).toContainText('Nothing to import');
      await expect(page.getByTestId('import-report')).toHaveCount(0);
    } finally {
      await auth.cleanup();
    }
  });
});

test.describe('legacy import — the branches the card names', () => {
  test('surfaces the collapsed-key warning the importer emits', async ({ page }) => {
    const auth = await signInFreshUser(page, 'e2e-import-collapsed');
    // A real legacy shape, not a constructed one: the old pull page rendered set checkboxes without
    // ids, so every entry collapsed onto the empty string. The importer cannot attribute such a
    // completion to a set and says so — the dialog has to keep saying it.
    await seedSlots(page, {
      pullDayProgress: JSON.stringify({
        currentPhase: 'workout',
        completedSets: 1,
        completedExercises: 1,
        workoutStartTime: Date.parse('2026-07-15T18:00:00.000Z'),
        cardioTimeLeft: 0,
        cooldownTimeLeft: 300,
        checkboxStates: { '': true },
        stretchStates: {},
      }),
    });
    try {
      await page.goto('/settings');
      await page.getByTestId('import-run').click();
      const warnings = page.getByTestId('import-warnings');
      await expect(warnings).toContainText('collapsed key');
      await expect(warnings).toContainText('aggregate counts only');
      await expect(page.getByTestId('import-not-recovered')).toContainText('per-set completion');
    } finally {
      await auth.cleanup();
    }
  });

  test('says when a session was filed under a guessed date', async ({ page }) => {
    const auth = await signInFreshUser(page, 'e2e-import-lowdate');
    // No `timestamp` at all, which is what the oldest records look like: the importer falls back to
    // the import date and records `dateConfidence: 'low'`. The UI claim is that the athlete is told
    // the day may be wrong, because a silently-misdated log is the quiet history rewrite this card
    // exists to prevent.
    await seedSlots(page, {
      pushWorkoutProgress: JSON.stringify({
        currentPhase: 'main-workout',
        state: { mainWorkoutSets: { 'ex1-set1': true } },
      }),
    });
    try {
      await page.goto('/settings');
      await page.getByTestId('import-run').click();
      await expect(page.getByTestId('import-date-low')).toBeVisible();
      await expect(page.getByTestId('import-report')).toContainText('may not be the day you trained');
    } finally {
      await auth.cleanup();
    }
  });
});
