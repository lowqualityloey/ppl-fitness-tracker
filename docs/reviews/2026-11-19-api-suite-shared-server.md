# Senior Code Review: One Shared API Test Server

<a id="REVIEW-2026-11-19-api-suite-shared-server"></a>

- **Review ID**: `REVIEW-2026-11-19-api-suite-shared-server`
- **Review Status**: `complete`
- **Resolved Diff Reference**: **working-tree review mode** — `git diff HEAD` (3 files, +203 / −147) plus
  five explicitly scoped untracked files (1,004 lines): `docs/specs/2026-10-23-spec-api-suite-shared-server.md`,
  `docs/tasks/2026-10-23-api-suite-shared-server.md`, `tests/integration/api/global-setup.ts`,
  `tests/integration/api/server-process.ts`, `vitest.api.config.ts`. Fixed point `HEAD` =
  `560ebde1a37d044c355676f537637e1c8bf2d2c3`.
- **Canonical Task Record**: [`TASK-api-suite-shared-server`](../tasks/2026-10-23-api-suite-shared-server.md#TASK-api-suite-shared-server)
- **Ceremony Level**: `Level 2 (Controlled Work)` — the harness *is* the merge gate.
- **Authority**: this report records findings and recommendations only. It does not edit source and does
  not authorize commit, push, PR, merge, release, or rollback.

---

## Executive Summary

- **Overall Verdict**: **Changes Requested** — on the Task Record's evidence integrity, and on three
  guard-hardening items in the new harness. **The harness design itself is sound**; no blocking defect
  was found in the reviewed code.
- **Spec Fidelity**: **Missing Requirements** — the implementation matches the spec's shape, but three
  acceptance criteria carry evidence that does not reproduce, one spec goal (G4) is stated more strongly
  than the code delivers, and the spec and record disagree on AC numbering.
- **Technical Standards**: **Minor Code Smells** — no security, data-loss, or concurrency defect in the
  reviewed files. The defects found are lifecycle edges (orphan processes, stale adoption, a sleep
  standing in for a proof) and dead surface area.

**Gates executed this turn**: `npm run typecheck` → **exit 0**; `npm run lint` → **exit 1** (7 problems,
all outside the resolved diff — see §Gate Status). The DB-backed suites were **not** run: the local
Supabase stack is down, so `test:api`, `npm test`, and every wall-clock figure below are
`not measured` this turn except where a specific probe is named.

---

## Axis 1: Spec Fidelity

### Missing / Partial Requirements

#### ⚠️ F1 — AC-8's evidence is factually stale, and §6 omits a changed file

- **Evidence**: `docs/tasks/2026-10-23-api-suite-shared-server.md:94-96` claims `git status --porcelain`
  shows "`package.json`, `tests/integration/api/test-server.ts` modified plus four new files". Run this
  turn, `git status --porcelain` reports **3 modified + 5 untracked**:
  `M docs/releases/ci-triage/ci-cost-measurement.md`, `M package.json`,
  `M tests/integration/api/test-server.ts`, and five `??` files.
- **Detail**: the modified `ci-cost-measurement.md` is missing from the claim **and** from §6 Changed
  Files (`:143-150`), even though the record's own §6 "Changed-File Summary" (`:196-199`) mentions "the
  measurement section". The AC that exists to prove "nothing but the harness changed" is the one whose
  file list is wrong.
- **Required fix**: restate AC-8's evidence against a command run at review time, and add the measurement
  doc to §6.

#### ⚠️ F2 — AC numbering diverges between spec and record, and the spec contradicts itself

- **Evidence**: spec §7 table (`docs/specs/2026-10-23-spec-api-suite-shared-server.md:362-364`) defines
  `AC-7` = CI wall-clock, `AC-8` = no assertion change, `AC-9` = `npm test` unaffected. The Task Record
  swaps them: `:83` makes `AC-7` = `npm test` and `:97` makes `AC-9` = CI duration. The spec then
  contradicts its own table at `:379` — "CI's own number is AC-9".
- **Risk**: the one criterion still owed (`AC-9` in the record, `AC-7` in the spec) is the one whose
  identifier is ambiguous, so a later reader cannot tell which outstanding obligation is being tracked.
- **Required fix**: pick one numbering and correct the other document; the record is the live tracker, so
  the spec table is the one to amend.

#### ⚠️ F3 — G4 ("no green-from-silence path") is stated more strongly than the code delivers

- **Evidence**: `docs/specs/2026-10-23-spec-api-suite-shared-server.md:117` asserts G4, and `:206` /
  `:323` justify it only via "a throwing `globalSetup` exits 1". That covers *boot* failure. It does not
  cover *collection* failure. Probed this turn:

  ```
  $ node node_modules/vitest/vitest.mjs run --config vitest.api.config.ts \
      --fsModuleCachePath=/tmp/vt-cache2 tests/integration/api/does-not-exist.test.ts
  No test files found, exiting with code 0
  EXIT=0
  ```

  `globalSetup` does **not** run in this path: `test-results/api-server.log` kept its
  2026-10-23 19:10:06 mtime and 118,956-byte size, and no `test-results/api-server.json` was written. So a
  `test:api` invocation whose filter or `include` matches nothing exits **0** having run nothing at all.
- **Attribution**: this is **inherited, not introduced**. `vitest.api.config.ts:20-26` `mergeConfig`s the
  base config, whose `vitest.config.ts:25` sets `passWithNoTests: true`; I confirmed the merged value by
  executing `tsx -e "import c from './vitest.api.config.ts'"` → `passWithNoTests=true`. The same probe
  against the **base** config (no `--config`) also exits 0. Mechanism verified in the installed
  Vitest 5.0.5: `node_modules/vitest/dist/chunks/index.1TqnEahn.js:8499`
  (`else if (config.passWithNoTests) this.log(\`${message}, exiting with code 0\\n\`)`).
- **Risk**: CI's step runs a directory that does contain 14 files today, so this is latent rather than
  active. It becomes active the moment the API directory is renamed, emptied, or the script's positional
  filter is edited — and then the merge gate reports green for a suite that no longer exists.
- **Required fix**: either qualify G4 in the spec to "no green-from-silence path *on boot failure*", or
  override `passWithNoTests: false` in `vitest.api.config.ts` (one line) so the API gate cannot pass on
  an empty collection. The second is the only version that makes G4 true as written.

#### ⚠️ F4 — the "before" column in the measurement record is not the pre-change harness

- **Evidence**: `docs/releases/ci-triage/ci-cost-measurement.md` (new section, `:117-124`) labels 259 s as
  "One server per file (before)" and describes it as "the harness's own fallback path". That fallback is
  **new code**: the file-backed, per-pid logging path at `tests/integration/api/test-server.ts:181-193`.
  The true pre-change harness is the one that produced CI's 208 s / 249 s, and at `HEAD` it spawns with
  `stdio: ['ignore', 'pipe', 'pipe']` (confirmed via `git show HEAD:tests/integration/api/test-server.ts`)
  — a different logging mechanism entirely.
- **Risk**: the section's own framing ("both columns run identical test code") is true for the *tests* and
  false for the *harness*, and the derived "~156–169 s saved" (`:127`) is then quoted in the spec
  (`:376-379`). The existing caveat at `:131-134` covers local-vs-CI but not this.
- **Required fix**: label the 259 s column "new harness, fallback path (one server per file)" and state
  plainly that the pre-change harness's local timing is `not measured`; or measure `HEAD`'s harness and
  record that.

### Scope Creep / Unrequested Behavior

- None detected in the resolved diff. `package.json` changes exactly one script
  (`test:api` gains `--config vitest.api.config.ts`); no test body, budget, `exclude`, or workflow file is
  touched — verified by reading `git diff HEAD -- package.json` and `git diff HEAD --name-only`.
- The one addition outside the spec's file list is the measurement section itself, which the spec's M4
  milestone explicitly asks for (`spec:346-348`). Correct scope; it is only §6's file list that omits it (F1).

### Implementation Discrepancies

- **`tests/integration/api/global-setup.ts:82-90`** — the freshness guard is a 250 ms sleep. Measured this
  turn: with a listener holding `:3101`, `npx --no-install next dev --port 3101` exits **code 1 after
  1,496 ms** (`Error: listen EADDRINUSE: address already in use :::3101`). The guard checks at 250 ms,
  roughly 6× before the child can have failed. The guard therefore does not establish what its comment
  claims ("readiness must come from the child this process spawned"); it only catches a child that has
  already died by 250 ms.
  *Mitigation, verified*: `global-setup.ts:56-62` refuses to start at all if anything already answers
  `apiOrigin`, so the exploit window requires a server that appears between the pre-check and the spawn.
  That is a real but narrow race, which is why this is ⚠️ and not 🚨.
- **`server-process.ts:130-135`** — the `allowRetry = portSource === 'default'` claim checks out against
  the installed Next 16.4.1. Verified, not taken on trust. 👏

---

## Axis 2: Standards & Code Quality

### Accidental Data Loss Audit (mandatory)

**Result: no data-loss risk.** The diff contains no migration, no `DROP`/`TRUNCATE`, no unbounded
`DELETE`, and no git reset. The only destructive calls are `truncateFile()` (`server-process.ts:91-94`),
reached only with `SHARED_LOG_PATH` (`global-setup.ts:64`) or `${RESULTS_DIR}/api-server-owned-${pid}.log`
(`test-server.ts:181-182`), and `rmSync(SERVER_MANIFEST_PATH, { force: true })` (`server-process.ts:69-71`)
— all inside `test-results/`, which is gitignored (`.gitignore:9`). No committed or user-owned artifact is
reachable from these paths.

### 🚨 [BLOCKING] — none in the reviewed files

The reviewed diff introduces no security, data-loss, or correctness defect that must be fixed before PR.

### ⚠️ [IMPORTANT]

#### S1 — `stop()` can burn 5 s and returns before the port is actually free

- **Location**: `tests/integration/api/server-process.ts:165-181`.
- **Finding**: the early-return guard is `if (child.exitCode !== null) return;` (`:166`). Probed this turn:
  a `SIGKILL`ed child emits `exit` with `code=null signal=SIGKILL`, and afterwards `child.exitCode` is
  **still `null`** while `child.signalCode === 'SIGKILL'`. So the guard never fires for a signal-killed
  child, and the `once('exit')` wait (`:178`) burns the full 5 s. Worse, after the timeout branch calls
  `signalApiServer(child, 'SIGKILL')` it resolves via `finish()` without awaiting the actual exit (`:173-176`),
  so `stop()` can return while the port is still bound.
- **Impact**: weakens AC-1's claim that "`ss -ltn` shows nothing left on 3101 after teardown", and adds
  5 s to a teardown that should be immediate.
- **Attribution**: the identical pattern exists at `HEAD`
  (`git show HEAD:tests/integration/api/test-server.ts` — `if (!activeServer || activeServer.exitCode !== null) return;`
  then the same 5 s race). It is **pre-existing**, moved rather than introduced — but this change makes the
  module the single owner of the behaviour, which is the moment to fix it.
- **Remedy**: guard on `child.exitCode !== null || child.signalCode !== null`, and in the timeout branch
  `await` the exit event after `SIGKILL` before resolving.

#### S2 — nothing cleans up on SIGINT, and the leaked server then blocks the next run

- **Location**: `tests/integration/api/global-setup.ts:99-102` returns a teardown closure only.
- **Finding**: Vitest 5.0.5's signal handler sets `exitCode` and calls `process.exit()` without running
  teardown — `node_modules/vitest/dist/chunks/index.1TqnEahn.js:8578-8595`
  (`const onExit = (signal, exitCode) => { cleanup(); ... setTimeout(() => process.exit(), 1); }`), while
  `_teardownGlobalSetup` is only reached from the normal completion path
  (`cli-api.De07GUeT.js:13232`). The child is spawned `detached: true` (`server-process.ts:148`), so
  Ctrl-C does not reach its process group either.
- **Impact**: a `SIGINT` during `npm run test:api` leaves an orphan holding `:3101`, and the *next* run
  then fails at `global-setup.ts:56-62` with "Something is already serving ...". The harness refuses to
  adopt it (correct) but offers no cleanup path, so the developer must run the printed
  `lsof -ti :3101 | xargs kill` every time. 17 stale `test-results/api-server-owned-*.log` files dated
  2026-10-23 are on disk from exactly this pattern (each with one `Ready in` line).
- **Remedy**: install a `process.once('SIGINT')`/`('SIGTERM')` handler in `setup()` that stops the child
  and removes the manifest before re-raising; and prune `api-server-owned-*.log` older than the current
  run on boot.

#### S3 — the manifest carries no run identity, so a stale-but-alive server can be silently adopted

- **Location**: `tests/integration/api/server-process.ts:34-39` declares `startedAt`;
  `global-setup.ts:96` writes it; **no code anywhere reads it** (verified by
  `grep -rn "startedAt" tests/ lib/ src/` — every other hit is an unrelated domain field).
- **Finding**: `test-server.ts:163-179` attaches to any manifest whose `pid` is alive and whose port answers
  `answersReadiness`. `isProcessAlive` accepts `pid` `0` — probed: `process.kill(0, 0)` **succeeds**, so a
  corrupt or half-written manifest whose `pid` is `0` reads as alive.
- **Impact**: a server left by an earlier run of a *different revision* can be attached to, and the suite
  then reports results for a build this checkout no longer has. The comment at `server-process.ts:26-29`
  claims the manifest prevents exactly this scenario; as written it only prevents it when the pid is *dead*.
- **Remedy**: use `startedAt` (reject a manifest older than the current run's start, or compare it to the
  harness's own start time), and reject non-positive pids in `readServerManifest` (`:51`).

#### S4 — the `win32` branch cannot work

- **Location**: `server-process.ts:143-157` and `:107-117`.
- **Finding**: on `win32` the spawn passes `'npx'` with no `shell: true`, which cannot start `npx.cmd` on
  modern Node; and `signalApiServer` falls through to `child.kill(signal)`, which reaches only the shim
  rather than the `next dev` grandchild. This is a code path that cannot function, not merely one that is
  untested.
- **Remedy**: either add `shell: process.platform === 'win32'` plus a working signal strategy, or delete
  the branch and document Linux/macOS support. The repo is developed on Linux; "documented or deleted" is
  the choice, not "left as if it worked".

### Diagnostics Evidence (from Step 2a)

- **Evidence Source**: `eslint-cli` (`npm run lint` → exit 1) and `tsc-cli` (`npm run typecheck` → exit 0),
  both executed this turn.

| Location | Severity | Source | Message |
|----------|----------|--------|---------|
| *(none inside the resolved diff files)* | — | eslint-cli | 0 problems attributable to the reviewed diff |
| *(none inside the resolved diff files)* | — | tsc-cli | exit 0 |

All 7 reported problems fall in `.promptkit/**`, which is **not** part of this review's resolved diff.
Per the workflow's diagnostics rule they are not cited as findings here; they are recorded in §Gate Status
as a branch-level observation.

### 💡 [SUGGEST]

- **S5 — spawn-error path is masked by the probe.** `server-process.ts:219-221` stores
  `child.once('error', ...)` into `lastError`, and `:246` overwrites it on the next `fetch` rejection. A
  failed spawn (e.g. `ENOENT` for `npx`) leaves `child.exitCode === null`, so the exit branch at `:225`
  never fires and the run reports `last client error: TypeError: fetch failed` after the full 30 s. Keep a
  separate `spawnError` and surface it in the throw.
- **S6 — dead exports.** Verified by grep this turn:
  `test-server.ts:111 serverLogEntries()` (definition only, **0 call sites**; also unused at `HEAD` — pre-existing);
  `test-server.ts:19 export { apiOrigin };` (**0 importers**; `apiOrigin` was module-local at `HEAD`, so this
  re-export is newly dead); `server-process.ts:32 SERVER_MANIFEST_PATH` and `:107 signalApiServer` (used only
  inside their own module, so the `export` is unnecessary).
- **S7 — non-atomic manifest write.** `server-process.ts:64-67` writes `api-server.json` in place; a crash
  mid-write leaves JSON that `readServerManifest` correctly rejects, but a temp-file + `renameSync` makes the
  window disappear for free.
- **S8 — `API_TEST_PORT` accepts a typo.** `server-process.ts:16`: `M1_16_API_TEST_PORT=abc` yields
  `NaN` (probed), which then becomes `--port NaN` and a confusing `EADDRINUSE`-style failure. Validate with
  `Number.isInteger` and fail fast.
- **S9 — `fileSize` swallows `EACCES` as `0`** (`server-process.ts:83-89`), which reads as "no new log lines"
  rather than "cannot read the log".
- **S10 — `absorbLine` never checks `msg`** (`test-server.ts:56-73`) even though `ServerLogEntry.msg` is
  required and the timeout message at `:135-137` joins `entry.msg`. A line without `msg` would surface as
  `undefined` in the failure output.
- **S11 — the `O_APPEND` comment is wrong.** `server-process.ts:120-127` claims two file descriptors stop one
  stream's line landing inside the other's. Two descriptors are exactly as interleavable as one; `O_APPEND`
  makes each `write` atomic with respect to the file offset, not with respect to the other stream. Line
  integrity actually comes from the child writing whole lines. Correct the comment rather than the code.

### 👏 [PRAISE]

- **`test-server.ts:84-108`** — the byte-offset log reader is genuinely careful: it consumes only up to
  `lastIndexOf(0x0a)`, so a multi-byte sequence can never be split across a read, a partial trailing line is
  left for the next poll, and the buffer is sized from `stat` with a short-read-tolerant `readSync`. This is
  the piece that makes a shared log safe to share, and it is done properly.
- **`server-process.ts:184-211`** — the readiness-probe rationale is the best comment in the diff. It states
  what the probe does *not* establish, reports the measured numbers (probe 3,115 ms cold vs `/` 1,827 ms),
  and refuses to claim a speed win it cannot prove. That is the standard the rest of the file should meet.
- **`global-setup.ts:15-27`** — working around the Vitest 5.0.5 reporter crash by printing before throwing,
  with the reproduction documented, is exactly right: it keeps the failure visible *and* keeps exit code 1.
- **No cross-file log leakage**, verified rather than assumed: only `tests/integration/api/sync.test.ts` reads
  logs, each file's window starts at EOF (`test-server.ts:175`), and files are serial
  (`vitest.config.ts:33 fileParallelism: false`). The three `waitForLogEntry` predicates are id-scoped.

---

## Simplification Audit

- **Review ID**: `REVIEW-2026-11-19-api-suite-shared-server`
- **Audit Status**: `complete`
- **Resolved Diff Reference**: `git diff HEAD` at `560ebde` + 5 scoped untracked files
- **Audit Result**: **Candidate(s) recorded**
- **Authority**: `pk:review`; this report is the sole home for findings and recommendations

<a id="SIMPLIFICATION-REVIEW-2026-11-19-api-suite-shared-server-001"></a>
#### Simplification Candidate: `SIMPLIFICATION-REVIEW-2026-11-19-api-suite-shared-server-001`

- **Candidate ID**: `SIMPLIFICATION-REVIEW-2026-11-19-api-suite-shared-server-001`
- **Classification**: `deletion`
- **Affected Location**: `tests/integration/api/test-server.ts:19` (`export { apiOrigin };`) and
  `tests/integration/api/test-server.ts:111-114` (`serverLogEntries`)
- **Diff Evidence**: `test-server.ts` is rewritten in this diff (+154 / −146); the re-export line is new
  surface, and the accessor is carried over unused.
- **Behavior-Preservation Condition**: no module imports either symbol. Verified this turn:
  `grep -rn "apiOrigin" tests/integration/api/` returns hits only inside `test-server.ts`,
  `server-process.ts`, and `global-setup.ts`; `grep -rn "serverLogEntries" tests/ src/ lib/ scripts/` returns
  the definition line only.
- **Risk**: none. Removing an export cannot break a caller that does not exist.
- **Verification Action**: `npm run typecheck` (currently exit 0) must stay exit 0, and
  `grep -rn "serverLogEntries\|from './test-server" tests/` must show no new importer.
- **Recommendation**: delete both, or keep `serverLogEntries` only if a follow-up spec asserts on it.

<a id="SIMPLIFICATION-REVIEW-2026-11-19-api-suite-shared-server-002"></a>
#### Simplification Candidate: `SIMPLIFICATION-REVIEW-2026-11-19-api-suite-shared-server-002`

- **Candidate ID**: `SIMPLIFICATION-REVIEW-2026-11-19-api-suite-shared-server-002`
- **Classification**: `consolidation`
- **Affected Location**: `tests/integration/api/server-process.ts:32` (`SERVER_MANIFEST_PATH`) and
  `:107-117` (`signalApiServer`)
- **Diff Evidence**: both symbols are new in this diff and are referenced only inside their own module
  (`signalApiServer` at `:167`, `:174`, `:252`; `SERVER_MANIFEST_PATH` at `:48`, `:66`, `:70`).
- **Behavior-Preservation Condition**: the module's public surface stays exactly what its two consumers use —
  `spawnNextDev`, `waitForReady`, `answersReadiness`, `readServerManifest`, `writeServerManifest`,
  `removeServerManifest`, `isProcessAlive`, `fileSize`, `truncateFile`, `logTail`, `API_TEST_PORT`,
  `apiOrigin`, `RESULTS_DIR`, `SHARED_LOG_PATH`, `type SpawnedServer`.
- **Risk**: none now; a future second lifecycle owner would need the export re-added.
- **Verification Action**: `npm run typecheck` stays exit 0 and
  `grep -rn "SERVER_MANIFEST_PATH\|signalApiServer" tests/ src/ lib/ scripts/` shows only intra-module hits.
- **Recommendation**: drop the `export` keyword from both, keeping them module-private until a second consumer
  exists.

---

## Gate Status (branch-level, outside the resolved diff)

Recorded because the branch this change sits on cannot currently pass CI, but **not** attributed to the
reviewed diff:

- `npm run typecheck` → **exit 0** this turn.
- `npm run lint` → **exit 1** this turn: 6 errors + 1 warning, **all** in the `.promptkit` submodule —
  `.promptkit/package/bin/promptkit-os.js:11,12,13,14,15,17` (`@typescript-eslint/no-require-imports`) and
  `.promptkit/scripts/tests/verify-auth-session-concurrency.mjs:199:30` (`no-unused-vars`).
  `eslint.config.mjs` `globalIgnores` covers `.next`, `out`, `build`, `next-env.d.ts`, `spikes` — not
  `.promptkit`. CI runs `npm run lint` at `.github/workflows/test.yml:129`, so that step is red.
- **Attribution**: introduced by the branch's `.promptkit` gitlink bump (v1.8.0 `2340251` → v2.0.0-71
  `0cfa093`), not by this harness change. Fix belongs in the submodule-bump commit (add `.promptkit/**` to
  `globalIgnores`) — a separate concern, surfaced here so it is not mistaken for harness breakage.
- **AC-7 / AC-9 (`npm test`)** — `not measured` this turn: the Supabase stack is down, so the record's
  "632/638, 6 pre-existing RLS/tenancy failures" cannot be re-confirmed. The stated cause is plausible and
  consistent with the branch: `main` pins `drizzle-orm ^0.36.4` / `vitest ^5.0.0` while this branch pins
  `^0.45.4` / `^5.0.5`, and 0.45.x wraps driver errors so the SQLSTATE moves to `.cause.code`. Note the
  record says "6 failures" while the tree contains **26** `42501` assertion sites (6 in
  `tests/integration/tenancy.test.ts`, 20 in `tests/integration/rls-user-data-tables.test.ts`) — different
  quantities, but the record does not say so, which is what makes the number look unreconcilable.

---

## Fresh-Context Verification (Level 2)

Two independent read-only reviewers ran in parallel on disjoint mandates (Axis 1 spec fidelity, Axis 2
standards), with the Claims-Audit duty, and did not author this change. **I re-verified every finding above
against the tree this turn** rather than merging their reports on trust, and two of their claims did not
survive:

- *"A zero-file `test:api` still boots a server and exits 0."* **Corrected**: the run exits 0 but
  `globalSetup` never executes — the log is untouched and no manifest is written. The hole is real (F3); the
  mechanism they described was not.
- *"`process.kill(-1, 0)` also succeeds, so pid −1 reads as alive."* **Not reproduced** in this environment
  (it throws, so `isProcessAlive` returns false). The pid-`0` case **did** reproduce and is what S3 records.

No round budget was consumed beyond this single pass; nothing here is a re-verification of an earlier round.

---

## Socratic Debrief & Next Steps

Order of work, cheapest first:

1. **Fix the Task Record, not the code** (F1, F2). Restate AC-8's evidence from a fresh
   `git status --porcelain`, add the measurement doc to §6, and settle the AC-7/AC-9 numbering against the
   spec table.
2. **One-line G4 fix** (F3): set `passWithNoTests: false` in `vitest.api.config.ts` — or soften G4 in the
   spec. The first makes the goal true.
3. **Harden the two lifecycle edges** (S1, S2): the `signalCode` guard plus awaiting exit after `SIGKILL`,
   and a SIGINT handler that stops the child. These are the two that will bite a human on a normal day.
4. **Relabel the measurement column** (F4) so the 259 s figure is not read as the pre-change harness.
5. Everything in 💡 is optional polish; S4 (win32) is a decision — document or delete.

Then re-run `npm run typecheck` and `npm run lint`, and once the Supabase stack is up,
`npm run test:api` for AC-1/2/3/5/6 evidence that a reviewer can reproduce.

**This review authorizes nothing.** Commit, push, PR, and merge remain the owner's decision
(`AUTHZ-api-suite-shared-server-001`, boundary `review`).
