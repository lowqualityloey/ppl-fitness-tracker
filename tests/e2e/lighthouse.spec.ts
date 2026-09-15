import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { chromium, expect, test } from '@playwright/test';
import lighthouse from 'lighthouse';
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
 * Lighthouse runs through its **Node API**, against a Chromium this spec launches and
 * connects to over CDP (#149). Until that change the file shelled out to
 * `npx --no-install lighthouse`, which could never start a browser on a WSL2 dev box:
 * `chrome-launcher`'s WSL branch derives its own temp directory from the *host Windows
 * user found in `PATH`* and overwrites `process.env.TEMP` with it, so every run died at
 * `EACCES: permission denied, mkdir '/mnt/c/Users/<user>/AppData/Local/lighthouse.<n>'`
 * before a page was ever requested — while CI stayed green. Driving the API with a
 * `port` keeps `chrome-launcher` out of the path entirely (it is reachable only from
 * `lighthouse/cli/*`), so the gate now measures the same thing in both places.
 *
 * The dependency guarantee the old `--no-install` flag gave is kept by a stronger
 * means: `lighthouse` is imported from this repo's own `devDependencies`, so a missing
 * install is a module-resolution failure here, not a silent second download.
 *
 * Two honest limitations, recorded rather than hidden:
 *  - Lighthouse needs a Chrome it can drive; it uses the same Chromium Playwright
 *    downloaded, so the two measurements cannot disagree about the browser. The port is
 *    read out of that child's own profile directory, so no other browser can answer.
 *  - A cold production server is slower than a warm one. The score is measured after
 *    a warm-up request so `first-contentful` variance does not decide the result.
 */

interface LighthouseReport {
  categories?: { accessibility?: { score?: number | null } };
  audits?: Record<string, { score?: number | null }>;
  runtimeError?: { message?: string };
  /**
   * The URL the audited document *ended up* at, after any redirect. Carried so an
   * authenticated audit can prove it was never bounced to the sign-in form — see
   * `assertStillAuthenticated`.
   */
  finalDisplayedUrl?: string;
}

/** A Chromium launched by this spec, reachable over the DevTools protocol. */
interface DevToolsBrowser {
  /** The resolved path of the binary that was exec'd, for the same-browser assertion. */
  executablePath: string;
  /** The port Chrome bound, read from `<profile>/DevToolsActivePort`. */
  port: number;
  /** Terminates the child. Safe to call twice. */
  close: () => Promise<void>;
}

/**
 * Ceiling on the whole Lighthouse run, once the browser is up. Inherited verbatim from
 * the `spawnSync` timeout the CLI form carried, so a hung page reports itself as *this*
 * budget expiring rather than as the 240 s test clock running out around it.
 */
const LIGHTHOUSE_AUDIT_BUDGET_MS = 180_000;

/** Ceiling on the browser coming up at all. Chrome binds the debug port in well under a second. */
const DEVTOOLS_PORT_TIMEOUT_MS = 30_000;

/**
 * The libraries Playwright's Chromium needs on a box that has no system browser: a missing
 * one is an unusable tool, not a failing test, and the difference must be legible in the
 * message. `#149`'s sibling defect — this repo does not own a machine's `.so` files, so it
 * owns the diagnosis instead (`PROMPTKIT.md` §3, "Local browser gates").
 */
const MISSING_SYSTEM_LIBS = /error while loading shared libraries|libnspr4|libnss3|libasound/i;

function browserDiedMessage(executablePath: string, status: string, stderr: string): string {
  const lines = [`Playwright's Chromium failed to start (${executablePath}, ${status}).`];
  if (stderr.trim() !== '') lines.push(stderr.trim().split('\n').slice(-6).join('\n'));
  if (MISSING_SYSTEM_LIBS.test(stderr)) {
    lines.push(
      'This box is missing system libraries the browser needs (libnspr4 / libnss3 / libasound).',
      'Where root is available: `npx playwright install --with-deps chromium`.',
      'Where it is not: export LD_LIBRARY_PATH pointing at a copy of them — see PROMPTKIT.md §3.',
      'This is a machine defect, not a change in the app: the same audits run in CI.',
    );
  }
  return lines.join('\n');
}

/**
 * Launch Playwright's own Chromium headless, with the DevTools port left for Chrome to
 * choose (`--remote-debugging-port=0` writes it into the profile this call owns). Reading
 * that file rather than assuming `9222` is what lets the four audits in one run — and,
 * under `fullyParallel`, one run per worker — proceed without a port collision.
 */
async function launchDevToolsChromium(profileDir: string): Promise<DevToolsBrowser> {
  const executablePath = chromium.executablePath();
  const child = spawn(
    executablePath,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      // The two flags chrome-launcher added for CI containers stay: this suite runs where
      // a user namespace may be unavailable (`--no-sandbox`) and where `/dev/shm` is small
      // (`--disable-dev-shm-usage`), and dropping either turns a green gate into a crash.
      '--no-sandbox',
      '--disable-dev-shm-usage',
      // Named explicitly for the same reason the CLI form named it: leaving the profile to
      // a library means trusting whatever temp path that library derives. See `createProfileDir`.
      `--user-data-dir=${profileDir}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );

  // Chrome's diagnostics go to stderr, and the only useful failure mode is the last few
  // lines of it — kept bounded so a chatty launch cannot grow the report.
  let stderr = '';
  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', (chunk: string) => {
    stderr = (stderr + chunk).slice(-4_000);
  });

  const exited = () => child.exitCode !== null || child.signalCode !== null;
  const status = () =>
    child.signalCode !== null ? `signal ${child.signalCode}` : `exit code ${child.exitCode}`;
  const portFile = join(profileDir, 'DevToolsActivePort');
  const deadline = Date.now() + DEVTOOLS_PORT_TIMEOUT_MS;

  for (;;) {
    if (exited()) {
      throw new Error(browserDiedMessage(executablePath, status(), stderr));
    }
    if (existsSync(portFile)) {
      // Line 1 is the port; line 2 is the browser target path, which Lighthouse does not need.
      const declared = readFileSync(portFile, 'utf8').split('\n')[0]?.trim() ?? '';
      const port = Number(declared);
      if (Number.isInteger(port) && port > 0) {
        return {
          executablePath,
          port,
          close: async () => {
            if (exited()) return;
            const stopped = new Promise<void>((done) => child.once('exit', () => done()));
            child.kill('SIGTERM');
            // Headless Chrome exits on SIGTERM; the SIGKILL is only for the case where it
            // does not, and it is what keeps a failed audit from leaking a browser per worker.
            await Promise.race([stopped, new Promise<void>((d) => setTimeout(d, 5_000))]);
            if (!exited()) {
              child.kill('SIGKILL');
              await stopped;
            }
          },
        };
      }
    }
    if (Date.now() > deadline) {
      child.kill('SIGKILL');
      throw new Error(
        `${executablePath} never wrote ${portFile} within ${DEVTOOLS_PORT_TIMEOUT_MS / 1000} s ` +
          `(${exited() ? status() : 'still running'}).${stderr.trim() === '' ? '' : `\n${stderr.trim()}`}`,
      );
    }
    await new Promise((sleep) => setTimeout(sleep, 50));
  }
}

/**
 * One Lighthouse pass over CDP.
 *
 * `onlyCategories: ['accessibility']` replaces `--only-categories=accessibility`, and
 * `extraHeaders` replaces `--extra-headers`: same setting key, same bytes on the wire.
 * The report arrives as `runnerResult.lhr` instead of being parsed out of stdout.
 *
 * @param url The absolute URL to audit.
 * @param browser The Chromium this spec launched.
 * @param cookie A `Cookie` header for an authenticated audit (#65). Lighthouse drives its
 *   own tab, so it cannot borrow a Playwright context's jar; `extraHeaders` is the
 *   supported way in, and the value is the real chunked `sb-…-auth-token` pair the app
 *   wrote — the same bytes `tests/e2e/auth.ts` installs into a browser.
 */
async function runLighthouse(
  url: string,
  browser: DevToolsBrowser,
  cookie?: string,
): Promise<LighthouseReport> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const audit = lighthouse(url, {
    port: browser.port,
    hostname: '127.0.0.1',
    onlyCategories: ['accessibility'],
    logLevel: 'error',
    ...(cookie === undefined ? {} : { extraHeaders: { Cookie: cookie } }),
  });
  try {
    const runnerResult = await Promise.race([
      audit,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `lighthouse exceeded its ${LIGHTHOUSE_AUDIT_BUDGET_MS / 1000} s budget on ${url}`,
              ),
            ),
          LIGHTHOUSE_AUDIT_BUDGET_MS,
        );
      }),
    ]);
    if (!runnerResult) {
      throw new Error(`lighthouse returned no report for ${url} (${browser.port})`);
    }
    return runnerResult.lhr;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    // The rejected-budget path leaves the run in flight; lighthouse disconnects its own
    // tab, and `close()` above terminates the browser, so nothing here has to unwind it.
    void audit.catch(() => undefined);
  }
}

/**
 * A POSIX-absolute profile directory, outside the repository, and proof that it is.
 *
 * Leaving the profile somewhere a library derives from environment is what broke this
 * checkout once: `chrome-launcher` built the name from a **Windows** temp path
 * (`C:\Users\<user>\AppData\Local\lighthouse.<n>`) that reached it from this machine's
 * process environment — not from `.env.local`, not from the shell, and not from
 * `os.tmpdir()`, all of which were checked and are clean — and used it as a *relative*
 * path, so the profile landed **inside the repository** and every subsequent `next build`
 * panicked with `os error 6` reading `SingletonSocket` as a CSS dependency. That failure
 * looked exactly like a code regression and cost a bisect of the working tree to disprove.
 * The launcher bug is gone with `chrome-launcher`; the hazard is an env var whose origin
 * is still unidentified, so the assertion stays rather than being retired with the library.
 */
function createProfileDir(): string {
  const profileDir = mkdtempSync(`${tmpdir()}/lh-profile-`);
  expect(profileDir, 'os.tmpdir() must give an absolute POSIX path').toMatch(/^\//);
  expect(isAbsolute(profileDir), `profile dir is not absolute: ${profileDir}`).toBe(true);
  expect(
    profileDir.startsWith(`${repoRoot()}/`),
    `lighthouse profile would be created inside the repository: ${profileDir}`,
  ).toBe(false);
  return profileDir;
}

function repoRoot(): string {
  return new URL('../../', import.meta.url).pathname;
}

/**
 * The audits below ask about a *screen*, and a screen behind auth answers two ways: with
 * itself when the session is present, and with the sign-in form when it is not. Both score.
 * Only one of them is the measurement.
 *
 * This is the failure mode the first test in this file documents — the day `/` became
 * per-user, Lighthouse quietly audited `/sign-in` under the label "score for /" — applied
 * to the cookie transport: `--extra-headers` became `extraHeaders`, and if the rename had
 * silently dropped the session, three audits would have started scoring the sign-in form.
 */
function assertStillAuthenticated(report: LighthouseReport, path: string): void {
  const reached = report.finalDisplayedUrl === undefined
    ? undefined
    : new URL(report.finalDisplayedUrl).pathname;
  expect(reached, `expected the audit to stay on ${path}, not be redirected out of it`).toBe(path);
}

/*
 * A Lighthouse audit costs a cold Chrome plus a full page load, so it needs a clock an order of magnitude
 * above the suite's default. It is named once because a `describe`-scoped `setTimeout` does **not** apply
 * to tests declared outside that describe: the two whole-page audits at the bottom of this file run on
 * Playwright's 30 s default while their siblings were given 240 s. Measured on a quiet box they take 12.3 s
 * and 13.4 s, i.e. 41-45 % of the clock they actually have, which is a red that appears the moment Chrome
 * is competing for the same four cores. Same class as #100's other clock findings, different cause: here it
 * is scoping, not arithmetic.
 */
const LIGHTHOUSE_RUN_TIMEOUT_MS = 240_000;

test.describe('Lighthouse accessibility', () => {
  test.setTimeout(LIGHTHOUSE_RUN_TIMEOUT_MS);
  /**
   * Paths an unauthenticated visit to `/` may resolve to. `#/` is here because it is
   * the intent of #61's screen for a signed-in visitor and belongs in this list the
   * moment an authenticated audit exists — which needs a real session on the request
   * and is deliberately left to #67, not faked by pointing the gate at a page that
   * happens to answer.
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

    const profileDir = createProfileDir();
    const before = new Set(readdirSync(repoRoot()));

    let report: LighthouseReport;
    try {
      const browser = await launchDevToolsChromium(profileDir);
      try {
        // The same binary the axe run launches, compared as a resolved path rather than a
        // version string: two browsers that report the same version can still disagree.
        expect(
          realpathSync(browser.executablePath),
          'Lighthouse must be driven by the Chromium Playwright downloads',
        ).toBe(realpathSync(chromium.executablePath()));
        report = await runLighthouse(target, browser);
      } finally {
        await browser.close();
      }
    } finally {
      rmSync(profileDir, { recursive: true, force: true });
      // Tripwire for the pollution described above: if anything appears at the repo
      // root during this run, fail here instead of letting the next `next build`
      // panic and send someone hunting for a code regression that is not there.
      const leaked = readdirSync(repoRoot()).filter((entry) => !before.has(entry));
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

      const profileDir = createProfileDir();
      let report: LighthouseReport;
      try {
        const browser = await launchDevToolsChromium(profileDir);
        try {
          report = await runLighthouse(
            'http://localhost:3001/history',
            browser,
            auth.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; '),
          );
        } finally {
          await browser.close();
        }
      } finally {
        rmSync(profileDir, { recursive: true, force: true });
      }

      expect(report.runtimeError?.message ?? '', 'lighthouse runtime error').toBe('');
      assertStillAuthenticated(report, '/history');
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
  test.setTimeout(LIGHTHOUSE_RUN_TIMEOUT_MS);
  const auth = await createTestSession('lh-dashboard');
  const db = await openHistoryDb();
  try {
    // A day plan on deck, so the dashboard renders its real cards rather than an empty state.
    await seedSession(db, { userId: auth.userId, localDate: '2026-09-10' });
    const profileDir = createProfileDir();
    let report: LighthouseReport;
    try {
      const browser = await launchDevToolsChromium(profileDir);
      try {
        report = await runLighthouse(
          'http://localhost:3001/',
          browser,
          auth.cookies.map((c) => `${c.name}=${c.value}`).join('; '),
        );
      } finally {
        await browser.close();
      }
    } finally {
      rmSync(profileDir, { recursive: true, force: true });
    }
    expect(report.runtimeError?.message ?? '', 'lighthouse runtime error').toBe('');
    assertStillAuthenticated(report, '/');
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
  test.setTimeout(LIGHTHOUSE_RUN_TIMEOUT_MS);
  const auth = await createTestSession('lh-session');
  const db = await openHistoryDb();
  try {
    const sessionId = await seedSession(db, {
      userId: auth.userId,
      localDate: '2026-09-10',
      sets: [{ weightKg: 80, reps: 5 }, { weightKg: 80, reps: 6 }],
    });
    const profileDir = createProfileDir();
    let report: LighthouseReport;
    try {
      const browser = await launchDevToolsChromium(profileDir);
      try {
        report = await runLighthouse(
          `http://localhost:3001/session/${sessionId}`,
          browser,
          auth.cookies.map((c) => `${c.name}=${c.value}`).join('; '),
        );
      } finally {
        await browser.close();
      }
    } finally {
      rmSync(profileDir, { recursive: true, force: true });
    }
    expect(report.runtimeError?.message ?? '', 'lighthouse runtime error').toBe('');
    assertStillAuthenticated(report, `/session/${sessionId}`);
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
