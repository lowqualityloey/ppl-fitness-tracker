import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { createTestSession } from '../integration/api/fixtures.js';
import {
  firstTick,
  LEGACY_LOCALSTORAGE_KEYS,
  startPushDay,
  warmUpAndStart,
} from './runner-fixtures';

/**
 * Legacy parity (M3-10 #67; **inverted by M4-14 #103, 2026-09-16**).
 *
 * M3 ran *beside* the old vanilla-JS app, so the original file asserted the estate was
 * untouched and its storage keys still owned by its own sources (audit entry 3; the
 * complement check that made "we never wrote them" worth something). #103 deleted the
 * estate — four legacy modules plus the root `index.html`, `vite.config.js`, the two
 * fictional day-folder READMEs and `SECURITY_IMPROVEMENTS.md` — after #109 shipped the
 * replacement model and the F-1 sweep proved nothing stranded (`userStats` had zero
 * writers estate-wide: `docs/design/2026-09-16-m4-20-body-measurements.md` §2).
 *
 * The guard survives its purpose by inverting rather than being deleted, per the card:
 *
 * 1. **The estate stays gone.** A tracked file reappearing under a deleted path is red —
 *    resurrection needs an owner decision, not a `git checkout`.
 * 2. **Nothing writes the five keys, and no second service worker registers.** The estate
 *    was the only writer; the `pull-day-workout/app.js` `/sw.js` registration was a phantom
 *    (#111 found no `sw.js` ever existed beside the legacy server). The *real* `public/sw.js`
 *    is registered from exactly one allow-listed file, so this scan cannot match it.
 * 3. **The running app still writes none of the keys** — unchanged from M3, still the only
 *    claim here that can be checked by watching the browser rather than the index.
 *
 * The key *names* deliberately survive in `lib/domain/import/` and `src/app/settings/`:
 * the import seam reads whatever a user's browser still holds from the pre-deletion world
 * and deletes nothing. That read is the retirement plan for the namespace, so excluding
 * `tests/` (which fabricates legacy payloads on purpose) and scoping test 2 to writers —
 * `setItem`, not `getItem` — is the whole of the "no live reference" claim.
 */

/** Every path M4-14 deleted. A tracked entry reappearing here is red by design. */
const LEGACY_ESTATE_PATHS = [
  'index.html',
  'vite.config.js',
  'SECURITY_IMPROVEMENTS.md',
  'push-day-workout',
  'pull-day-workout',
  'legs-day-workout',
  'ppl-workout-dashboard',
] as const;

/** The only file permitted to register a service worker (outside tests). */
const SW_REGISTRATION_ALLOWLIST = ['src/components/shell-registration.tsx'] as const;

function git(...args: string[]): string {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch (error) {
    // `git grep` exits 1 on a clean tree — no match is the pass condition here, not an error.
    // Any *other* status (128 = invalid regex, bad repo) must never read as "clean", or a
    // broken scan passes vacuously — the exact false-green shape this suite exists to refuse.
    const status = (error as { status?: number }).status;
    if (status === 1 && args[0] === 'grep') return '';
    throw error;
  }
}

test('the legacy estate is deleted — a reappearing file is red', () => {
  const tracked = git('ls-files', '--', ...LEGACY_ESTATE_PATHS);
  expect(
    tracked,
    `M4-14 deleted the legacy estate; these tracked files must not exist:\n${tracked}`,
  ).toBe('');
});

test('nothing writes the five legacy keys, and no legacy /sw.js registration survives', () => {
  const writerPattern = `setItem\\(\\s*['"](${LEGACY_LOCALSTORAGE_KEYS.join('|')})['"]`;
  const writers = git(
    'grep',
    '-l',
    '-E',
    writerPattern,
    '--',
    '.',
    ':(exclude)tests/**',
    ':(exclude)docs/**',
  );
  expect(
    writers,
    `the estate was the only writer of these keys; nothing outside tests may write them:\n${writers}`,
  ).toBe('');

  const registrations = git(
    'grep',
    '-l',
    'navigator.serviceWorker',
    '--',
    '.',
    ':(exclude)tests/**',
    ':(exclude)docs/**',
  )
    .split('\n')
    .filter(Boolean);
  const unexpected = registrations.filter((f) => !SW_REGISTRATION_ALLOWLIST.includes(f as never));
  expect(
    unexpected,
    `only ${SW_REGISTRATION_ALLOWLIST.join(', ')} may register the shell service worker:\n${unexpected.join('\n')}`,
  ).toEqual([]);
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
