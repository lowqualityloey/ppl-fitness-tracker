# Technical Design Document (RFC): API-Suite Harness Hardening

- **Author**: Agent (DeepSeek Harness / lead), on the owner's instruction
- **Status**: Approved 2026-11-19 — implementation in progress
- **Created**: 2026-11-19
- **Target Release**: the `chore/promptkit-v2-sync` branch, before the API-harness change reaches a PR

---

## Planning Record (PromptKit Adaptation)

<a id="PLAN-api-suite-hardening"></a>

### Planning Record Metadata

- **Planning Record ID**: `PLAN-api-suite-hardening`
- **Planning Depth**: `Full` — changes the harness that runs the merge gate across four source
  files plus three governance documents; a bad harness can make 84 tests look green while testing
  nothing, which is exactly the failure class the source review found.
- **Owner**: Repository owner (heyLoey)
- **Record Status**: `ready`
- **Local Task Record Link**: [TASK-api-suite-hardening](../tasks/2026-11-19-api-suite-hardening.md#TASK-api-suite-hardening)
- **Workflow Links**: `pk:review` (source) → this spec → `pk:tasks` → implementation → `pk:review`

### Planning Inputs

- **Requested Outcome**: Every finding in
  [REVIEW-2026-11-19-api-suite-shared-server](../reviews/2026-11-19-api-suite-shared-server.md#REVIEW-2026-11-19-api-suite-shared-server)
  is either fixed in the tree or explicitly dispositioned, so the API-harness change can go to a PR
  without a reviewer having to re-derive the same list.
- **Observable Completion Condition**: `npm run test:api` is green with 14 files / 84 tests; a
  zero-file collection attempt now exits non-zero; the record, spec, and measurement document agree
  on AC numbering and on what each measurement measured; `npm run typecheck` and `npm run lint`
  exit 0; `validate-execution-control.sh` reports zero `STATE_` rows.
- **Scope Boundary**: the four API-harness source files, one new unit test file, three governance
  documents the review corrected, and the `docs/STATE.md` projection. No product code, no schema,
  no workflow YAML, no assertion weakened. The workflow constraint binds `544081d` itself;
  `.github/workflows/test.yml` does change elsewhere on the branch, in `560ebde`, which belongs to
  `TASK-ci-runtime-reduction`.
- **TDD Enforcement Proposal (Reference Only)**: `disabled` — Code Work on test infrastructure with
  no product behaviour. The canonical Task Record owns the mode.

### Full Planning

- **Explicit Non-Goals**: §2.
- **Affected Behavioral Components**: `server-process.ts` (spawn/probe/stop/manifest seam),
  `global-setup.ts` (boot, freshness guard, signal cleanup), `test-server.ts` (attach/fallback,
  log capture), `vitest.api.config.ts` (the collection contract), and the three documents.
- **Externally Visible Contracts**: `npm run test:api` and `npm run test:red` keep their names and
  meaning; port 3101 and `M1_16_API_TEST_PORT` stay; the structured-log line shape stays; a direct
  single-file run keeps working without the shared config. **One contract deliberately tightens**: a
  `test:api` invocation that collects zero files now exits non-zero (F3).
- **Failure or Rollback Considerations**: the failure mode that matters is a harness that reports
  green without testing. §5 records the failure-injection ACs that bar it, and each fix is
  independently revertable because they touch disjoint functions. Rollback is `git revert` of one
  commit; the fallback path means a partial revert still runs the suite one file at a time.
- **Verification Approach**: `npm run test:api` green twice; a single-file direct run green; a
  zero-file `test:api` invocation exits non-zero and runs no server; a unit suite over the pure
  manifest/port/file helpers; `npm run typecheck` and `npm run lint` exit 0; the governance gates
  green.

### Assumption Records

<a id="ASSUMPTION-api-suite-hardening-001"></a>
#### `ASSUMPTION-api-suite-hardening-001`

- **Assumption ID**: `ASSUMPTION-api-suite-hardening-001`
- **Unanswered Decision**: Does anything other than CI-on-Ubuntu consume the `win32` branch of the
  spawn/signal seam?
- **Provisional Answer**: No. `.github/workflows/test.yml:62` pins `runs-on: ubuntu-latest` and
  there is no second runner; the repo has no Windows contributor path recorded in `docs/STATE.md`.
- **Impact if Wrong**: A Windows developer loses the fallback they never had (the branch cannot
  start `npx.cmd` without `shell: true`, and the signal reaches only the shim). Deleting it makes
  that explicit rather than silently broken.
- **Validation Action**: the seam throws a named error on `win32` instead of pretending to work;
  any future Windows need re-opens this assumption.
- **Decision Owner**: Repository owner (heyLoey)
- **Status**: `accepted`
- **Supporting Evidence**: `docs/reviews/2026-11-19-api-suite-shared-server.md` §"⚠️ [IMPORTANT]" → S4
- **Resolution Evidence**: `N/A - accepted assumption, not resolved`

<a id="ASSUMPTION-api-suite-hardening-002"></a>
#### `ASSUMPTION-api-suite-hardening-002`

- **Assumption ID**: `ASSUMPTION-api-suite-hardening-002`
- **Unanswered Decision**: Is the freshness guard's 250 ms window the right instrument, or should the
  guard be replaced by a bounded settle poll?
- **Provisional Answer**: Replace it. Measured 2026-11-19 on this machine: with a listener holding
  `:3101`, `npx --no-install next dev --port 3101` exits **code 1 after 1,161 ms** — the fixed
  250 ms sleep checks roughly 4.6x too early. A poll that watches `exitCode`/`signalCode` for up to
  2 s catches the death whenever it happens inside that window, and costs the same 2 s once per run.
- **Impact if Wrong**: A child that dies after the settle window still escapes the guard. That is
  bounded by the pre-check at `global-setup.ts:56-62` plus `waitForReady`'s own exit watch, so the
  residual race stays narrow — but it must be stated, not assumed away.
- **Validation Action**: AC-7 in the Task Record induces an occupied port and asserts the run fails
  with the harness's own message rather than a 30 s probe timeout.
- **Decision Owner**: Repository owner (heyLoey)
- **Status**: `accepted`
- **Supporting Evidence**: `docs/reviews/2026-11-19-api-suite-shared-server.md` §"Implementation Discrepancies"
- **Resolution Evidence**: `N/A - accepted assumption, not resolved`

### Technology and Vendor Decision Records

`None` — no version, package, or vendor changes. Vitest 5.0.5 and Next 16.4.1 stay pinned; every
fix is inside the project's own harness code.

---

## 1. Executive Summary & Problem Statement

The shared-server API harness landed on this branch and passed its own acceptance criteria, but an
independent review (`pk:review`, 2026-11-19) returned **Changes Requested** with 4 spec-fidelity
findings (F1–F4) and 11 standards findings (S1–S11). None is a data-loss or security defect; two are
gate-integrity defects and the rest are lifecycle edges and dead surface.

This document is the Planning Record for remediating them. It does not restate the findings — the
review is their canonical home — it records **what will be done about each one**, which is what the
review deliberately left to the owner.

The two that matter most:

- **F3** — the spec claims "no green-from-silence path", but `passWithNoTests: true` is inherited
  from `vitest.config.ts:25` through `mergeConfig`, so an invocation that collects zero files exits
  **0**. Measured 2026-11-19: `--config vitest.api.config.ts tests/integration/api/does-not-exist.test.ts`
  prints `No test files found, exiting with code 0` and **exit 0**, without booting anything.
  The goal is achievable with one line; the honest fix is to make the goal true rather than to
  weaken its wording.
- **S1** — `stop()` guards on `child.exitCode !== null`, which a signal-killed child never
  satisfies (`exitCode` stays `null`, `signalCode` becomes `'SIGKILL'`), so teardown burns the
  full 5 s and can resolve before the port is free.

## 2. Goals and Explicit Non-Goals

### Goals (In Scope)

- **G1** — Every review finding has a recorded disposition: fixed, or accepted with a stated reason.
- **G2** — A `test:api` invocation that collects zero files exits non-zero, so a collection failure
  cannot read as green.
- **G3** — Teardown is prompt and complete: `stop()` returns only after the child is gone, and an
  interrupted run leaves no orphan holding `:3101`.
- **G4** — The three governance documents agree with each other and with the tree on AC numbering,
  AC-8's evidence, and what each measurement measured.
- **G5** — No test body, assertion, budget, threshold, or workflow file changes **in `544081d`**.
  The scope is the commit, not the branch: `560ebde` changes `.github/workflows/test.yml` on the same
  branch under its own record (`TASK-ci-runtime-reduction`), and this specification neither claims
  nor governs that change.

### Non-Goals (Explicit Scope Boundary)

- No product code, route, schema, migration, or database change.
- No change to `.github/workflows/test.yml`; the step still runs `npm run test:api`.
- No `fileParallelism`, sharding, or worker-count change.
- No fix of the six pre-existing Drizzle/RLS assertion failures in `tenancy.test.ts` and
  `rls-user-data-tables.test.ts` — they are a separate change with their own cause
  (`drizzle-orm` 0.45.x wraps driver errors, moving the SQLSTATE to `.cause.code`).
- No new dependency, and no version change to Vitest or Next.
- No Windows support. The branch is deleted and its absence made loud (§4.4).
- No commit, push, PR, or merge without explicit owner instruction.

## 3. Architecture & System Context

The harness has one lifecycle owner per mode and one shared seam:

```text
npm run test:api  ->  vitest.api.config.ts  ->  global-setup.ts (one boot)
                                                    |            \
                                                    |             \-> test-results/api-server.{log,json}
                                                    v
                                             server-process.ts   <- spawn / readiness / stop / manifest
                                                    ^
                                                    |
                         test-server.ts  (per worker: attach to manifest, or own a server)
```

Every fix lands on one of four seams, and no fix crosses them:

| Seam | Owns | Findings |
|---|---|---|
| `server-process.ts` | argv, port, readiness probe, signal strategy, manifest I/O, log helpers | S1, S3, S4, S5, S7, S8, S9, S11 |
| `global-setup.ts` | one boot, freshness guard, teardown, signal cleanup | S2, S12 |
| `test-server.ts` | attach-or-own, per-file log offset, log-line absorption | S3, S6, S10 |
| `vitest.api.config.ts` | the collection contract | F3 |

## 4. Detailed Design & Contracts

### 4.1 Port and manifest validation (S3, S7, S8)

`API_TEST_PORT` becomes a validated constant instead of a raw `Number()`:

```ts
function readPort(raw: string | undefined): number {
  if (raw === undefined || raw === '') return 3101;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`M1_16_API_TEST_PORT must be an integer in 1..65535, got "${raw}"`);
  }
  return port;
}
```

Measured baseline: `M1_16_API_TEST_PORT=abc` currently yields `NaN`, and the child is spawned with
`--port NaN` (S8). A throw at module load fails the run at collection time with a message naming the
variable, which is louder than a Next usage error 30 s later.

`readServerManifest` additionally rejects a non-positive or non-integer `pid` (S3): `process.kill(0, 0)`
succeeds, so a corrupt manifest with `pid: 0` currently reads as alive.

`writeServerManifest` becomes atomic (S7): write `${path}.tmp` then `renameSync` onto the target.
A worker reading the manifest either sees the previous complete document or the new one, never a
half-written file.

### 4.2 Teardown and signal cleanup (S1, S2)

`stop()` guards on either termination marker and awaits the exit it caused:

```ts
if (child.exitCode !== null || child.signalCode !== null) return;
const exited = once(child, 'exit');
signalApiServer(child, 'SIGTERM');
const timer = setTimeout(() => signalApiServer(child, 'SIGKILL'), 5_000);
await exited;                       // resolved by the exit event, whenever it lands
clearTimeout(timer);
```

The 5 s is now a *deadline for the exit event*, not a deadline for giving up on it — so a healthy
SIGTERM resolves in milliseconds and a SIGKILL still resolves once the child is actually gone.

`global-setup.ts` installs `process.once('SIGINT')` and `process.once('SIGTERM')` handlers that stop
the child and remove the manifest before re-raising the default behaviour (S2). Vitest 5.0.5's own
handler calls `process.exit()` without running the teardown closure
(`node_modules/vitest/dist/chunks/index.1TqnEahn.js:8578-8595`), and the child is `detached: true`,
so nothing else reaches it.

Stale `api-server-owned-*.log` files are pruned on boot: any owned log whose pid is not alive is
removed. 17 such files dated 2026-10-23 are on disk from exactly this pattern.

### 4.3 Freshness guard (S12)

The fixed `await delay(250)` becomes a bounded settle poll:

```ts
await confirmSurvived(server.child, 2_000);   // polls exitCode/signalCode every 50 ms, returns early on death
```

Measured basis: an occupied `:3101` makes the child exit code 1 after **1,161 ms**, so 250 ms checks
~4.6x too early. The residual race (a child that dies after 2 s) is stated in
`ASSUMPTION-api-suite-hardening-002` rather than assumed away.

### 4.4 Windows (S4)

The `win32` branches are deleted, not repaired. `signalApiServer` and `spawnNextDev` throw a named
error on `process.platform === 'win32'` explaining that the harness supports Linux and macOS only.
Rationale: a path that cannot work is worse than an absent one — it reads as support.

### 4.5 Spawn-error reporting (S5)

`waitForReady` keeps a `spawnError` separate from `lastError` and prefers it in the thrown message,
and the loop's exit branch also fires when `child.signalCode !== null`. Today a failed spawn
(`ENOENT`) leaves `exitCode` null, so the run reports `last client error: TypeError: fetch failed`
after 30 s instead of naming the spawn failure.

The same principle applies to a missing credential, one layer earlier. `spawnNextDev` used to fall
back to the published Supabase local-development anon key, which meant a parent without the key still
spawned a child; `lib/env/server.ts` requires that name and `src/instrumentation.ts` exits 1 on a bad
environment, so the failure surfaced as `Next test server exited before readiness (code 1)` — a
sentence about a server instead of one about a missing variable. `resolveSpawnEnv` now throws a named
error in the parent, before the log descriptors are opened, naming the variable and where to get it.
It returns only the three keys the harness decides (`SpawnEnvOverrides`); the caller spreads them over
`process.env`, so the child keeps everything the operator set and the result stays assignable to
`spawn`'s `env` option. The two address defaults survive on purpose: an address has one obvious local
answer, a key does not — any value invented here would be a credential the operator did not choose.
Removing the fallback also removed a credential-shaped literal from the tree, which the repository's
own policy already reserves for a placeholder (`.env.example`: `REPLACE_ME`).

### 4.6 Log capture (S10, S11)

`absorbLine` requires `typeof parsed.msg === 'string'` in addition to `level` and `request_id`.
`ServerLogEntry.msg` is a required field and the timeout message joins it, so a line without one is
not the seam's line.

The `O_APPEND` comment in `spawnNextDev` is corrected (S11): `O_APPEND` makes each `write(2)`
atomic at end-of-file, but **two fds are as interleavable as one** — line integrity comes from the
child writing whole lines, not from the fd count. The code is unchanged; only the claim is fixed.

### 4.7 Dead surface (S6)

`serverLogEntries` (`test-server.ts:111-114`, 0 call sites), `export { apiOrigin }`
(`test-server.ts:19`, 0 importers), and the `export` keyword on `SERVER_MANIFEST_PATH` and
`signalApiServer` are removed. Verified this turn: the only importer of `test-server.js` is the 14
API test files, and none imports `serverLogEntries` or `apiOrigin`; `apiOrigin` reaches tests
through `server-process.js` only inside the harness.

### 4.8 Collection contract (F3)

`vitest.api.config.ts` sets `passWithNoTests: false`. The base config keeps `true` — `npm test` is a
broad lane that must tolerate an empty match, while `test:api` is a named suite that must not.

Verified mechanism: `mergeConfig` is a deep merge, so the child value wins. The installed Vitest
honours it at `node_modules/vitest/dist/chunks/index.1TqnEahn.js:8499`
(`else if (config.passWithNoTests) this.log(\`${message}, exiting with code 0\`)`).

### 4.9 Documentation corrections (F1, F2, F4)

- **F1** — the record's AC-8 evidence is restated from a fresh `git status --porcelain`, and
  `docs/releases/ci-triage/ci-cost-measurement.md` is added to its §6 Changed Files.
- **F2** — the record's AC-7/AC-9 numbering is aligned to the spec §7 table (AC-7 = CI wall-clock,
  AC-8 = no assertion change, AC-9 = `npm test` unaffected), and the spec's own contradicting
  sentence at §7 (`CI's own number is AC-9`) is corrected to `AC-7`.
- **F4** — the measurement document's "before" column is relabelled: 259 s is the **new harness's
  own fallback path** (14 owned servers), not the pre-change pipe-based harness at `HEAD`. The
  derived "~156–169 s saved" is re-stated as what it is — a comparison of two configurations of the
  new code — and the pre-change harness is recorded as `not measured`.

## 5. Security, Privacy & Failure Modes (FMEA)

| # | Failure mode | Severity | Mitigation in this change | Verification |
|---|---|---|---|---|
| 1 | Collection failure reads as green (F3) | **High** | `passWithNoTests: false` in the API config only | AC-2: a zero-file `test:api` invocation exits non-zero |
| 2 | Teardown returns while `:3101` is still bound (S1) | Medium | `signalCode` guard + awaited exit | AC-4: `ss -ltn` shows nothing on 3101 after a run |
| 3 | `SIGINT` leaves an orphan that blocks the next run (S2) | Medium | `process.once` handlers + stale-log prune | AC-5: an interrupted run leaves no listener and no owned log |
| 4 | Stale-but-alive server from another revision is adopted (S3) | Medium | `pid` validation; manifest carries `startedAt` | AC-3: a manifest with `pid: 0` is rejected |
| 5 | A failed spawn is reported as a probe timeout (S5) | Low | Separate `spawnError`, preferred in the message | AC-6: a spawn of a missing binary names the spawn error |
| 6 | Typo'd port yields `--port NaN` (S8) | Low | `readPort` throws at load | AC-3 |
| 7 | Half-written manifest is read (S7) | Low | temp + rename | AC-3 |
| 8 | `fileSize` hides EACCES as "empty" (S9) | Low | re-throw anything that is not `ENOENT` | AC-8 |
| 9 | A line without `msg` is captured and later joins a timeout message as `undefined` (S10) | Low | shape check requires `msg` | AC-9 |
| 10 | Windows path silently broken (S4) | Low | delete + throw a named error | AC-10 |

No credential, secret, or personal data is read, written, or logged by this change. The one env
variable handled is `M1_16_API_TEST_PORT`, and its error message quotes the value the operator
typed, which is a port number.

## 6. Implementation Milestones

**Work type**: Code Work on test infrastructure. **Task Record TDD mode**: `disabled` — normal
dependency-ordered milestones, no Red→Green requirement (there is no product behaviour).

- [x] **M1 — Collection contract (F3).** `vitest.api.config.ts` gains `passWithNoTests: false`;
  the spec's G4 wording is qualified. Acceptance: a zero-file `test:api` invocation exits non-zero.
  **Done** — measured: `vitest run --config vitest.api.config.ts
  tests/integration/api/does-not-exist.test.ts` → `No test files found, exiting with code 1`, exit 1
  (was exit 0 before the change). The base lane still exits 0 on the same shape, which is intended.
- [x] **M2 — Seam hardening (S1, S3, S4, S5, S7, S8, S9, S11).** `server-process.ts` only.
  Acceptance: `npm run test:api` still 14/84 green; unit suite over the pure helpers green.
  **Done** — 14 files / 84 tests green, 111.06 s; `tests/unit/infra/api-harness.test.ts` 36 tests
  green (31 at this milestone, plus the 5 credential cases added later in the same change; the
  Task Record's Verification Evidence at §3 AC-13 carries both counts). One extra fix landed here that the finding list did not carry: each readiness probe is now
  bounded to 2 s and aborted the moment the child exits (see §4.5). Without it an occupied port took
  45 s to report, because the loop sat inside an unanswered `fetch`.
- [x] **M3 — Lifecycle cleanup (S2, S12).** `global-setup.ts` only. Acceptance: teardown leaves no
  listener; an occupied port fails inside 2 s with the harness's message.
  **Done, with one corrected number** — measured: an occupied `:3101` fails at **4.5 s** end to end
  (`npm run test:api` including Vitest startup) with `Next test server exited before readiness
  (code 1): ... EADDRINUSE`, and leaves nothing listening. The "inside 2 s" in this milestone was
  the settle window, not the command's wall clock; the command cannot finish faster than its own
  startup. SIGINT mid-run exits 130 and leaves no listener and no owned log.
- [x] **M4 — Consumer cleanup (S3, S6, S10).** `test-server.ts` only. Acceptance: `npm run typecheck`
  exit 0 with the exports removed; `sync.test.ts`'s three log assertions still pass.
  **Done** — `npm run typecheck` exit 0; the 84-test API run includes `sync.test.ts` green.
- [x] **M5 — Documentation corrections (F1, F2, F4).** The three documents agree. Acceptance:
  AC numbering identical between spec §7 and the record; AC-8's evidence matches a fresh
  `git status --porcelain`; the measurement doc names its before-column honestly.
  **Done** — AC-7/AC-9 swapped in the record to match spec §7; AC-8's evidence restated from a fresh
  `git status --porcelain` (3 tracked + 5 new, not 2 + 4) and `ci-cost-measurement.md` added to §6;
  the measurement doc's before-column relabelled and the derived saving withdrawn.

## 7. Acceptance Criteria

| ID | Criterion | Verification |
|---|---|---|
| `AC-1` | `npm run test:api` is green: 14 files / 84 tests, 0 skipped, one boot | Vitest summary; `grep -c 'Ready in' test-results/api-server.log` = 1 |
| `AC-2` | A `test:api` invocation that collects zero files exits non-zero | `--config vitest.api.config.ts tests/integration/api/does-not-exist.test.ts` → exit 1 |
| `AC-3` | Manifest and port validation: `pid: 0` rejected, `M1_16_API_TEST_PORT=abc` throws, write is atomic | unit suite `tests/unit/infra/api-harness.test.ts` |
| `AC-4` | `stop()` returns only after the child is gone; nothing listens on 3101 afterwards | `ss -ltn \| grep 3101` empty after a run; unit probe over a spawned `sleep` child |
| `AC-5` | An interrupted run leaves no orphan and no owned log | `SIGINT` during `test:api`; then `ss -ltn` and `ls test-results/api-server-owned-*.log` |
| `AC-6` | A failed spawn names the spawn error, not a probe timeout | unit probe spawning a nonexistent binary |
| `AC-7` | An occupied `:3101` fails inside the settle window with the harness's message | hold 3101 with a listener, run `test:api`, assert exit non-zero and the message |
| `AC-8` | `fileSize` distinguishes missing (`0`) from unreadable (throws) | unit suite |
| `AC-9` | A JSON line without `msg` is not captured | `sync.test.ts` still green; unit assertion over the shape check |
| `AC-10` | The `win32` path throws a named error instead of pretending to work | `grep` for the message; unit assertion |
| `AC-11` | No test body, assertion, budget, threshold, or workflow file changed in `544081d` | `git diff --stat 544081d^...544081d -- .github/workflows/ tests/ vitest.config.ts package.json` (empty for workflows; the test diff is the two new files) |
| `AC-12` | `npm run typecheck` and `npm run lint` exit 0 | both commands |
| `AC-13` | `npm test` shows the same 6 pre-existing failures and no new one | Vitest summary; the counts and their two measurement dates live in the Task Record's AC-13 evidence, which is the single source for them |
| `AC-14` | AC numbering agrees between spec §7 and the record; AC-8 evidence matches the tree; the measurement doc names its before-column | read all three documents |
| `AC-15` | `validate-execution-control.sh` exits 0 with zero `STATE_` rows, and the staged index is credential-clean | `bash .promptkit/scripts/validate-execution-control.sh --root .`; `bash .promptkit/scripts/scan-staged-secrets.sh` |

## 8. Sign-off & Grilling Checklist

- [x] Design checked against installed Vitest semantics (`mergeConfig` deep-merge, the
  `passWithNoTests` branch) and against a measured EADDRINUSE exit (1,161 ms), not remembered.
- [x] Shared-state audit: no in-process limiter, fixture, or database behaviour is touched.
- [x] Zero-downtime database evolution: `N/A` — no schema or data change.
- [x] Owner approval of the remediation scope (reply `1` to the review's next-steps card, 2026-11-19).
- [x] `pk:tasks` created [TASK-api-suite-hardening](../tasks/2026-11-19-api-suite-hardening.md#TASK-api-suite-hardening).

---

## Finding Dispositions

Canonical finding text lives in the review; this table records only the decision.

| Finding | Disposition | Where |
|---|---|---|
| F1 stale AC-8 evidence, §6 omits a file | **Fix** | record §3 AC-8, record §6 |
| F2 AC numbering divergence | **Fix** | record §3, spec §7 prose |
| F3 green-from-silence for collection failure | **Fix the code**, and qualify the spec claim | `vitest.api.config.ts`, spec §2 |
| F4 "before" column is not the pre-change harness | **Fix** the label, mark the pre-change harness `not measured` | measurement doc |
| S1 `stop()` burns 5 s, may return before exit | **Fix** | §4.2 |
| S2 no SIGINT cleanup | **Fix** | §4.2 |
| S3 manifest has no run identity; `pid: 0` reads alive | **Fix** the pid validation; `startedAt` now bounds adoption | §4.1 |
| S4 `win32` branch cannot work | **Delete** and throw a named error | §4.4 |
| S5 spawn error masked | **Fix** | §4.5 |
| S5 follow-on: a substituted anon key masked a missing-variable failure as a readiness failure, and put a credential-shaped literal in the tree (found by the commit gate's staged-secret scan) | **Fix**: `resolveSpawnEnv` refuses a missing key in the parent and returns only the harness-owned overrides; the literal is deleted | §4.5 |
| S6 dead exports | **Delete** | §4.7 |
| S7 non-atomic manifest write | **Fix** | §4.1 |
| S8 NaN port | **Fix** | §4.1 |
| S9 `fileSize` swallows EACCES | **Fix** | §4.1 |
| S10 `absorbLine` never checks `msg` | **Fix** | §4.6 |
| S11 wrong `O_APPEND` comment | **Fix the comment**, not the code | §4.6 |
| S12 freshness guard 250 ms (review §"Implementation Discrepancies") | **Fix** | §4.3 |
| SIMPLIFICATION-...-001 and -002 | **Fix** (covered by S6) | §4.7 |
