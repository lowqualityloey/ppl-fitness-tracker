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
