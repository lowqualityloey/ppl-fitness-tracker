import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { createTestSession } from '../integration/api/fixtures.js';
import {
  firstTick,
  LEGACY_LOCALSTORAGE_KEYS,
  startPushDay,
  warmUpAndStart,
} from './runner-fixtures';

/**
 * Legacy parity (M3-10, #67): M3 runs *beside* the old app, it does not replace it.
 *
 * Two separate claims, because they fail differently:
 *
 * 1. **The four legacy modules are untouched.** A static check on git — no test in the browser can
 *    prove a file nobody loaded hasn't been edited.
 * 2. **The new app never writes a legacy `localStorage` key.** Only observable by actually using the
 *    app and reading storage afterwards.
 *
 * The reason both exist: M3-09 imports *from* this storage and deliberately deletes nothing, and M4
 * owns decommissioning. If the new app ever wrote `pushWorkoutProgress`, an athlete who imports and
 * then opens the old dashboard would find their legacy history overwritten by the app that promised
 * not to touch it — and the overwrite would be invisible, because the new UI never reads those keys
 * back.
 */

const LEGACY_MODULES = [
  'push-day-workout',
  'pull-day-workout',
  'legs-day-workout',
  'ppl-workout-dashboard',
] as const;

test('the four legacy modules are untouched on this branch', () => {
  const changed = execFileSync('git', ['diff', '--name-only', 'origin/main...HEAD', '--', ...LEGACY_MODULES], {
    encoding: 'utf8',
  }).trim();
  expect(changed, `M3 must not modify legacy sources:\n${changed}`).toBe('');
});

test('the legacy modules still own their storage keys (we did not neuter them)', () => {
  // The complement of the checks below: proving the new app writes nothing is worthless if the old
  // app was also made to stop writing. Decommissioning is M4's decision to make, not a side effect.
  // Enumerated from git rather than guessed by filename: the four modules do not share a layout
  // (`ppl-workout-dashboard` is not structured like the three day apps), and a hardcoded list of
  // names silently scans nothing in the directory it forgot — which reads as "the key is gone".
  const sources = LEGACY_MODULES.flatMap((dir) =>
    execFileSync('git', ['ls-files', '--', `${dir}/*.js`, `${dir}/*.html`], { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean),
  )
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
  for (const key of LEGACY_LOCALSTORAGE_KEYS) {
    expect(sources, `${key} is no longer referenced by any legacy module`).toContain(key);
  }
});

test('using the new app end to end writes none of the five legacy keys', async ({ page }) => {
  const auth = await createTestSession('e2e-legacy-parity');
  try {
    await page.goto('/');
    await page.context().addCookies(
      auth.cookies.map((c) => ({ name: c.name, value: c.value, url: new URL(page.url()).origin })),
    );

    // Exercise the surfaces that plausibly *would* write them: the dashboard, a live session with a
    // logged set (the legacy app stored exactly this), history, and settings including the import
    // panel — the one screen that reads this storage and comes closest to writing it.
    await startPushDay(page);
    await warmUpAndStart(page);
    await firstTick(page).click();
    for (const path of ['/', '/history', '/settings']) await page.goto(path);

    const stored = await page.evaluate(() => Object.keys(window.localStorage));
    const written = stored.filter((key) => LEGACY_LOCALSTORAGE_KEYS.includes(key));
    expect(written, `the new app wrote legacy keys: ${written.join(', ')}`).toEqual([]);
  } finally {
    await auth.cleanup();
  }
});
