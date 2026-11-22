# Technical Design Document (RFC): One Shared API Test Server

- **Author**: Repository owner (heyLoey) with Buffy
- **Status**: Approved 2026-10-23 — implemented, awaiting review
- **Created**: 2026-10-23
- **Target Release**: `docs/specs/2026-10-23-spec-ci-runtime-reduction.md` §8, first later-ledger lever

---

## Planning Record (PromptKit Adaptation)

<a id="PLAN-api-suite-shared-server"></a>

### Planning Record Metadata

- **Planning Record ID**: `PLAN-api-suite-shared-server`
- **Planning Depth**: `Full` — changes the harness that runs the merge gate and touches four files;
  a bad harness can make 84 tests look green while testing nothing.
- **Owner**: Repository owner (heyLoey)
- **Record Status**: `draft`
- **Local Task Record Link**: [`TASK-api-suite-shared-server`](../tasks/2026-10-23-api-suite-shared-server.md#TASK-api-suite-shared-server)
- **Workflow Links**: `pk:plan` → this spec → `pk:tasks`

### Planning Inputs

- **Requested Outcome**: Cut another ~2–3 minutes from the CI API step by booting **one** `next dev`
  server for the whole `tests/integration/api/` suite instead of one per file.
- **Observable Completion Condition**: `npm run test:api` reports the same 14 files / 84 tests green
  while the step's wall-clock and the count of `next dev` boots both fall measurably.
- **Scope Boundary**: `tests/integration/api/` harness + a dedicated Vitest config + the `test:api`
  script. No test assertion, no product code, no workflow YAML, no e2e.
- **TDD Enforcement Proposal (Reference Only)**: `disabled` — Code Work on test infrastructure, not
  product behavior. The canonical Task Record owns the mode.

### Full Planning

- **Explicit Non-Goals**: §2.
- **Affected Behavioral Components**: `tests/integration/api/test-server.ts` (all 14 suites import
  it), a new `global-setup.ts`, the `test:api` npm script, and the Vitest invocation.
- **Externally Visible Contracts**: `npm run test:api` / `npm run test:red` remain the entry points
  and keep their names; the API suite keeps port 3101 and the `M1_16_API_TEST_PORT` override; the
  structured-log line shape is unchanged. CI does not change: the step still runs `npm run test:api`.
- **Failure or Rollback Considerations**: a harness bug can silently weaken the gate. §5 bars that
  with an explicit failure-injection AC. Rollback is `git revert`; the fallback path means a partial
  revert still runs the suite one-file-at-a-time.
- **Verification Approach**: full suite green twice, once with files shuffled; single-file fallback
  green with no shared server; globalSetup failure exits non-zero and runs zero tests; CI step
  duration compared to the 208 s / 249 s baselines.

### Assumption Records

<a id="ASSUMPTION-api-suite-shared-server-001"></a>
#### `ASSUMPTION-api-suite-shared-server-001`

- **Assumption ID**: `ASSUMPTION-api-suite-shared-server-001`
- **Unanswered Decision**: Does any API spec depend on a **fresh process** beyond the rate limiters
  audited below?
- **Provisional Answer**: No. The 14 files share only the database (already serialized) and the
  server's rate limiters; the only limiter assertion is `sync.test.ts`'s 120/min test, keyed by a
  per-file fixture user.
- **Impact if Wrong**: An order-dependent green could hide a real failure. Mitigated by running the
  suite with `--sequence.shuffle.files` and twice in sequence before accepting the change.
- **Validation Action**: Implementation milestone M3 (shuffle + repeat runs).
- **Decision Owner**: Repository owner (heyLoey)
- **Status**: `open`
- **Supporting Evidence**: this spec §3.3
- **Resolution Evidence**: `N/A - unresolved`

<a id="ASSUMPTION-api-suite-shared-server-002"></a>
#### `ASSUMPTION-api-suite-shared-server-002`

- **Assumption ID**: `ASSUMPTION-api-suite-shared-server-002`
- **Unanswered Decision**: How much of CI's 208–249 s API step is boot cost?
- **Provisional Answer**: ~140 s of it. Measured locally on 2026-10-23: **16.65 s** cold boot,
  **9.47 s** warm boot. Fourteen sequential boots ≈ `16.6 + 13 × 9.5 ≈ 140 s`.
- **Impact if Wrong**: The saving shrinks toward the boot share actually present in CI; the
  projection in §7 is a range for that reason.
- **Validation Action**: compare the CI step duration after merge against 208 s / 249 s.
- **Decision Owner**: Repository owner (heyLoey)
- **Status**: `open`
- **Supporting Evidence**: `#boot-measurement`
- **Resolution Evidence**: `N/A - unresolved`

### Technology and Vendor Decision Records

`None` — Vitest 5.0.5 is already the project's runner and no version, package, or vendor changes.
The design choice between a shared server and the alternatives is recorded in §4.1 as an
architectural decision, and its load-bearing claim was verified against the installed binary rather
than a vendor page (see `#vitest-probe`).

---

## 1. Executive Summary & Problem Statement

The API step is the second-largest cost in CI: **249 s** on the last PR run, **208 s** on the last
`main` run. It runs 14 test files, and **each file boots its own `next dev` server** — because
`fileParallelism: false` runs files serially and `test-server.ts` keeps the child process in
module scope, which every worker process gets fresh.

That boot is not free. Measured on this machine against the current harness: **16.65 s** from spawn
to readiness on the first boot, **9.47 s** on the second. Fourteen of those is roughly **140 s** —
two-thirds of the step — spent starting the same server to serve the same routes against the same
database.

The fix is not clever: start the server **once**, let the 14 files share it, and keep the database
serialization that already exists. It does not touch an assertion, a budget, or the workflow.

---

## 2. Goals and Explicit Non-Goals

### Goals

- **G1**: One `next dev` process serves all 14 API files in a `npm run test:api` run.
- **G2**: Zero change to what the 84 tests assert; the same files, tests, and commands.
- **G3**: A developer running one file directly keeps today's behaviour (server spawns, suite works).
- **G4**: A harness failure fails the run loudly. Scoped honestly: this holds for a *throwing*
  `globalSetup`, and for a suite whose files ran and failed. It did **not** hold for a collection
  that matches zero files — see the correction in §3 below. That gap is closed by
  `PLAN-api-suite-hardening` (`vitest.api.config.ts` sets `passWithNoTests: false`).
- **G5**: Measured before/after, recorded in the CI-triage record.

### Non-Goals

- **N1**: Enabling `fileParallelism`. The constraint is the **shared database**, documented in
  `vitest.config.ts`; a shared server does not fix fixture races.
- **N2**: Running the API suite against a production build. It would change error surfaces and
  require a build step; boot cost is solved without it.
- **N3**: Sharding, worker tuning, or touching `tests/e2e/`.
- **N4**: Any change to `.github/workflows/test.yml`. The step already calls `npm run test:api`.
- **N5**: Product-code changes, including rate-limiter resets or test-only routes.
- **N6**: Removing `sync.test.ts`'s route warm-up or any other test-body change.

---

## 3. Architecture & System Context

### 3.1 Current process model

```text
vitest run (fileParallelism: false)
  └─ file 1 ──► spawn next dev :3101 ──► probe ──► tests ──► SIGTERM
  └─ file 2 ──► spawn next dev :3101 ──► probe ──► tests ──► SIGTERM
  ...
  └─ file 14 ─► spawn next dev :3101 ──► probe ──► tests ──► SIGTERM
```

Every file pays: process spawn, Next startup, and **on-demand route compilation** for whichever
routes it touches.

### 3.2 Target process model

```text
vitest run --config vitest.api.config.ts
  └─ globalSetup ─► spawn next dev :3101 (stdout/stderr → test-results/api-server.log)
                 ─► write test-results/api-server.json { pid, port, logPath }
                 ─► probe readiness (30 s deadline)
  └─ file 1..14 ─► startApiServer() = readiness probe + log offset   (no spawn)
                 ─► requests hit an already-warm server
  └─ teardown ───► SIGTERM process group → 5 s → SIGKILL; delete manifest
```

### 3.3 Shared state audit (this is the part that could break tests)

| State | Per-file today | Shared after | Verdict |
|---|---|---|---|
| Postgres rows | Shared, serialized | Unchanged | Safe — `fileParallelism: false` stays |
| `signInRateLimiter` (IP keyed, 5/10 min) | Fresh map per server | One map | **Safe only because no API test calls `/auth/signin`** (verified: zero matches in `tests/integration/api/*.test.ts`) |
| `legacyImportRateLimiter` (user keyed) | Fresh map | One map | Safe — fixtures mint a fresh user per file |
| `exportRateLimiter` (user keyed) | Fresh map | One map | Safe — same reason |
| `syncRateLimiter` (user keyed, 120/min) | Fresh map | One map | Safe — `sync.test.ts` exhausts **its own** fixture user, and the test is declared last in its file |
| IndexedDB / client state | None (node env) | None | Safe |
| `.next` dev artifacts | Rewritten per boot | Written once | Safe; tests never assert compile timing |

The IP-keyed sign-in limiter is the one that would bite a future test. That is a **locked invariant**
for the harness comment: if a spec ever needs more than five `POST /auth/signin` attempts, it must
either own a server or the limiter store must move out of process.

<a id="boot-measurement"></a>
### 3.4 Measured boot cost

Command (2026-10-23, this machine, `.next` already populated):

```bash
npx tsx -e "… startApiServer(); stopApiServer(); startApiServer(); stopApiServer() …"
```

| Measurement | Result |
|---|---:|
| First boot → readiness | **16.65 s** |
| Readiness probe after boot | 100 ms |
| Second boot → readiness | **9.47 s** |

Fourteen sequential boots ≈ **140 s**. CI measures **208 s / 249 s** for the whole step, so boot is
most of it and the remaining test execution is roughly 60–100 s.

<a id="vitest-probe"></a>
### 3.5 Vitest semantics this design relies on

Probed against the installed **vitest 5.0.5** with two scratch files (created and deleted in the
same command; `git status` clean afterwards):

```text
order.log: setup → file-a → file-b → teardown
```

- `globalSetup`'s default export runs **once per run**, before every file.
- A returned function runs **after all files** — the teardown seam.
- A throwing `globalSetup` exits **1** and runs **zero tests** — no green-from-silence path for a
  harness that *tried* to run.
- **Correction (2026-11-19, review F3).** The claim above was overstated as a general property. A
  run that collects **zero files** never reaches `globalSetup` at all, and exits **0** when
  `passWithNoTests` is on — measured: `vitest run --config vitest.api.config.ts
  tests/integration/api/does-not-exist.test.ts` printed `No test files found, exiting with code 0`,
  exit **0**, with no server booted and no manifest written. The base config sets
  `passWithNoTests: true` (`vitest.config.ts:25`) and `mergeConfig` inherits it, so this suite had a
  green-from-silence path for collection failures from the day it landed. Remediated in
  `PLAN-api-suite-hardening` (§4.8): `vitest.api.config.ts` now sets `passWithNoTests: false`, and
  the same invocation exits 1.

`mergeConfig` is exported by `vitest/config` in this version (verified).

---

## 4. Detailed Design & Contracts

### 4.1 Design decision: `globalSetup` + file-backed logs + fallback

| Option | Why not |
|---|---|
| **Chosen**: `globalSetup` boots one server; logs to a file; `test-server.ts` keeps a spawn fallback | One boot; teardown seam; single-file debugging preserved; no product code |
| Wrapper script (`tsx scripts/run-api-suite.ts`) around `vitest` | Same power, custom lifecycle code instead of the runner's built-in seam, and a second way to invoke the suite |
| Per-worker server via `setupFiles` | With `isolate: true` a file gets a fresh module registry, so this is still one boot per file |
| Lazy "first file wins" server with no teardown | The first file's `afterAll` would kill the server the other 13 need; ordering-dependent |
| Shared server, no fallback | A direct `npx vitest run tests/integration/api/auth.test.ts` would fail with `ECONNREFUSED` and no explanation |
| Production build for API tests | Changes error surfaces and adds a build; solves a different problem |

**Logs are the constraint.** Today they are captured in memory, per server process. With one shared
server in the `globalSetup` process, test workers cannot see that memory. The design writes the
child's stdout/stderr straight to `test-results/api-server.log` and teaches `waitForLogEntry` to read
that file. Only `sync.test.ts` uses it (three assertions), but it must keep working exactly.

### 4.2 File-by-file change

**A. `tests/integration/api/server-process.ts` (new, ~90 lines)** — the one module that knows how to
run a Next dev server:

```ts
export interface SpawnedServer { child: ChildProcess; stop(): Promise<void> }
export async function spawnNextDev(opts: { port: number; logPath: string }): Promise<SpawnedServer>
export async function waitForReady(origin: string, child: ChildProcess, timeoutMs: number): Promise<void>
```

- Spawns `npx --no-install next dev --port <port>` detached, with `stdio: ['ignore', logFd, logFd]`.
- `waitForReady` polls `/__readiness-probe__` (the existing probe and its rationale move here
  verbatim), fails on `child.exitCode !== null`, and on timeout throws with the last lines of the log.
- `stop()` does SIGTERM to the process group, 5 s, then SIGKILL — today's logic, unchanged.

**B. `tests/integration/api/global-setup.ts` (new, ~40 lines)**:

- Truncate `test-results/api-server.log`; write the manifest `{ pid, port, logPath, startedAt }`.
- `spawnNextDev` + `waitForReady(30_000)`.
- **Freshness guard**: the spawned child must still be alive after readiness. If the port was
  occupied by a leaked server, the child dies with `EADDRINUSE` and this guard fails the run
  instead of silently testing a stale process.
- Teardown: `stop()`, delete the manifest.

**C. `tests/integration/api/test-server.ts`** — same public API, three internal changes:

- `startApiServer()`: if the manifest exists **and** the server answers readiness → shared mode:
  record `logOffset = size(logPath)` and return. Otherwise fall back to `spawnNextDev` on a
  truncating log (today's behaviour, one file at a time).
- `stopApiServer()`: no-op in shared mode; `stop()` in owned mode.
- `waitForLogEntry()` / `serverLogEntries()`: parse JSON lines from `logOffset` in the log file.
  A partially written trailing line simply fails `JSON.parse` on this poll and appears next poll;
  the 25 ms poll loop already tolerates that. The timeout message keeps the list of captured `msg`
  values.

**D. `vitest.api.config.ts` (new)**:

```ts
import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";

export default mergeConfig(
  base,
  defineConfig({ test: { globalSetup: ["tests/integration/api/global-setup.ts"] } }),
);
```

**E. `package.json`**: `test:api` gains `--config vitest.api.config.ts`. `test:red` still aliases it.
Nothing else changes; `npm test` keeps the base config and its `--exclude`.

### 4.3 Contracts

| Contract | Value | Consumed by |
|---|---|---|
| Suite entry | `npm run test:api` (unchanged name) | CI step 11, humans, `test:red` |
| Port | `3101`, override `M1_16_API_TEST_PORT` | All 14 files via `apiOrigin` |
| Readiness probe | `GET /__readiness-probe__`, `status < 500` | global setup and fallback |
| Manifest | `test-results/api-server.json` `{ pid, port, logPath, startedAt }` | `startApiServer()` |
| Log | `test-results/api-server.log`, JSON lines (`level`, `request_id`, …) | `waitForLogEntry()` |
| Teardown | SIGTERM group → 5 s → SIGKILL; manifest deleted | global setup |

`test-results/` is already gitignored (`.gitignore` line 9), so neither artifact can be committed.

### 4.4 Data / migrations

`N/A` — no schema, data, or migration change.

---

## 5. Security, Privacy & Failure Modes (FMEA)

### Security audit

- **Tenancy / auth / RBAC**: `N/A` — no product code touched. The harness still authenticates
  through the same GoTrue cookies and `extraHeaders`.
- **Input validation**: `N/A` — the only new inputs are a port from env and a manifest written by
  the suite itself.
- **Secrets & PII**: the log file contains request-scoped JSON lines already captured in memory
  today, written under gitignored `test-results/`. It is never uploaded by CI (no artifact step).
  No token or cookie is added to the file by this change; the existing redaction seam still owns
  what the app logs.
- **Process control**: the teardown signals a **process group** it created (`detached: true`), never
  a pattern-matched process.

### FMEA

| Failure | Probability / Severity | Detection | Mitigation | Recovery |
|---|---|---|---|---|
| A test file depends on a fresh process | Medium / High | `--sequence.shuffle.files` run, plus a second full run | Audit in §3.3; shuffle is an acceptance criterion | Revert to per-file boot for that file; record why |
| Leaked server from a crashed prior run holds :3101 | Low / High | spawned child exits `EADDRINUSE`; freshness guard fails the run | Fail loudly with the port and pid in the message; never reuse an unmanifested server | `kill <pid>`; rerun |
| Shared server dies mid-suite | Low / High | next file's `startApiServer()` probe fails with the log tail | Clear "shared API server not reachable" error naming the log file | Rerun; the failure is attributed to infrastructure, not assertions |
| Log assertions read another file's lines | Low / Medium | `sync.test.ts`'s three `waitForLogEntry` assertions | Per-file byte offset set in `startApiServer()`; files are serial | Scope by request id (already in the predicates) |
| `globalSetup` fails to boot | Medium / High | Vitest exit 1, zero tests run (probed) | Readiness deadline with stderr tail in the message | Environment fix; CI preflight already distinguishes env from code |
| Teardown does not run (hard kill) | Low / Low | leftover manifest/pid on the next run | Freshness guard + manifest check | Kill pid manually; CI VM disappears anyway |
| IP-keyed sign-in limiter shared accidentally | Low / High (future) | A new spec gets 429 at attempt 6 | Locked invariant documented in the harness; §3.3 audit recorded | Give that spec its own server or move the limiter store out of process |
| "Faster" achieved by skipping files | Low / High | File/test count in the summary vs baseline 14 / 84 | AC-2 asserts the same counts; no config `exclude` change | Revert |

---

## 6. Implementation Milestones

**Work type**: Code Work on test infrastructure. **Task Record TDD mode**: expected `disabled` —
normal dependency-ordered milestones, no Red→Green requirement (there is no product behavior).

- [x] **M1 — Extract the server seam.** New `server-process.ts` with spawn/probe/stop moved from
  `test-server.ts`, behaviour identical. Acceptance: `npm run test:api` still 14/84 green. Landed
  together with M2: file-backed logging is the same code path in both modes, so splitting it would
  have meant writing a throwaway pipe reader.
- [x] **M2 — Shared server.** `global-setup.ts` + `vitest.api.config.ts` + `test:api --config`;
  `test-server.ts` shared/fallback split; file-backed logs.
  Acceptance: one `next dev` process observed for the whole run (`pgrep -f "next dev --port 3101"`
  after file 1), 14/84 green, fallback single-file run green.
- [x] **M3 — Prove the gate.** Full suite three times in a row; once with `--sequence.shuffle.files`;
  a deliberate `globalSetup` failure (reserved port) that exits non-zero and runs zero tests; a
  direct single-file run with no shared server. All four observed and recorded in the Task Record.
- [ ] **M4 — Measure and record.** Compare the CI step duration with 208 s / 249 s and append the
  result to `docs/releases/ci-triage/ci-cost-measurement.md` (same table style as the workflow
  change). Update `docs/STATE.md` only after the numbers exist.

---

## 7. Acceptance Criteria

| ID | Criterion | Verification |
|---|---|---|
| `AC-1` | `npm run test:api` boots exactly **one** `next dev` server | `pgrep -f "next dev --port 3101"` during the run; count in the log header |
| `AC-2` | Same suite shape: **14 files / 84 tests**, 0 skipped | Vitest summary |
| `AC-3` | Green twice in a row and once with `--sequence.shuffle.files` | Three runs, exit 0 |
| `AC-4` | Single-file direct run (no shared server) still green | `npx vitest run tests/integration/api/health.test.ts` |
| `AC-5` | A failing `globalSetup` exits non-zero and runs **zero** tests | Induced bad port; captured exit code and summary |
| `AC-6` | `sync.test.ts`'s three log assertions still pass, reading this file's offset only | Full run; log file inspected |
| `AC-7` | Step wall-clock falls from 208–249 s to the projected band, recorded from CI | `gh run view --json jobs`, step "Run API route-handler suites" |
| `AC-8` | No assertion, budget, test body, or workflow file changed | `git diff --stat` review |
| `AC-9` | `npm test` (unit + integration, API dir excluded) is unaffected | `npm test` green |

**Projected** (measured boot share, not yet a CI measurement):

| Scenario | Boot cost | Suite total | Saving |
|---|---:|---:|---:|
| Today (14 boots) | ~140 s | 208–249 s | — |
| Shared (1 boot + warm routes) | ~17 s | **70–110 s** | **~100–150 s (1.7–2.5 min)** |

The low end assumes test execution dominates once boots are gone; the high end assumes a slower CI
runner. Both are inside §8's 2–3 minute estimate.

**Measured locally on one revision** (the harness's own fallback path is the before-column, so both
runs execute identical test code): **259 s with 14 boots → 90–103 s with 1 boot**, three consecutive
green runs plus a cold-cache shuffled run at 100 s. The tables live in
`docs/releases/ci-triage/ci-cost-measurement.md`; CI's own number is **AC-7** (the §7 table's
`Step wall-clock falls ... recorded from CI`) and arrives after merge. This sentence said AC-9,
which is `npm test` unaffected — corrected 2026-11-19 under review F2.

---

## 8. Sign-off & Grilling Checklist

- [x] Design checked against installed Vitest semantics (probed, not remembered) and measured boot
      cost on this machine.
- [x] Shared-state audit covers every in-process limiter in `lib/auth/rate-limit.ts`.
- [x] Zero-downtime database evolution: `N/A` — no schema or data change.
- [x] Owner approval of this spec (`sure lets start that`, 2026-10-23).
- [x] `pk:tasks` created [`TASK-api-suite-shared-server`](../tasks/2026-10-23-api-suite-shared-server.md#TASK-api-suite-shared-server).
