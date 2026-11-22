# Host-only unit failures: seven green-in-CI tests that fail on this Windows box

Recorded 2026-11-23, after PR #180 merged green. Written because the local suite reports
`3 failed | 64 passed (67)` files and `7 failed | 667 passed (674)` tests while CI on the same
tree reports success — and a future reader who sees only the local number will read it as a
branch regression unless the delta is written down.

## The question

Seven tests fail on this host and pass in CI. Are they regressions, flakes, or host artifacts?

## Reproduction (this host, `a93e6dc`)

```
node --env-file-if-exists=.env.local node_modules/vitest/vitest.mjs run \
  tests/unit/contracts/sync-response-fixture.test.ts \
  tests/unit/infra/api-harness.test.ts \
  tests/unit/infra/e2e-phase-window.test.ts
```

Result: `Test Files 3 failed (3)`, `Tests 7 failed | 40 passed (47)`, 2.58 s. The same command on
CI's Ubuntu runner passes. So the failures are deterministic here, not flaky.

## What each failure actually is

| Lane | Failures | Measured cause | Why CI differs |
| :--- | :--- | :--- | :--- |
| `tests/unit/infra/api-harness.test.ts` | 3 (`stopChild` ×2, `confirmSurvived` ×1) | `assertSupportedPlatform` throws by design: *"The API-suite harness supports Linux and macOS only."* The win32 branch was removed because it could not start `npx` without a shell or signal the real process group (S4, `docs/reviews/2026-11-19-api-suite-shared-server.md`). These tests spawn a real child, so they inherit that refusal. | CI runs `ubuntu-latest`; the guard passes and the child exercises proceed. |
| `tests/unit/infra/api-harness.test.ts` | 1 (`fileSize (S9)`) | The case builds a **regular file** named `not-a-directory`, then asks for a path *under* it and expects `ENOTDIR`. Windows returns `ENOENT` for that shape, so `fileSize` takes its "missing file" branch and returns `0` instead of throwing — the assertion is `expected [Function] to throw an error`. | POSIX resolves `ENOTDIR`; Windows collapses it to `ENOENT`. |
| `tests/unit/infra/e2e-phase-window.test.ts` | 1 (`asserts exactly the labels the app renders`) | The label-union regex (`/label:\s*([^\n]+(?:\n[^\n]+)*?),\s*\n\s*\): Promise/`) is written for LF. This worktree checks out **CRLF** (`core.autocrlf=true`, no `.gitattributes`; `git ls-files --eol` → `i/lf w/crlf`), so `[^\n]+` swallows `\r` and the capture runs past the union. A direct probe of the same regex over `tests/e2e/runner-fixtures.ts` printed **56 captured labels** (including `session-subtitle`) against the 5 the app renders. | CI checkout is LF, so the capture stops at the union's 5 labels. |
| `tests/unit/contracts/sync-response-fixture.test.ts` | 2 (`finds the specs it claims to have scanned`, `never finds a hand-written sync body`) | `E2E_DIR` is built as `new URL('../../e2e', import.meta.url).pathname`, which on Windows yields `/C:/Users/...`; `readdirSync` through `join` then resolves `C:\C:\Users\...` and throws `ENOENT: scandir 'C:\C:\Users\...'`. | On POSIX that `.pathname` **is** a valid absolute path, so the scan finds the 16 specs. |

Totals: 3 + 1 + 1 + 2 = 7, matching the reported count exactly.

## Why this is not a branch regression

- Every cause is a **host assumption in the test or its helper**, not a behaviour difference in
  application code: a deliberate win32 refusal (S4), POSIX `ENOTDIR` semantics, LF-only regex
  parsing, and POSIX `URL.pathname`. None of the four touches `src/`, `lib/` or a route.
- The same tree is green on CI for both events: PR run `45051353006` (`success`, 9 m 1 s) and
  post-merge `main` run `45052437490`. A regression that existed in the code would fail there too.
- The failures reproduce identically with and without this branch's changes — they were recorded
  as the host baseline before the Drizzle/RLS repair and did not move when it landed.

## What this record does **not** authorize

- It does not weaken, skip, or delete any assertion. The win32 refusal is a design decision with
  a named reason, and rewriting it to make a Windows run green would remove the guard that keeps
  the harness from pretending it can signal a process group it cannot.
- Making these four cases green on Windows is real work: an `ENOTDIR` fallback, an EOL-tolerant
  parser, a `fileURLToPath` call, and a platform-aware skip for the three child-spawning cases.
  That is a separate task with its own record, not a gate on any branch.

## Resolution (2026-11-23)

All seven cases are resolved. `61ff169` fixed the two `URL.pathname` scans and the LF-only
label parser; `54f76b8` made the last four platform-aware rather than changing the helpers:

- the three signal-path cases (`stopChild` ×2, `confirmSurvived` ×1) are skipped on win32
  because `signalApiServer` refuses that platform by design (S4), and `assertSupportedPlatform`
  still asserts the refusal on every host, so the guard is not weakened;
- the `fileSize` case asserts Windows' measured `ENOENT` → `0` answer, because Windows cannot
  produce the `ENOTDIR` this record measured on POSIX. No `ENOTDIR` fallback was added, so the
  rethrow stays asserted where it can be reached instead of being pretended on win32.

`npm test` now reads 67 passed (67) files and 671 passed | 3 skipped (674) on this host, with
`npx tsc --noEmit` and `npx eslint --max-warnings=0` exit 0. The three skipped cases and the
`ENOTDIR` rethrow are POSIX-only, so CI remains their executor.

## Provenance

| Fact | Measured by |
| :--- | :--- |
| 7 failed / 40 passed locally | the reproduction command above, 2026-11-23 |
| win32 refusal text | the failure output, `server-process.ts:245` |
| `ENOTDIR` vs `ENOENT` | the failure output at `api-harness.test.ts:127` |
| CRLF in the worktree | `git config core.autocrlf` → `true`; `git ls-files --eol` → `i/lf w/crlf`; the 56-label probe |
| `/C:` pathname | the `ENOENT: scandir 'C:\C:\Users\...'` failure output |
| CI green | `gh run view 45051353006`, `gh run view 45052437490` |
