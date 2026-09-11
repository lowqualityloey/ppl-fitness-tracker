import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { chromium, expect, test } from '@playwright/test';

/**
 * M3-03 (#60), task item 3: make the Lighthouse accessibility score **measurable**
 * on `/`, and only that.
 *
 * `docs/specs/2026-09-08-spec-fullstack-migration.md` §3 promises Lighthouse 100 on
 * the app routes, and the floor has never been produced — there was no way to ask
 * the question. This spec asks it. The score-100 assertion is M3-04/M3-10's job,
 * because there is no real screen to score yet: today's `/` is a placeholder page,
 * and demanding 100 from it would be a gate over nothing (the exact shape D7 took).
 *
 * The CLI is invoked with `--no-install` so a missing dependency fails loudly here
 * instead of silently downloading a second Lighthouse into CI.
 *
 * Two honest limitations, recorded rather than hidden:
 *  - Lighthouse needs a Chrome it can launch; it uses the same Chromium Playwright
 *    downloaded, so the two measurements cannot disagree about the browser.
 *  - A cold production server is slower than a warm one. The score is measured after
 *    a warm-up request so `first-contentful` variance does not decide the result.
 */

interface LighthouseReport {
  categories?: { accessibility?: { score?: number } };
  audits?: Record<string, { score?: number | null }>;
  runtimeError?: { message?: string };
}

function runLighthouse(url: string, profileDir: string): LighthouseReport {
  const run = spawnSync(
    'npx',
    [
      '--no-install',
      'lighthouse',
      url,
      '--only-categories=accessibility',
      '--output=json',
      '--quiet',
      // An explicit profile directory, because leaving it to chrome-launcher is what
      // broke this checkout: it named the profile from a **Windows** temp path
      // (`C:\Users\<user>\AppData\Local\lighthouse.<n>`) that reached it from
      // somewhere in this machine's process environment — not from `.env.local`, not
      // from the shell, and not from `os.tmpdir()`, all of which were checked and are
      // clean. chrome-launcher used that string as a *relative* path, so the profile
      // landed **inside the repository**, and every subsequent `next build` panicked
      // with `os error 6` while reading `SingletonSocket` as a CSS dependency — a
      // failure that looked exactly like a code regression and cost a bisect of the
      // working tree to disprove. The origin of the env value is still unidentified,
      // so the mitigation removes the dependency instead of waiting for it.
      `--chrome-flags=--headless=new --no-sandbox --disable-dev-shm-usage --user-data-dir=${profileDir}`,
    ],
    {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      timeout: 180_000,
      // CHROME_PATH rather than auto-detection: Lighthouse searches for an installed
      // Google Chrome, and a CI runner (and this dev box) has none — only the
      // Chromium Playwright downloaded. Pointing both suites at the same binary also
      // means the axe run and the Lighthouse run cannot disagree about the browser.
      env: {
        ...process.env,
        CHROME_PATH: chromium.executablePath(),
        // Chrome's user-data directory name is derived from TMPDIR/TEMP/TMP. On this
        // machine one of those has been observed to carry a **Windows** path
        // (`C:\Users\...`), which chrome-launcher used verbatim as a *relative*
        // directory name — so the profile was created **inside the repository**, and
        // the next `next build` panicked trying to read `SingletonSocket` out of it as
        // a CSS dependency (os error 6). That build failure was indistinguishable from
        // a code regression and cost a bisect to identify. Forcing a POSIX-absolute
        // temp dir for this child makes the suite incapable of repeating it.
        TMPDIR: '/tmp',
        TEMP: '/tmp',
        TMP: '/tmp',
      },
    },
  );

  expect(run.status, `lighthouse exited ${run.status}: ${(run.stderr ?? '').slice(-400)}`).toBe(0);
  return JSON.parse(run.stdout) as LighthouseReport;
}

test.describe('Lighthouse accessibility', () => {
  test.setTimeout(240_000);

  test('produces an accessibility score for /', async ({ request }) => {
    // Warm the server: `webServer` has already built and started it, but the first
    // request pays for route compilation of nothing (prod) and TLS-free init paths.
    await request.get('/');

    const profileDir = mkdtempSync(`${tmpdir()}/lh-profile-`);
    const repoRoot = new URL('../../', import.meta.url).pathname;
    const before = new Set(readdirSync(repoRoot));

    let report: LighthouseReport;
    try {
      report = runLighthouse('http://localhost:3001/', profileDir);
    } finally {
      rmSync(profileDir, { recursive: true, force: true });
      // Tripwire for the pollution described above: if anything appears at the repo
      // root during this run, fail here instead of letting the next `next build`
      // panic and send someone hunting for a code regression that is not there.
      const leaked = readdirSync(repoRoot).filter((entry) => !before.has(entry));
      expect(leaked, 'lighthouse must not write into the repository').toEqual([]);
    }
    expect(report.runtimeError?.message ?? '', 'lighthouse runtime error').toBe('');

    const score = Math.round((report.categories?.accessibility?.score ?? -1) * 100);
    console.info(`[measurement] lighthouse accessibility score for /: ${score}`);
    const failedAudits = Object.entries(report.audits ?? {})
      .filter(([, audit]) => audit.score !== null && audit.score !== undefined && audit.score < 0.9)
      .map(([id]) => id);

    test.info().annotations.push({
      type: 'measurement',
      description: `lighthouse accessibility score for /: ${score}; audits below 0.9: ${failedAudits.join(', ') || 'none'}`,
    });

    // Floor, not target. Measured **100** on 2026-09-11 for the placeholder `/`.
    // Demanding 100 here would assert nothing, because there is almost no markup on
    // this page to get wrong — the card for this slice says 100 is M3-04's problem
    // and this slice only has to make the question answerable. 90 is set below the
    // measurement on purpose: it fails if a real regression arrives, without
    // pretending to be the milestone's exit criterion. M3-10 raises it.
    expect(score, `lighthouse accessibility score for / (measured 100 on 2026-09-11)`).toBeGreaterThanOrEqual(90);
    if (failedAudits.length > 0) {
      console.info(`[measurement] lighthouse audits below 0.9 on /: ${failedAudits.join(', ')}`);
    }
  });
});
