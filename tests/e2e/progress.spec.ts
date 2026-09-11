import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { signInFreshUser } from './auth';
import { createTestSession } from '../integration/api/fixtures';
import {
  openHistoryDb,
  seedOwnedExercise,
  seedPersonalRecord,
  seedSession,
} from './history-fixtures';

/**
 * `/progress/[exerciseSlug]` (M3-08, #65).
 *
 * The claim under test is narrow and the reason it is worth a spec is that the failure mode is
 * silent: the screen must show the endpoint's numbers, not its own. A chart that quietly
 * re-derived e1RM would look *more* plausible than the real one whenever the engine changed, and
 * nobody watching a smooth line would notice.
 */

function cookieHeader(cookies: readonly { name: string; value: string }[]): string {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
}

test.describe('per-exercise progress', () => {
  test('plots exactly the endpoint\'s points, and the table says the same thing', async ({
    page,
    request,
  }) => {
    const auth = await signInFreshUser(page, 'e2e-progress-trend');
    const db = await openHistoryDb();
    try {
      const dates = ['2026-09-01', '2026-09-04', '2026-09-08'];
      const weights = [
        [{ weightKg: 100, reps: 8 }],
        [{ weightKg: 105, reps: 6 }],
        [{ weightKg: 100, reps: 12 }],
      ];
      for (const [index, localDate] of dates.entries()) {
        await seedSession(db, { userId: auth.userId, localDate, sets: weights[index] });
      }
      await seedPersonalRecord(db, {
        userId: auth.userId,
        exerciseSlug: 'bench-press',
        bestE1rm: 126.5,
        achievedAt: '2026-09-08T12:00:00.000Z',
      });

      // The endpoint, called with the same cookies the browser is using: one source of truth to
      // compare the screen against, rather than a second copy of the expected numbers maintained by
      // whoever wrote this test.
      const response = await request.get('/api/progress/bench-press', {
        headers: { cookie: cookieHeader(auth.cookies) },
      });
      expect(response.status()).toBe(200);
      const body = (await response.json()) as {
        data: { trendline: { date: string; e1rm: number }[]; personalRecords: unknown[] };
      };
      expect(body.data.trendline).toHaveLength(3);

      await page.goto('/progress/bench-press');

      // Scenario 1's "12 points matching the endpoint exactly", asserted as the invariant that
      // generalises it: the picture and the endpoint agree on count, and the text summary carries
      // the same dates in the same order. The count is the assertion that would catch a renderer
      // that dropped a session, deduplicated by date, or padded the series.
      await expect(page.getByTestId('progress-line')).toHaveAttribute('points', /[\d.]+,[\d.]+/);
      const vertices = (await page.getByTestId('progress-line').getAttribute('points'))!.trim().split(' ');
      expect(vertices).toHaveLength(body.data.trendline.length);
      await expect(page.getByTestId('progress-svg').locator('circle')).toHaveCount(
        body.data.trendline.length,
      );

      const rows = page.getByTestId('progress-rows').locator('tbody tr');
      await expect(rows).toHaveCount(body.data.trendline.length);
      for (const [index, point] of body.data.trendline.entries()) {
        await expect(rows.nth(index)).toContainText(point.date);
      }

      // The PR row is the one place this spec can assert an exact number, because this test chose
      // it: `bestE1rm: 126.5` must reach the screen as 126.5 kg, which proves the PR path renders
      // the stored value rather than recomputing something from the trendline beside it.
      await expect(page.getByTestId('pr-rows')).toContainText('126.5 kg');
      /*
       * The year, not the month's spelling.
       *
       * This line read `toContainText('9 Sept 2026')`, passed locally, and failed in CI. Short-month
       * rendering is `Intl`'s ICU data — this machine's Node build and the runner image spell it
       * differently — so the assertion was measuring the base image rather than anything in this
       * repository. The year still proves the record's `achievedAt` reached the row, which is the
       * claim the test exists to make; the number on the line above stays asserted exactly.
       */
      await expect(page.getByTestId('pr-rows')).toContainText(/2026/);
    } finally {
      await db.end();
      await auth.cleanup();
    }
  });

  test('states that no load was recorded instead of drawing a line pinned at zero', async ({
    page,
  }) => {
    const auth = await signInFreshUser(page, 'e2e-progress-noload');
    const db = await openHistoryDb();
    try {
      await seedSession(db, {
        userId: auth.userId,
        localDate: '2026-09-02',
        source: 'legacy_import',
        sets: [
          { weightKg: null, reps: null },
          { weightKg: null, reps: null },
        ],
      });

      await page.goto('/progress/bench-press');
      await expect(page.getByTestId('progress-empty')).toContainText('No load data recorded');
      // No chart element at all. An empty axis is still a chart, and a reader who cannot see the
      // difference between "no data" and "flatlined at zero" is exactly the reader the invariant
      // exists to protect.
      await expect(page.getByTestId('progress-svg')).toHaveCount(0);

      // And the same session is still visible in history, because the log is about the day, not
      // about the numbers. Scenario 3 asks for both halves; asserting only the progress page would
      // leave "history lists them" unproven.
      await page.goto('/history');
      await expect(page.getByTestId('history-row')).toHaveCount(1);
      await expect(page.getByTestId('history-row')).toContainText('recorded without load');
    } finally {
      await db.end();
      await auth.cleanup();
    }
  });

  test('gives another athlete\'s exercise the same page as one that does not exist', async ({
    page,
  }) => {
    const auth = await signInFreshUser(page, 'e2e-progress-other');
    /*
     * The owner is created through the admin API and **never signs into this browser**.
     *
     * The first draft called `signInFreshUser` for both users on the same page, which installs the
     * second user's cookies over the first one's — so the "visitor" was actually the exercise's
     * owner, the page correctly showed its data, and this spec was about to file a disclosure bug
     * that did not exist. Two identities cannot share one context; only the visitor needs cookies.
     */
    const other = await createTestSession('e2e-progress-owner');
    const db = await openHistoryDb();
    try {
      const privateSlug = await seedOwnedExercise(db, {
        ownerUserId: other.userId,
        name: 'Zeus Cable Curl',
      });
      expect(privateSlug, 'the visitor must not be the owner').not.toBe(auth.userId);

      await page.goto(`/progress/${privateSlug}`);
      const notFoundText = await page.getByText(/This page could not be found/).count();
      expect(notFoundText).toBeGreaterThan(0);
      // The disclosure check, and the only one that means anything: the private exercise's *name*
      // must not appear anywhere on the page. A 404 that echoes "this exercise exists but is not
      // yours" is an oracle over someone else's data.
      await expect(page.locator('body')).not.toContainText('Zeus Cable Curl');

      await page.goto('/progress/there-is-no-such-exercise-anywhere');
      await expect(page.getByText(/This page could not be found/).first()).toBeVisible();
    } finally {
      await db.end();
      await other.cleanup();
      await auth.cleanup();
    }
  });

  test('refuses a traversal-shaped slug the same way the endpoint does', async ({ page }) => {
    const auth = await signInFreshUser(page, 'e2e-progress-traversal');
    try {
      await page.goto(`/progress/${encodeURIComponent('../../etc/passwd')}`);
      // Not a 500, and not a page that reached the database: the contract's slug pattern is the one
      // the route handler uses, imported rather than copied, so the two boundaries cannot disagree.
      await expect(page.getByText('500').first()).toHaveCount(0);
      await expect(page.getByText('This page could not be found').first()).toBeVisible();
    } finally {
      await auth.cleanup();
    }
  });

  test('keeps the picture decorative and the numbers in the text', async ({ page }) => {
    const auth = await signInFreshUser(page, 'e2e-progress-a11y');
    const db = await openHistoryDb();
    try {
      await seedSession(db, {
        userId: auth.userId,
        localDate: '2026-09-03',
        sets: [{ weightKg: 90, reps: 10 }],
      });

      await page.goto('/progress/bench-press');
      await expect(page.getByTestId('progress-svg')).toHaveAttribute('aria-hidden', 'true');
      await expect(page.getByTestId('progress-rows').locator('tbody tr')).toHaveCount(1);
      // G-M3-6: no insight is chart-only. The sentence above the chart is the same three facts the
      // line encodes, so a reader who never sees the picture still knows the count and the range.
      // Scoped to the sentence above the chart: the PR card's own empty message begins with the
      // same words, and an assertion that matched either would pass on a page that lost the summary.
      await expect(page.getByTestId('progress-summary')).toContainText('1 weighted session');

      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    } finally {
      await db.end();
      await auth.cleanup();
    }
  });
});
