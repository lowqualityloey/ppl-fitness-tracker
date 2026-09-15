> **M4-25** · Local verification tooling · `#priority/p2` · Derived from: a machine defect hit while
> implementing **M4-24 (#142)**, whose AC-6 demands "G-M3-5's Lighthouse 100 on `/sign-in` is still
> green". Filed at the owner's ruling on 2026-09-15 — *file a card, keep that PR clean* — so this is
> that card, and #142 is its evidence.

## Intent

`tests/e2e/lighthouse.spec.ts` is the repo's only accessibility-score gate, and **it cannot run on this
dev box.** That costs more than time: G-M3-5 is the goal a change to `/sign-in`, the dashboard, the
runner or history is supposed to be checked against *before* a PR opens, and today the first honest
look at it happens in CI — which means the fix for a score regression arrives after the review that
could have prevented it. The gate works (CI is green with it), so this card is not about the score. It
is about making one already-written gate reproducible where the app is developed.

## What the record says (measured 2026-09-15 at `52daf0c`, the CSP commit)

- **All four audits fail identically, before any page load.** `npx playwright test lighthouse.spec.ts`
  → 4 failed, each with `lighthouse exited 1` and a `chrome-launcher` stack:
  `Runtime error encountered: EACCES: permission denied, mkdir
  '/mnt/c/Users/<windows-user>/AppData/Local/lighthouse.72266417'` at `makeWin32TmpDir` ←
  `makeTmpDir` (`node_modules/chrome-launcher/dist/utils.js:66`) ← `Launcher.prepare` ← `Launcher.launch`
  ← `getDebuggableChrome` (`lighthouse/cli/run.js:85`). No Chromium process ever started, so **nothing in
  this failure says anything about the app** — the same four audits are green in CI, unchanged, on the
  same commit.
- **Why the spec's existing hardening cannot fix it.** `runLighthouse` already passes
  `TMPDIR/TEMP/TMP = '/tmp'` (its comment names the Windows-path-profile incident) and an explicit
  `--user-data-dir=${profileDir}`. Neither reaches the bug: `getPlatform()` returns `'wsl'` because
  `is-wsl` only asks whether `os.release()` contains *microsoft*, and the `wsl` branch of `makeTmpDir()`
  **overwrites `process.env.TEMP`** with `getWSLLocalAppDataPath(process.env.PATH)` before
  `makeWin32TmpDir()` reads it. The temp directory chrome-launcher wants is derived from the *host
  Windows user found in `PATH`*, not from anything the child process sets.
- **The tempting "fix" is a trap, and this repo has already paid for it once.** Delete the `/mnt/c/…`
  entry from `PATH` and the regex returns `[]`, so the fallback builds
  `/mnt/undefined/Users/undefined/AppData/Local` — which is precisely the litter STATE §8's
  2026-09-14 `pk:onboard` row records finding and deleting (`undefined:/Users/undefined/AppData/Local`,
  "a Windows path template built from unset env vars"). Scrubbing `PATH` therefore trades one broken
  run for filesystem pollution **inside the repository**, in a checkout whose next `next build` would
  read it as CSS. Named so nobody re-invents it.
- **The workaround that produced #142's AC-6 number, in one sentence:** point Lighthouse at a browser
  that is *already running*. `chromium --headless=new --remote-debugging-port=9222` (the same
  `chromium-1243/chrome-linux64/chrome` Playwright downloads) + the Node API
  `lighthouse(url, { port: 9222, onlyCategories: ['accessibility'] })` returned
  **accessibility 100, audits below 0.9: none** on `/sign-in` against the production server — never
  touching `chrome-launcher`, so the WSL branch never runs. The scratch driver lived in `/tmp` and is
  not in the repo; this card is where it belongs.

## Scope

Replace the CLI-spawn mechanism, keep every assertion.

| | Change | Why this shape |
| :--- | :--- | :--- |
| **Primary** | `runLighthouse()` calls Lighthouse's **Node API** with `{ port }` against a browser this spec launches itself (Playwright's own `chromium.launch({ headless: true })`, or a `spawn` of `chromium.executablePath()` with `--remote-debugging-port=0` + `DevToolsActivePort`), then reads `runnerResult.lhr` instead of parsing `--output=json` from stdout. | Platform-independent: no branch on WSL, no `PATH` archaeology, and no chrome-launcher in the path at all. The spec's stated reason for using Playwright's Chromium — "the two measurements cannot disagree about the browser" — is *strengthened*: the same object launches it. |
| | Cookie-carrying audits pass headers through the API's `flags.headers` (the `--extra-headers` equivalent), not a CLI string. | Three of the four audits are authenticated (`/history`, dashboard, runner). If the equivalent is not `headers`, the measurement is: make one of them authenticated, compare scores with and without, and record which flag the API takes. |
| | The score floors, the `ENTRY_ALLOWLIST` rationale, the `[measurement]` console lines and the 180 s budget stay **as they are**. | This card is a transport change. If a floor moves, that is a finding to raise, not to absorb. |
| **Decide (owner), do not silently drop** | Whether this card also owns the *other* local browser defect on the box: Playwright's `chrome-headless-shell` lacks `libnspr4`/`libnss3`/`libasound`, so the whole `page`-fixture battery dies with `error while loading shared libraries` unless `LD_LIBRARY_PATH` names a user-space copy (currently `/tmp/pw-libs/extracted/usr/lib/x86_64-linux-gnu`, which **does not survive a reboot**). | The `--with-deps` fix needs root; a user-space copy needs a path that outlives `/tmp`. Options: a `scripts/` bootstrap the repo owns, or a `PROMPTKIT.md` §3 line so the next session stops rediscovering it, or "machine problem, never the repo's" — recorded in STATE §1 either way. |

## Acceptance criteria

```gherkin
Scenario: The gate runs where the app is developed
  Given a WSL2 dev box with no system Chrome, an unwritable /mnt/c profile, and no root
  When npx playwright test lighthouse.spec.ts runs against the production server
  Then all four audits produce a score and none exits 1 from chrome-launcher
  And the accessibility score on /sign-in is 100, with the failed-audit list attached as today

Scenario: The mechanism changed and the contract did not
  Given the diff touches only how Lighthouse is launched and how its report is read
  Then every assertion in the file is unchanged, including the floors and ENTRY_ALLOWLIST
  And CI runs the identical command (npm run test:e2e) and its numbers move by zero

Scenario: The browser is still one browser
  Given the launched Chromium
  Then its executable path is the same chromium Playwright uses (assert the resolved path, not the
       version string), so the axe run in a11y.spec.ts and this score cannot disagree about a browser

Scenario: The gate is still a gate (watched to fail, per the board's definition-of-done law)
  Given a deliberately un-passed axe-level violation injected into /sign-in on a throwaway edit
  When the rewritten spec runs
  Then the score drops and the test goes red
  And the capture is in this PR, and the injected markup is reverted
```

## Implementation record (2026-09-15, per-AC — every number measured this pass)

`npx playwright test lighthouse.spec.ts` **4/4 on this box**; `lighthouse + csp + a11y` **15/15 in 1.3 min**;
`npm run typecheck` 0 · `npm run lint` 0 · `npm run test` **58 files / 547 tests**. Server: `next build` →
`next start` on `:3001`, i.e. the same webServer `playwright.config.ts` already boots.

*On the whole battery:* `npm run test:e2e -- --workers=1` stopped at **47 passed / 22 failed**, and the 22 are
not this card's — every one is `TypeError: fetch failed` from the five spec files that began after the project's
Supabase containers exited mid-run (`04:36:18Z`, then again `04:47:15Z`). `npm run test:api:preflight` read green
the moment the stack came back, which is the distinction that script exists to make; `lighthouse`, `csp` and
`a11y` all passed inside the battery before it. §5's `100run1` entry records the same vanished-server shape
unnamed. CI runs the unchanged command, and that is the gate.

| AC | Result | Evidence |
| :--- | :--- | :--- |
| **1** the gate runs where the app is developed | **green** | Four audits, four scores: `/sign-in` **100**, `/history` **100**, `/` **100**, `/session/{id}` **100**; 8.3–10.3 s each, no `exited 1`, no `chrome-launcher` frame. Re-measured reproduction of the *old* code first, on this tip (`2b7a77b`): `EACCES: permission denied, mkdir '/mnt/c/Users/<win-user>/AppData/Local/lighthouse.39821809'` at `makeWin32TmpDir` ← `Launcher.prepare` ← `getDebuggableChrome` — i.e. the card's record still described reality, unchanged by #148 and #153. |
| **2** the mechanism changed, the contract did not | **green** | Every floor, `ENTRY_ALLOWLIST`, both `[measurement]` console lines, the annotation strings and the 180 s budget are textually the ones that shipped with #60/#65/#67. `git diff` on the assertions is empty bar the two additions named under *Deviations*. |
| **3** one browser | **green** | `realpathSync(browser.executablePath) === realpathSync(chromium.executablePath())`, asserted in the first test — resolved paths, not version strings. The port comes from `DevToolsActivePort` inside the profile directory *this child was launched with*, so no other browser can be what answered. |
| **4** the gate is still a gate | **green, watched to fail** | Four axe-level violations injected into `/sign-in` (`img` without `alt`, unlabelled `input`, empty `a`, unnamed `div[role=button]`) → the printed line moved **100 → 81**, the floor assertion went red (`Expected: >= 90, Received: 81`), and the annotation named them: `aria-command-name, image-alt, label, link-name`. Markup reverted, `cmp` byte-identical, rebuilt, re-green. |

**The flag the API takes is `extraHeaders`, not `headers`** (`node_modules/lighthouse/types/lhr/settings.d.ts:104`,
"List of extra HTTP Headers to include"), and the card's own measurement instruction — *make one of them
authenticated, compare scores with and without* — is the reason the file gained one assertion. On `/history`:

| request | score | `finalDisplayedUrl` |
| :--- | :--- | :--- |
| with the real `sb-…-auth-token` pair | 100 | `http://localhost:3001/history` |
| **without** it | **100** | `http://localhost:3001/sign-in` |

Two different subjects, the same number. A silently-dropped cookie does not lower any score — it audits the
sign-in form and reports a pass, which is exactly the "true number attached to the wrong subject" bug the first
test in this file already documents for `/`. So `assertStillAuthenticated(report, path)` compares
`finalDisplayedUrl`'s pathname against the route the test names, and it was **watched red**: the `history`
audit run with the cookie withheld failed with `Expected: "/history" / Received: "/sign-in"`.

**What the launcher actually does now.** `spawn(chromium.executablePath(), ['--headless=new',
'--remote-debugging-port=0', '--no-sandbox', '--disable-dev-shm-usage', '--user-data-dir=<profile>'])`, then
`lighthouse(url, { port, hostname: '127.0.0.1', onlyCategories: ['accessibility'], logLevel: 'error',
extraHeaders })`, reading `runnerResult.lhr` instead of parsing stdout. Port `0` + `DevToolsActivePort` rather
than `9222` because `fullyParallel` gives each worker its own browser and a fixed port would collide.
`chrome-launcher` stays a transitive dependency of `lighthouse` but is now unreachable from this spec: it is
imported only from `lighthouse/cli/*` and `lighthouse/core/scripts/manual-chrome-launcher.js` (grepped, not
assumed). Lighthouse closes its own tab and only *disconnects* the browser it connected to
(`core/gather/navigation-runner.js` `_cleanup`), which is why the spec owns `close()` and terminates the child
itself — with a 5 s SIGTERM grace and a SIGKILL after it, so an audit that dies cannot leak a browser per worker.

**Deviations, both deliberate.**
1. **One assertion added**, not changed: `assertStillAuthenticated` on the three authenticated audits
   (`/history`, `/`, `/session/{id}`), for the reason in the table above. AC-2's "unchanged" is about the scored
   contract; this guard cannot lower a floor, only notice when the wrong page was scored.
2. **The Windows-path hazard moved from prevention to assertion.** The CLI form pinned `TMPDIR/TEMP/TMP=/tmp`
   for the child because chrome-launcher derived a profile name from them. Nothing derives anything now, so the
   hazard is met twice over instead: `createProfileDir()` asserts the path is absolute and outside the repo
   *before* a browser starts, and test 1's existing repo-root tripwire still fails the run if a single entry
   appears. The comment keeps the original `SingletonSocket`/`os error 6` incident in the file, because the env
   var that caused it is still unidentified.

**The owner fork, decided:** this card does **not** own the machine's missing `.so` files. It owns the
diagnosis — if the launched Chromium dies before writing `DevToolsActivePort` and stderr names a shared
library, the failure says so, names `npx playwright install --with-deps chromium` and the `LD_LIBRARY_PATH`
fallback, and states plainly that it is a machine defect and not a change in the app. `PROMPTKIT.md` §3 carries
the workaround, where its stale path is also corrected (it named `/tmp/pwlibs/ext/…`, which does not exist on
this box; `/tmp/pw-libs/extracted/…` does — the kind of drift that makes a documented workaround rediscovered
rather than used).

**CI sees none of this.** The command is still `npm run test:e2e`; `chrome-launcher`'s WSL branch is a dev-box
problem CI never had, so the identical spec stays green there by construction. What changed is only *where* this
repo can ask the question.

## Automated Verification

```bash
npx playwright test lighthouse.spec.ts        # the point of the card: green here, not only in CI
npx playwright test a11y.spec.ts              # same browser, same binary, two gates
npm run typecheck && npm run lint && npm run test
```

## Definition of done

A developer on this machine can answer "did my change cost us Lighthouse points?" before opening a PR,
with the same command CI runs — and #142's AC-6 note ("measured around a machine defect") becomes a
plain measurement. Nothing about the scored contract changes, and the watched-red capture proves the
rewritten gate can still fail.

## Out of scope

The accessibility score itself · any app markup change · the Lighthouse **performance** category (never
claimed by this repo) · CI's Chrome setup (it already passes; do not "simplify" it) · the `middleware →
proxy` rename (also #142's out-of-scope list) · CSP of any kind.

## Dependencies

- **Blocks:** nothing. Unblocks honest local work on **G-M3-5** and every future UI card that must
  prove it cost no accessibility points — #104, #108, #111 and #110 all touch scored routes.
- **Evidence:** PR #148 (M4-24) §Deviations 5 and the AC-6 row of
  `docs/tasks/m4/M4-24-csp-baseline.md`'s implementation record.
- **Files:** `tests/e2e/lighthouse.spec.ts` only, plus `PROMPTKIT.md` §3 / a `scripts/` bootstrap if the
  owner folds the `LD_LIBRARY_PATH` decision in above.
