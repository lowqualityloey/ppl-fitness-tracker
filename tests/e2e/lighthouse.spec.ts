import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { chromium, expect, test } from '@playwright/test';
import { createTestSession } from '../integration/api/fixtures';
import { openHistoryDb, seedSession } from './history-fixtures';

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

function runLighthouse(
  url: string,
  profileDir: string,
  /**
   * A `Cookie` header for an authenticated audit (#65). Lighthouse drives its own browser instance,
   * so it cannot borrow a Playwright context's jar; `--extra-headers` is the supported way in, and
   * the value is the real chunked `sb-…-auth-token` pair the app wrote — the same bytes
   * `tests/e2e/auth.ts` installs into a browser.
   */
  cookie?: string,
): LighthouseReport {
  const run = spawnSync(
    'npx',
    [
      '--no-install',
      'lighthouse',
      url,
      '--only-categories=accessibility',
      ...(cookie ? [`--extra-headers=${JSON.stringify({ Cookie: cookie })}`] : []),
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
  /**
   * Paths an unauthenticated visit to `/` may resolve to. `#/` is here because it is
   * the intent of #61's screen for a signed-in visitor and belongs in this list the
   * moment an authenticated audit exists — which needs `--extra-headers` with a real
   * session and is deliberately left to #67, not faked by pointing the gate at a
   * page that happens to answer.
   */
  const ENTRY_ALLOWLIST = ['/', '/sign-in'];

  test('produces an accessibility score for the unauthenticated entry point', async ({
    page,
  }) => {
    // Resolve where the entry point actually takes an unauthenticated visitor, and
    // audit *that*, under that label.
    //
    // This spec was written when `/` was a page. M3-04 (#61) made `/` a per-user
    // screen, so an unauthenticated request is now served a redirect to `/sign-in`
    // and Lighthouse audited the sign-in form while the test line said "score for
    // /" — a true number attached to the wrong subject. Asserting the resolved
    // pathname against a small allow-list is what keeps that from recurring: if the
    // entry point ever moves again, this spec says so in its own words instead of
    // quietly changing what it measures.
    await page.goto('http://localhost:3001/');
    const target = page.url();
    const pathname = new URL(target).pathname;
    expect(ENTRY_ALLOWLIST, `unauthenticated / resolved to ${pathname}, which this spec has not been ` +
      `reviewed against; update the allow-list deliberately, with the measurement re-recorded`).toContain(pathname);

    const profileDir = mkdtempSync(`${tmpdir()}/lh-profile-`);
    const repoRoot = new URL('../../', import.meta.url).pathname;
    const before = new Set(readdirSync(repoRoot));

    let report: LighthouseReport;
    try {
      report = runLighthouse(target, profileDir);
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
    console.info(
      `[measurement] lighthouse accessibility score for ${pathname} (reached from /): ${score}`,
    );
    const failedAudits = Object.entries(report.audits ?? {})
      .filter(([, audit]) => audit.score !== null && audit.score !== undefined && audit.score < 0.9)
      .map(([id]) => id);

    test.info().annotations.push({
      type: 'measurement',
      description: `lighthouse accessibility score for ${pathname} (reached from /): ${score}; audits below 0.9: ${failedAudits.join(', ') || 'none'}`,
    });

    // Floor, not target. Measured **100** on 2026-09-11 — for `/sign-in`, reached
    // from `/` (the score was recorded against the placeholder `/` when this gate was
    // written, and the same value reproduced after #61 made `/` per-user).
    // Demanding 100 here would assert nothing, because there is almost no markup on
    // this page to get wrong — the card for this slice says 100 is M3-04's problem
    // and this slice only has to make the question answerable. 90 is set below the
    // measurement on purpose: it fails if a real regression arrives, without
    // pretending to be the milestone's exit criterion. M3-10 raises it.
    expect(
      score,
      `lighthouse accessibility score for ${pathname} (measured 100 on 2026-09-11)`,
    ).toBeGreaterThanOrEqual(90);
    if (failedAudits.length > 0) {
      console.info(`[measurement] lighthouse audits below 0.9 on /: ${failedAudits.join(', ')}`);
    }
  });

  /**
   * The authenticated audit #60 deferred, now that there is a screen worth scoring.
   *
   * `/history` is the first route where a 100 means something: it renders a list built from real
   * rows, with headings, links, badges, and a pagination control — markup that can be wrong in the
   * ways axe does not fully cover (an `aria-hidden` container with a focusable child, a heading
   * level that skips, a link whose accessible name is its href). #65's task 4 asks for exactly this
   * number, and the harness's own note said to build it "not faked by pointing the gate at a page
   * that happens to answer", so the request carries a real session cookie and the page is seeded
   * with real history rather than an empty state.
   */
  test('scores 100 on the authenticated history screen', async () => {
    const auth = await createTestSession('lh-history');
    const db = await openHistoryDb();
    try {
      for (const localDate of ['2026-09-08', '2026-09-09', '2026-09-10']) {
        await seedSession(db, { userId: auth.userId, localDate });
      }

      const profileDir = mkdtempSync(`${tmpdir()}/lh-profile-`);
      let report: LighthouseReport;
      try {
        report = runLighthouse(
          'http://localhost:3001/history',
          profileDir,
          auth.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; '),
        );
      } finally {
        rmSync(profileDir, { recursive: true, force: true });
      }

      expect(report.runtimeError?.message ?? '', 'lighthouse runtime error').toBe('');
      const score = Math.round((report.categories?.accessibility?.score ?? -1) * 100);
      const failedAudits = Object.entries(report.audits ?? {})
        .filter(([, audit]) => audit.score !== null && audit.score !== undefined && audit.score < 0.9)
        .map(([id]) => id);

      console.info(`[measurement] lighthouse accessibility score for /history: ${score}`);
      test.info().annotations.push({
        type: 'measurement',
        description: `lighthouse accessibility score for /history (authenticated, 3 seeded sessions): ${score}`,
      });

      // Asserted at 100, not floored: this is the route the card names, it has real content to get
      // wrong, and a floor here would be the placeholder-era reasoning carried over into a screen
      // that has outgrown it. If a future regression lands, `failedAudits` says which one.
      expect(score, `audits below 0.9: ${failedAudits.join(', ') || 'none'}`).toBe(100);
    } finally {
      await db.end();
      await auth.cleanup();
    }
  });
});

/**
 * G-M3-5 names three routes: `/`, `/session/[id]`, `/history`. Two of them were scored, which is a
 * gate over 2/3 of its own claim. Both additions assert 100 outright — the pattern was established
 * with `/history`, so "we could not get 100" is not available as an excuse here.
 */
test('scores 100 on the authenticated dashboard', async () => {
  const auth = await createTestSession('lh-dashboard');
  const db = await openHistoryDb();
  try {
    // A day plan on deck, so the dashboard renders its real cards rather than an empty state.
    await seedSession(db, { userId: auth.userId, localDate: '2026-09-10' });
    const profileDir = mkdtempSync(`${tmpdir()}/lh-profile-`);
    let report: LighthouseReport;
    try {
      report = runLighthouse(
        'http://localhost:3001/',
        profileDir,
        auth.cookies.map((c) => `${c.name}=${c.value}`).join('; '),
      );
    } finally {
      rmSync(profileDir, { recursive: true, force: true });
    }
    expect(report.runtimeError?.message ?? '', 'lighthouse runtime error').toBe('');
    const score = Math.round((report.categories?.accessibility?.score ?? -1) * 100);
    const failures = Object.entries(report.audits ?? {})
      .filter(([, audit]) => typeof audit.score === 'number' && audit.score < 1)
      .map(([id, audit]) => `${id}=${audit.score}`);
    console.log(`[lighthouse /] score=${score} failingAudits=[${failures.join(', ')}]`);
    expect(score, `dashboard scored ${score}; failing audits: ${failures.join(', ') || 'none named'}`).toBe(100);
  } finally {
    await db.end();
    await auth.cleanup();
  }
});

test('scores 100 on a session runner', async () => {
  const auth = await createTestSession('lh-session');
  const db = await openHistoryDb();
  try {
    const sessionId = await seedSession(db, {
      userId: auth.userId,
      localDate: '2026-09-10',
      sets: [{ weightKg: 80, reps: 5 }, { weightKg: 80, reps: 6 }],
    });
    const profileDir = mkdtempSync(`${tmpdir()}/lh-profile-`);
    let report: LighthouseReport;
    try {
      report = runLighthouse(
        `http://localhost:3001/session/${sessionId}`,
        profileDir,
        auth.cookies.map((c) => `${c.name}=${c.value}`).join('; '),
      );
    } finally {
      rmSync(profileDir, { recursive: true, force: true });
    }
    expect(report.runtimeError?.message ?? '', 'lighthouse runtime error').toBe('');
    const score = Math.round((report.categories?.accessibility?.score ?? -1) * 100);
    const failures = Object.entries(report.audits ?? {})
      .filter(([, audit]) => typeof audit.score === 'number' && audit.score < 1)
      .map(([id, audit]) => `${id}=${audit.score}`);
    console.log(`[lighthouse /session] score=${score} failingAudits=[${failures.join(', ')}]`);
    expect(score, `session runner scored ${score}; failing audits: ${failures.join(', ') || 'none named'}`).toBe(100);
  } finally {
    await db.end();
    await auth.cleanup();
  }
});
