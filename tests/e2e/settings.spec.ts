import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openHistoryDb, seedSession } from './history-fixtures';
import { signInFreshUser } from './auth';

/**
 * `/settings` (M3-09, #66, task 2 + 4).
 */

test.describe('settings', () => {
  test('first paints in the saved unit and keeps it after a reload', async ({ page }) => {
    const auth = await signInFreshUser(page, 'e2e-settings-unit');
    try {
      await page.goto('/settings');
      // Server-rendered, not fetched: the checked state exists in the first HTML, so a 220 lb
      // lifter's screens never flash kilograms on the way to the right answer.
      await expect(page.getByTestId('unit-kg')).toBeChecked();
      expect(
        await page.evaluate(() => document.querySelectorAll('[data-testid="unit-kg"]').length),
        'the control must be present in the initial document',
      ).toBe(1);

      await page.getByTestId('unit-lbs').check();
      await expect(page.getByTestId('unit-status')).toContainText('pounds');

      await page.reload();
      await expect(page.getByTestId('unit-lbs')).toBeChecked();
    } finally {
      await auth.cleanup();
    }
  });

  test('the unit control is a radio group, not divs with a click handler', async ({ page }) => {
    const auth = await signInFreshUser(page, 'e2e-settings-radio');
    try {
      await page.goto('/settings');
      const radios = page.getByRole('radio');
      await expect(radios).toHaveCount(2);

      // Arrow keys move the selection and the check follows. This is the assertion that fails the
      // moment someone "redesigns" the control out of spans: it looks identical and navigates like
      // nothing.
      await page.getByTestId('unit-kg').focus();
      await page.keyboard.press('ArrowRight');
      await expect(page.getByTestId('unit-lbs')).toBeChecked();
      await expect(page.getByTestId('unit-status')).toContainText('pounds');
    } finally {
      await auth.cleanup();
    }
  });

  test('logs a body measurement server-side and keeps it through a reload (M4-20)', async ({ page }) => {
    const auth = await signInFreshUser(page, 'e2e-settings-measure');
    try {
      await page.goto('/settings');
      // The apology card is gone, and its replacement quotes the audit, not the memory.
      await expect(page.getByText('never written by any code')).toBeVisible();
      await expect(page.getByTestId('measurement-empty')).toBeVisible();

      await page.getByTestId('measurement-value').fill('82.5');
      await page.getByTestId('measurement-submit').click();
      await expect(page.getByTestId('measurement-status')).toContainText('82.5kg saved');
      await expect(page.getByTestId('measurement-row')).toContainText('Body weight');

      // Server-echo (G-3): after reload the row comes back from GET, not from memory.
      await page.reload();
      await expect(page.getByTestId('measurement-row')).toContainText('82.5 kg');

      // A second athlete on the same triple sees their own nothing.
      const auth2 = await signInFreshUser(page, 'e2e-settings-measure-b');
      try {
        await page.goto('/settings');
        await expect(page.getByTestId('measurement-empty')).toBeVisible();
        await expect(page.getByTestId('measurement-row')).toHaveCount(0);
      } finally {
        await auth2.cleanup();
      }
    } finally {
      await auth.cleanup();
    }
  });

  test('signs out for the whole account, not just this tab', async ({ page }) => {
    const auth = await signInFreshUser(page, 'e2e-settings-signout');
    try {
      await page.goto('/settings');
      // Read out loud because it was the bug: the button used to sit on this page and do nothing
      // visible, since the endpoint answers 400 to a bodyless POST. If the guard ever trips again,
      // this line names it instead of leaving a silent failure to chase.
      await expect(page.getByTestId('sign-out-error')).toHaveCount(0);
      await page.getByTestId('sign-out').click();
      await expect(page).toHaveURL(/\/sign-in/);
      // The cookie is really gone: a direct hit on a per-user route redirects rather than rendering
      // a cached shell that then fails.
      await page.goto('/settings');
      await expect(page).toHaveURL(/\/sign-in/);
    } finally {
      await auth.cleanup();
    }
  });

  test('shows weights in the chosen unit across the app', async ({ page }) => {
    const auth = await signInFreshUser(page, 'e2e-settings-across');
    const db = await openHistoryDb();
    try {
      const sessionId = await seedSession(db, {
        userId: auth.userId,
        localDate: '2026-09-04',
        sets: [{ weightKg: 100, reps: 5 }],
      });

      await page.goto('/settings');
      await page.getByTestId('unit-lbs').check();
      await expect(page.getByTestId('unit-status')).toContainText('pounds');

      await page.goto(`/history/${sessionId}`);
      // 100 kg is 220.5 lb at the display precision `UnitDisplay` commits to. The point is not the
      // number, it is that a preference saved on one route reaches a *server-rendered* second route
      // without any client state carrying it.
      await expect(page.getByRole('table')).toContainText('220.5 lb');

      await page.goto('/progress/bench-press');
      await expect(page.getByRole('table')).toContainText('lb');
    } finally {
      await db.end();
      await auth.cleanup();
    }
  });

  test('downloads a versioned archive containing the account\'s real history', async ({ page }) => {
    const auth = await signInFreshUser(page, 'e2e-settings-export');
    const db = await openHistoryDb();
    try {
      const sessionId = await seedSession(db, {
        userId: auth.userId,
        localDate: '2026-09-04',
        sets: [{ weightKg: 100, reps: 5 }],
      });

      await page.goto('/settings');
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByTestId('export-download').click(),
      ]);
      expect(download.suggestedFilename()).toMatch(/^ppl-export-v1-\d{8}\.json$/);
      const stream = await download.createReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
      const archive = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      // Parsed by hand, not through the client's schema import: this asserts
      // the bytes that left the server are the versioned envelope the contract
      // promises, with the seeded session actually inside it. The wire shape is
      // the appSuccess envelope — the archive itself rides under `data`.
      expect(archive.ok).toBe(true);
      expect(archive.data.version).toBe('v1');
      expect(archive.data.user.id).toBe(auth.userId);
      expect(archive.data.sessions.map((s: { id: string }) => s.id)).toContain(sessionId);
      expect(archive.data.truncated).toBe(false);
    } finally {
      await db.end();
      await auth.cleanup();
    }
  });

  test('names the truncation branch honestly instead of shipping a quiet short file', async ({ page }) => {
    const auth = await signInFreshUser(page, 'e2e-settings-export-trunc');
    try {
      // The 201-session user cannot exist inside a test budget on a real
      // server, so the *degradation message* is what this page owns and what
      // it is tested against: a valid-but-truncated v1 payload must render its
      // warning rather than the silent success the FMEA row forbids.
      await page.route('**/api/export/v1', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: {
            version: 'v1',
            exportedAt: '2026-09-16T09:00:00.000Z',
            user: {
              id: auth.userId,
              email: 'trunc@example.com',
              displayName: null,
              joinedAt: '2026-01-01T00:00:00.000Z',
              preferredUnit: 'kg',
            },
            sessions: [],
            personalRecords: [],
            imports: [],
            measurements: [],
            truncated: true,
            oldestExcluded: '2025-01-05',
          },
        }),
      }));
      await page.goto('/settings');
      await page.getByTestId('export-download').click();
      await expect(page.getByTestId('export-truncated')).toContainText('2025-01-05');
      await expect(page.getByTestId('export-error')).toHaveCount(0);
    } finally {
      await auth.cleanup();
    }
  });

  test('has no detectable accessibility violations', async ({ page }) => {
    const auth = await signInFreshUser(page, 'e2e-settings-axe');
    try {
      await page.goto('/settings');
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    } finally {
      await auth.cleanup();
    }
  });
});
