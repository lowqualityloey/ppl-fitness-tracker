import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { signInFreshUser } from './auth';
import { openHistoryDb, seedSession } from './history-fixtures';

/**
 * `/history` and `/history/[id]` (M3-08, #65).
 *
 * Rows are seeded with SQL rather than clicked (`tests/e2e/history-fixtures.ts` explains the
 * budget); every assertion below is about what the *pages* do with them, which is the part this
 * slice adds.
 */

test.describe('workout history', () => {
  test('groups sessions by day, newest first, and links each one to its report', async ({ page }) => {
    const auth = await signInFreshUser(page, 'e2e-history-list');
    const db = await openHistoryDb();
    try {
      await seedSession(db, { userId: auth.userId, localDate: '2026-09-09' });
      await seedSession(db, { userId: auth.userId, localDate: '2026-09-10' });
      await seedSession(db, { userId: auth.userId, localDate: '2026-09-10' });
      await seedSession(db, { userId: auth.userId, localDate: '2026-09-08' });

      await page.goto('/history');

      // Two sessions share 2026-09-10 and must appear under one heading. A list that grouped by
      // `startedAt` instead, or that emitted a heading per row, would produce four headings here and
      // read as a log of four different days.
      await expect(page.getByTestId('history-day')).toHaveText([
        '2026-09-10',
        '2026-09-09',
        '2026-09-08',
      ]);
      await expect(page.getByTestId('history-row')).toHaveCount(4);

      // The day name comes from the routine plan, not from the session row: a summary carries only
      // `routineDayId`, and a history of UUIDs would be a database dump wearing a heading.
      await expect(page.getByTestId('history-row').first()).toContainText('Push Day');

      const href = await page.getByTestId('history-row').first().getByRole('link').first().getAttribute('href');
      expect(href).toMatch(/^\/history\/[0-9a-f-]{36}$/);

      await page.getByTestId('history-row').first().getByRole('link').first().click();
      await expect(page).toHaveURL(/\/history\/[0-9a-f-]{36}$/);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Push Day');
      await expect(page.getByRole('heading', { level: 1, name: 'History' })).toHaveCount(0);
    } finally {
      await db.end();
      await auth.cleanup();
    }
  });

  test('walks the cursor to the next page and stops offering one when the log is exhausted', async ({
    page,
  }) => {
    const auth = await signInFreshUser(page, 'e2e-history-cursor');
    const db = await openHistoryDb();
    try {
      // 21 sessions, because the repository's page size is 20 and the interesting behaviour is the
      // seam: the link that must appear on page one and must not appear on page two.
      for (let day = 1; day <= 21; day += 1) {
        await seedSession(db, {
          userId: auth.userId,
          localDate: `2026-08-${String(day).padStart(2, '0')}`,
        });
      }

      await page.goto('/history');
      await expect(page.getByTestId('history-row')).toHaveCount(20);
      await expect(page.getByText('That is the whole log.')).toHaveCount(0);

      const older = page.getByRole('link', { name: 'Older workouts' });
      await expect(older).toBeVisible();
      expect(await older.getAttribute('href')).toContain('/history?cursor=');

      await older.click();

      await expect(page.getByTestId('history-row')).toHaveCount(1);
      await expect(page.getByTestId('history-day')).toHaveText('2026-08-01');
      await expect(page.getByRole('link', { name: 'Older workouts' })).toHaveCount(0);
      // The end of the log has to be stated. An absent link is indistinguishable from a broken
      // button to someone who cannot see the page, and "is there more?" is the one question a
      // cursor-paginated list must answer out loud.
      await expect(page.getByText('That is the whole log.')).toBeVisible();
    } finally {
      await db.end();
      await auth.cleanup();
    }
  });

  /*
   * #82. The range is a filter on the walk, so the two things worth proving are that it narrows
   * the list and that it is still narrow on page two — a next-page link that dropped `from`/`to`
   * would quietly widen the list the moment the athlete asked for the second page.
   */
  test('narrows the list to a date range and says the range is the end, not the log', async ({
    page,
  }) => {
    const auth = await signInFreshUser(page, 'e2e-history-range');
    const db = await openHistoryDb();
    try {
      await seedSession(db, { userId: auth.userId, localDate: '2026-09-08' });
      await seedSession(db, { userId: auth.userId, localDate: '2026-09-09' });
      await seedSession(db, { userId: auth.userId, localDate: '2026-09-10' });

      await page.goto('/history');
      await expect(page.getByTestId('history-row')).toHaveCount(3);

      await page.getByLabel('From').fill('2026-09-09');
      await page.getByLabel('To').fill('2026-09-10');
      await page.getByRole('button', { name: 'Show range' }).click();

      await expect(page).toHaveURL(/from=2026-09-09/);
      await expect(page).toHaveURL(/to=2026-09-10/);
      await expect(page.getByTestId('history-row')).toHaveCount(2);
      await expect(page.getByTestId('history-day')).toHaveText(['2026-09-10', '2026-09-09']);
      // Both ends inclusive: 2026-09-09 is in the window, which is the off-by-one a half-open
      // range would introduce in a URL that reads as a closed interval. (The count above is the
      // assertion; 2026-09-08 being absent follows from two rows out of three.)

      // The end of a filtered page must not be called the end of the log — the athlete would stop
      // looking for the workouts outside the window they forgot they set.
      await expect(page.getByText('That is the whole range.')).toBeVisible();
      await expect(page.getByText('That is the whole log.')).toHaveCount(0);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('History');
      // The header must stop claiming the page is the whole log, and the form must still show the
      // window it applied — a form that reset itself would look like the range had been ignored.
      await expect(page.locator('main')).not.toContainText('Every session you have logged');
      await expect(page.getByLabel('From')).toHaveValue('2026-09-09');
      await expect(page.getByLabel('To')).toHaveValue('2026-09-10');

      // An empty window is an empty window, not an empty log.
      await page.goto('/history?from=2026-10-01&to=2026-10-31');
      await expect(page.getByTestId('history-empty')).toContainText('No workouts in this range.');
      await expect(page.getByTestId('history-empty')).not.toContainText('No workouts yet');
      await expect(page.getByTestId('history-row')).toHaveCount(0);

      // Clearing returns to the unfiltered log in one click. Two affordances do it on this page —
      // the form's Clear and the empty state's "clear the range" — so the assertion names one
      // exactly rather than matching whichever comes first.
      await page.getByRole('link', { name: 'Clear', exact: true }).click();
      await expect(page).toHaveURL(/\/history$/);
      await expect(page.getByTestId('history-row')).toHaveCount(3);
      await expect(page.getByText('That is the whole log.')).toBeVisible();
    } finally {
      await db.end();
      await auth.cleanup();
    }
  });

  test('keeps the date range on the next-page link instead of widening the walk', async ({ page }) => {
    const auth = await signInFreshUser(page, 'e2e-history-range-cursor');
    const db = await openHistoryDb();
    try {
      for (let day = 1; day <= 21; day += 1) {
        await seedSession(db, {
          userId: auth.userId,
          localDate: `2026-08-${String(day).padStart(2, '0')}`,
        });
      }

      await page.goto('/history?from=2026-08-01&to=2026-08-21');
      await expect(page.getByTestId('history-row')).toHaveCount(20);

      const older = page.getByRole('link', { name: 'Older workouts' });
      const href = await older.getAttribute('href');
      expect(href).toContain('from=2026-08-01');
      expect(href).toContain('to=2026-08-21');
      expect(href).toContain('cursor=');

      await older.click();
      await expect(page.getByTestId('history-row')).toHaveCount(1);
      await expect(page.getByTestId('history-day')).toHaveText('2026-08-01');
      await expect(page.getByRole('link', { name: 'Older workouts' })).toHaveCount(0);
      await expect(page.getByText('That is the whole range.')).toBeVisible();
    } finally {
      await db.end();
      await auth.cleanup();
    }
  });

  test('renders an imported session as recorded without load, and never as a zero', async ({
    page,
  }) => {
    const auth = await signInFreshUser(page, 'e2e-history-noload');
    const db = await openHistoryDb();
    try {
      const sessionId = await seedSession(db, {
        userId: auth.userId,
        localDate: '2026-09-05',
        source: 'legacy_import',
        sets: [
          { weightKg: null, reps: null },
          { weightKg: null, reps: null },
        ],
      });

      await page.goto('/history');
      await expect(page.getByTestId('history-row').first()).toContainText('recorded without load');
      await expect(page.getByTestId('history-row').first()).toContainText('Imported');

      await page.goto(`/history/${sessionId}`);
      await expect(page.getByTestId('no-load-notice')).toBeVisible();

      // The forbidden rendering, checked where it would actually appear. `0 kg` in a weight column
      // reads as a strength collapse, and M2-05 writes NULL precisely because it cannot know what
      // was lifted — so the page must say "nothing recorded" instead of inventing a number.
      const table = page.getByRole('table');
      await expect(table).toHaveCount(1);
      await expect(table).not.toContainText('0 kg');
      await expect(table).not.toContainText('0 lb');
      await expect(table).toContainText('—');
    } finally {
      await db.end();
      await auth.cleanup();
    }
  });

  test('shows a weighted session with the numbers that were logged', async ({ page }) => {
    const auth = await signInFreshUser(page, 'e2e-history-loaded');
    const db = await openHistoryDb();
    try {
      const sessionId = await seedSession(db, {
        userId: auth.userId,
        localDate: '2026-09-06',
        status: 'completed',
        sets: [
          { weightKg: 62.5, reps: 8 },
          { weightKg: 70, reps: 3 },
        ],
      });

      await page.goto(`/history/${sessionId}`);
      const table = page.getByRole('table');
      await expect(table).toContainText('Bench Press');
      await expect(table).toContainText('62.5 kg');
      await expect(table).toContainText('70 kg');
      await expect(page.getByTestId('no-load-notice')).toHaveCount(0);
      // 12:00 → 12:52, from the two instants #64 put on the view, in the same `m:ss` shape the
      // runner prints — one duration formatter for the app rather than a second one that agrees by
      // coincidence. Derived from stored timestamps; nothing on this page counts seconds.
      await expect(page.getByText('52:00', { exact: false })).toBeVisible();
    } finally {
      await db.end();
      await auth.cleanup();
    }
  });

  test('reaches history from the dashboard with the keyboard alone', async ({ page }) => {
    const auth = await signInFreshUser(page, 'e2e-history-keys');
    try {
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();

      let reached = false;
      for (let press = 0; press < 12 && !reached; press += 1) {
        await page.keyboard.press('Tab');
        reached = await page.evaluate(
          () => document.activeElement?.textContent?.trim() === 'History',
        );
      }
      // The loop is bounded and the assertion is on the result, so a page where the link is missing
      // fails here instead of passing by tabbing into nothing forever.
      expect(reached, 'the History link is reachable by Tab from the dashboard').toBe(true);

      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/\/history$/);
      await expect(page.getByRole('heading', { level: 1, name: 'History' })).toBeVisible();
    } finally {
      await auth.cleanup();
    }
  });

  test('says so when there is nothing to show, in the same voice as when there is', async ({
    page,
  }) => {
    const auth = await signInFreshUser(page, 'e2e-history-empty');
    try {
      await page.goto('/history');
      await expect(page.getByTestId('history-empty')).toContainText('No workouts yet');
      await expect(page.getByTestId('history-row')).toHaveCount(0);
      // No pagination affordance on an empty log: a link that leads to the same empty page is a
      // trap, and the difference between "you have no history" and "you are at the end of it" is
      // the difference the two messages exist to keep apart.
      await expect(page.getByRole('link', { name: 'Older workouts' })).toHaveCount(0);
    } finally {
      await auth.cleanup();
    }
  });

  test('has no detectable accessibility violations on the list or on a report', async ({ page }) => {
    const auth = await signInFreshUser(page, 'e2e-history-axe');
    const db = await openHistoryDb();
    try {
      const sessionId = await seedSession(db, {
        userId: auth.userId,
        localDate: '2026-09-07',
        status: 'in_progress',
        phase: 'exercise',
        completedAt: null,
        sets: [{ weightKg: 60, reps: 5 }],
      });

      await page.goto('/history');
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

      // The one row an athlete can least afford to have mislabelled: a session that was started and
      // never finished. `status` alone would call it "not complete" with no hint of where it froze,
      // and the phase is the part that tells them what they are looking at.
      await expect(page.getByTestId('history-row')).toContainText('In progress');

      // Same assertions for the report, which is the page a half-finished workout is most confusing on.
      await page.goto(`/history/${sessionId}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Push Day');
      // Both halves of the truth, in the two places they live: the badge is the status and the
      // sentence is the timestamp. Asserted with `exact: true` because the summary line also
      // contains the phrase, and a test that matched either one would pass on a page that lost the
      // badge entirely.
      await expect(page.getByText('Not finished', { exact: true })).toBeVisible();
      await expect(page.getByText(/· not finished$/)).toBeVisible();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    } finally {
      await db.end();
      await auth.cleanup();
    }
  });
});
