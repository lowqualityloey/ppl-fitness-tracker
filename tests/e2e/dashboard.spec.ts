import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { authHeaders, createTestSession } from '../integration/api/fixtures';
import { openHistoryDb, seedSession } from './history-fixtures';
import { signInFreshUser } from './auth';

/**
 * M3-04 (#61): the dashboard as a user meets it — signed in, keyboard only, and
 * checked against the server rather than against itself.
 *
 * The load-bearing assertion in this file is the last one: after starting a
 * workout in the browser, the session is read back through `GET /api/sessions`
 * with the same cookies. Without it, every passing UI assertion below would only
 * prove that the page is consistent with whatever the page already believed, and a
 * screen that renders a locally-generated id looks exactly like a screen that saved
 * one. This is the rule from intake: a control does not exist until a test proves
 * it runs, and a write does not exist until someone else can see it.
 *
 * Each test signs in as a brand-new user rather than sharing one. The dashboard's
 * whole job is reflecting today's state, and the first test to start a workout
 * would decide what every later test sees — a suite that depends on the order its
 * tests ran in is a suite that starts failing the day someone adds `.only`.
 */
/** Seeded names (`db/seed/exercises.ts:routineDaySeedRows`) — slugs are push/legs/pull. */
const DAY_NAMES = ['Push Day', 'Pull Day', 'Legs Day'];

test.describe('dashboard', () => {
  test('unauthenticated visits are sent to sign-in, not shown a partial dashboard', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  });

  test('lists the seeded days with their plan volume', async ({ page }) => {
    const session = await signInFreshUser(page, 'e2e-days');
    try {
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();

      const cards = page.getByRole('listitem');
      // Order, not count. `listSystemDayPlans` deliberately renders *every* system
      // day, and a fourth one existed in the shared database until this slice
      // (#61) found that `schema-constraints.test.ts` leaked one — so a hard count
      // here would assert a fact about the seed and fail on someone else's test
      // data. The invariant worth protecting is the relative order of the PPL days.
      const order = (await cards.allInnerTexts())
        .map((text) => DAY_NAMES.find((name) => text.includes(name)))
        .filter((name): name is string => name !== undefined);
      expect(order).toEqual(DAY_NAMES);
      expect(order).toHaveLength(3);

      // Volume comes from SQL aggregates, so a card that says "N exercises" has to
      // agree with the seeded library being non-empty. Asserting the shape rather
      // than a number: the counts are the seed's business, and pinning them here
      // would make a content change look like a UI regression.
      await expect(cards.first()).toContainText(/exercises · \d+ sets/);
      await expect(page.getByRole('button', { name: 'Start Push' })).toBeVisible();
    } finally {
      await session.cleanup();
    }
  });

  test('starting a workout is reachable by keyboard and lands on the session', async ({
    page,
    request,
  }) => {
    const session = await signInFreshUser(page, 'e2e-start');
    try {
      await page.goto('/');

      // Tab from the top of the document until a real control is focused, and
      // require that control to be the Start button. The bound is a failure
      // message, not a pass: reaching the primary action of the screen should cost
      // one or two presses, and anything beyond that is a trap or a phantom
      // tabbable element.
      let focused = '';
      for (let press = 0; press < 12; press += 1) {
        await page.keyboard.press('Tab');
        focused = await page.evaluate(() => {
          const el = document.activeElement;
          return el ? `${el.tagName}:${el.textContent ?? ''}`.slice(0, 60) : 'none';
        });
        if (focused.startsWith('BUTTON')) break;
      }
      expect(focused, `first focusable control from the top was ${focused}`).toBe(
        'BUTTON:Start Push Day',
      );

      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/\/session\/[0-9a-f-]{36}/);
      const sessionId = page.url().split('/').pop() ?? '';

      // The session screen is read-only in this slice, so what is provable here is
      // that it renders the day the card named and says so in one place.
      await expect(page.getByRole('heading', { level: 1, name: 'Push Day' })).toBeVisible();
      await expect(page.getByText('In progress')).toBeVisible();
      await expect(page.getByRole('heading', { level: 2, name: 'Strength' })).toBeVisible();

      // Independent verification: the workout exists on the server, for this user,
      // filed under the day the card was clicked.
      const listed = await request.get('/api/sessions', {
        headers: authHeaders(session) as Record<string, string>,
      });
      expect(listed.status()).toBe(200);
      const body = (await listed.json()) as {
        data?: { sessions?: Array<{ id: string; status: string; routineDayId: string }> };
      };
      const rows = body.data?.sessions ?? [];
      const mine = rows.find((row) => row.id === sessionId);
      expect(mine, `session ${sessionId} is not visible to its owner via the API`).toBeDefined();
      expect(mine?.status).toBe('in_progress');

      // And the dashboard now reflects server state instead of the click: no Start
      // button for that day, and the session is linked.
      await page.goto('/');
      await expect(page.getByRole('button', { name: 'Start Push' })).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Resume workout' })).toBeVisible();
      await expect(page.getByText('In progress').first()).toBeVisible();
    } finally {
      await session.cleanup();
    }
  });

  test('a day started in another tab resolves to the server\'s answer, not a second session', async ({
    context,
  }) => {
    // The 409 path in `StartButton` is otherwise unreachable from one page: once a
    // workout exists the server stops rendering the button. Two tabs on the same
    // account reproduce it honestly — the second tab is holding a dashboard render
    // that the first has invalidated, which is the same shape as "started on
    // another device" and as "my response was lost on the way back".
    //
    // What is being asserted is §4.3's rule, applied to a rejection this screen
    // can actually receive: the client does not merge, guess, or create a parallel
    // session. It refetches and renders what the server holds. A second session for
    // the same day would be a data problem no user could undo, so the "exactly one"
    // check below is the point of the test; the visible badge is its symptom.
    const first = await context.newPage();
    const stale = await context.newPage();
    const session = await signInFreshUser(first, 'e2e-race');
    try {
      await stale.goto('/');
      await first.goto('/');

      await first.getByRole('button', { name: 'Start Push Day' }).click();
      await expect(first).toHaveURL(/\/session\/[0-9a-f-]{36}/);

      // `stale` never saw the first tab's navigation, so it still offers Start.
      await stale.getByRole('button', { name: 'Start Push Day' }).click();

      // After the rejected attempt and the refetch it triggers, the stale tab shows
      // the one true session rather than an error state it cannot recover from.
      await expect(stale.getByText('In progress').first()).toBeVisible();
      await expect(stale.getByRole('button', { name: 'Start Push Day' })).toHaveCount(0);

      // And the server agrees there is exactly one workout for that day.
      const listed = await stale.request.get('/api/sessions', {
        headers: authHeaders(session) as Record<string, string>,
      });
      const body = (await listed.json()) as {
        data?: { sessions?: Array<{ status: string; routineDayId: string }> };
      };
      const rows = body.data?.sessions ?? [];
      const open = rows.filter((row) => row.status === 'in_progress');
      expect(open).toHaveLength(1);
    } finally {
      await session.cleanup();
      await stale.close();
      await first.close();
    }
  });

  test('the rendered dashboard has no axe violations', async ({ page }) => {
    const session = await signInFreshUser(page, 'e2e-a11y');
    try {
      await page.goto('/');
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations.map((violation) => violation.id)).toEqual([]);
    } finally {
      await session.cleanup();
    }
  });

  /**
   * M4-19 (#108): a fresh week reads as no training, not as zeros.
   *
   * AC Scenario 2 at the screen level: the honest empty state is a sentence about the
   * log, and a zero-shaped "0 kg this week" would be the legacy fiction in new clothes.
   */
  test('a fresh week reads as no training, not as zeros', async ({ page }) => {
    const session = await signInFreshUser(page, 'e2e-week-empty');
    try {
      await page.goto('/');
      const week = page.getByTestId('training-week');
      await expect(week).toContainText('No training logged in the last 7 days.');
      await expect(week).toContainText('nothing here is estimated');
    } finally {
      await session.cleanup();
    }
  });

  /**
   * M4-19 (#108): seeded rows render as repository-counted volume in the display unit.
   *
   * AC Scenario 1 at the screen level (the row-level proof lives in
   * `tests/integration/repository/workout-repository.test.ts`): 2 × (60 kg × 5) seeded
   * for today renders as the converted `1322.8 lb` under an lbs profile — computation
   * in kg, conversion only at the edge (ADR-0005, AC Scenario 3).
   */
  test('seeded sessions render repository-counted volume in the display unit', async ({
    page,
  }) => {
    const auth = await createTestSession('e2e-week-volume');
    try {
      const db = await openHistoryDb();
      try {
        const today = new Date().toISOString().slice(0, 10);
        await seedSession(db, {
          userId: auth.userId,
          localDate: today,
          status: 'completed',
          sets: [
            { weightKg: 60, reps: 5 },
            { weightKg: 60, reps: 5 },
          ],
        });
        await db.query(`UPDATE profiles SET preferred_unit = 'lbs' WHERE id = $1`, [
          auth.userId,
        ]);
      } finally {
        await db.end();
      }

      await page.goto('/');
      const origin = new URL(page.url()).origin;
      await page.context().addCookies(
        auth.cookies.map((cookie) => ({ name: cookie.name, value: cookie.value, url: origin })),
      );
      await page.goto('/');

      const week = page.getByTestId('training-week');
      await expect(week).toContainText('1322.8 lb');
      await expect(page.getByTestId('training-streak')).toContainText('1-day streak');
    } finally {
      await auth.cleanup();
    }
  });
});
