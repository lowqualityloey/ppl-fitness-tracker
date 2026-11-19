# Task Record: Boot one `next dev` server for the whole API suite

<a id="TASK-api-suite-shared-server"></a>

## 1. Identity and Authority

- **Record Type**: `Task Record`
- **Task ID**: `TASK-api-suite-shared-server`
- **Ceremony Level**: `Level 2 (Controlled Work)`
- **PromptKit Adaptation Profile**: `sdlc-overlay-v1`
- **Work Type**: `Code Work`
- **Planning Record Link**: [PLAN-api-suite-shared-server](../specs/2026-10-23-spec-api-suite-shared-server.md#PLAN-api-suite-shared-server)
- **Planning Depth Reference**: `Full`
- **Assumption Record Links**: [ASSUMPTION-api-suite-shared-server-001](../specs/2026-10-23-spec-api-suite-shared-server.md#ASSUMPTION-api-suite-shared-server-001), [ASSUMPTION-api-suite-shared-server-002](../specs/2026-10-23-spec-api-suite-shared-server.md#ASSUMPTION-api-suite-shared-server-002)
- **Specification**: `docs/specs/2026-10-23-spec-api-suite-shared-server.md`
- **External Reference**: `N/A - local Markdown tracking`
- **Owner / Actor**: Repository owner (heyLoey)
- **Execution Scope**: `tests/integration/api/` harness, `vitest.api.config.ts`, and the `test:api`
  script. Single branch, single worktree.
- **Approval Boundary**: Implementation is authorized by the owner's "sure lets start that" reply
  (2026-10-23) to the offered task. Commit, push, PR, merge, and any `gh` mutation remain
  unauthorized until the owner asks.
- **Created**: `2026-10-23 05:40 UTC`

## 2. Objective and Boundaries

- **Objective**: `npm run test:api` boots exactly one `next dev` server for all 14 API files instead
  of one per file, with the same files, tests, and assertions green, so the CI step drops from
  208–249 s toward the measured-boot projection of 70–110 s.
- **In Scope**:
  - `tests/integration/api/server-process.ts` (new) — spawn/readiness/stop seam, moved out of
    `test-server.ts` unchanged.
  - `tests/integration/api/global-setup.ts` (new) — one boot, manifest, freshness guard, teardown.
  - `tests/integration/api/test-server.ts` — shared/fallback split; file-backed log reading.
  - `vitest.api.config.ts` (new) — base config plus `globalSetup`.
  - `package.json` — `test:api` gains `--config vitest.api.config.ts`.
  - `docs/releases/ci-triage/ci-cost-measurement.md` — the step-level before/after tables this
    change is priced with (G5). Added to this boundary on 2026-11-19: the file was always part of
    the change, but the record omitted it, which review finding F1 caught.
  - `docs/tasks/2026-10-23-api-suite-shared-server.md` (this record) — untracked until the owner
    asks for a commit.
  - `docs/specs/2026-10-23-spec-api-suite-shared-server.md` — the planning record this Task Record
    consumes; untracked until the owner asks for a commit.
- **Explicit Non-Goals**:
  - No `fileParallelism`, sharding, or worker-count change (the database is the shared resource).
  - No test body, assertion, budget, or threshold change; no `exclude` change.
  - No product-code change, no test-only route, no rate-limiter reset hook.
  - No `.github/workflows/test.yml` change; the step still runs `npm run test:api`.
  - No production-build harness (changes error surfaces; boot cost is solved without it).
- **Dependencies**: `vitest@5.0.5` (installed; `globalSetup`/`mergeConfig` semantics probed
  in-spec §3.5); a running local Supabase stack for the suite itself.
- **Risk**: `Medium` — the harness *is* the merge gate. The failure mode that matters is an
  order-dependent green, which `AC-3` (shuffled run) and the §3.3 shared-state audit exist to catch.
- **Verification Condition**: `npm run test:api` green with 14 files / 84 tests, twice in a row and
  once shuffled; a direct single-file run green with no shared server; an induced bad-port
  `globalSetup` exits non-zero and runs zero tests; one `next dev` process observed during the run.

## 3. Acceptance Criteria

- [x] **AC-1**: `npm run test:api` boots exactly one `next dev` server for the whole run.
  - **Result**: `Passed`
  - **Evidence**: `grep -c "Ready in" test-results/api-server.log` → **1** on every shared run, one
    `Local:` line, and a single log file serving all 14 suites; `ss -ltn` shows nothing left on 3101
    after teardown
- [x] **AC-2**: Same suite shape as the baseline — 14 files, 84 tests, 0 skipped.
  - **Result**: `Passed`
  - **Evidence**: `Test Files 14 passed (14)` / `Tests 84 passed (84)` on five runs; matches the
    pre-change fallback run exactly
- [x] **AC-3**: Green twice in a row and once with `--sequence.shuffle.files`.
  - **Result**: `Passed`
  - **Evidence**: consecutive runs at **103 s, 91 s, 90 s** (exit 0); shuffled run green before the
    cache incident below and again after the `.next` reset at **100 s** (exit 0)
- [x] **AC-4**: A direct single-file run with no shared server still works.
  - **Result**: `Passed`
  - **Evidence**: `node --env-file-if-exists=.env.local node_modules/vitest/vitest.mjs run
    tests/integration/api/health.test.ts` → 1 file / 3 tests green, own server spawned and stopped.
    Run without the env file it fails loudly with `DATABASE_URL is missing` — the correct outcome,
    and the old harness failed identically.
- [x] **AC-5**: An induced `globalSetup` failure exits non-zero and runs zero tests.
  - **Result**: `Passed`
  - **Evidence**: `M1_16_API_TEST_PORT=1 npm run test:api` → exit **1**, zero tests collected,
    and the printed diagnosis `Next test server exited before readiness (code 1): Bad port: "1" is
    reserved for tcpmux`
- [x] **AC-6**: `sync.test.ts`'s three log assertions still pass, reading only this file's offset.
  - **Result**: `Passed`
  - **Evidence**: all three `waitForLogEntry` assertions are inside the green 84; entries are read
    from a per-file byte offset (`startApiServer()` sets it to EOF), so a previous file's lines are
    never in scope
- [ ] **AC-7**: Step wall-clock falls from the 208–249 s baseline, recorded from CI.
  - **Result**: `Pending - requires a post-merge run`
  - **Evidence**: `gh run view --json jobs`, step "Run API route-handler suites"; the local
    before/after pair is already recorded in `docs/releases/ci-triage/ci-cost-measurement.md`.
    **Numbering corrected 2026-11-19** under review finding F2: this criterion is AC-7 in the
    spec's §7 table, and this record previously carried it as AC-9 while carrying `npm test` as
    AC-7. The two documents now agree.
- [x] **AC-8**: No assertion, budget, test body, workflow file, or `exclude` changed.
  - **Result**: `Passed`
  - **Evidence**: restated 2026-11-19 from a fresh `git status --porcelain`, because the original
    wording undercounted the change. The tracked edits are **three**, not two —
    `package.json` (`test:api` gains `--config vitest.api.config.ts`),
    `tests/integration/api/test-server.ts`, and `docs/releases/ci-triage/ci-cost-measurement.md`
    (+48 lines of measurement tables) — and the new files are **five**, not four:
    `tests/integration/api/server-process.ts`, `tests/integration/api/global-setup.ts`,
    `vitest.api.config.ts`, plus the spec and this record. Measured with
    `git status --porcelain`: no path under `.github/workflows/`, no `*.test.ts` body, no
    `vitest.config.ts`, and no `exclude` list appears in the change. (A sixth new file,
    `tests/unit/infra/api-harness.test.ts`, was added later by `PLAN-api-suite-hardening` and is not
    part of this change.)
- [ ] **AC-9**: `npm test` (unit + integration, API dir excluded) is unaffected.
  - **Result**: `Failed — pre-existing, not caused by this change`
  - **Evidence**: `npm test` → 64/66 files, **632/638 tests pass**, exit 1. The 6 failures are in
    `tests/integration/tenancy.test.ts` and `tests/integration/rls-user-data-tables.test.ts`, which
    import none of the changed files and never load `vitest.api.config.ts`. They assert
    `error.code === '42501'` on the value Drizzle throws; the installed Drizzle wraps driver errors
    in `DrizzleQueryError` with the SQLSTATE on `.cause.code`, which the repo's own spike records
    (`docs/spikes/2026-09-08-drizzle-rls-enforcement.md:257`). Fixing those assertions is a separate
    change; no assertion was touched here. **Numbering corrected 2026-11-19** under review finding
    F2 (this criterion is AC-9 in the spec's §7 table).

## 4. Execution Policy

- **Mode**: `Gated Mode`
- **TDD Enforcement Mode**: `disabled`
- **Batch Authorization**: `N/A`
- **Authorization Checkpoint Reference**: `AUTHZ-api-suite-shared-server-001`
- **Soft Checkpoint**: `N/A - single sitting, well under 60 minutes of active work`
- **Hard Checkpoint**: `N/A - single sitting`
- **Event-Driven Checkpoints**: `Scope expansion, verification failure, handoff`
- **Stop Conditions**: `Missing approval, failed verification, blocker, developer stop`
- **Host Timer Capability**: `No mechanical timer enforcement; checkpoints are conversational only`

## 5. State and Active Ownership

- **Execution State**: `awaiting_review`
- **Mapped `pk:tasks` Status**: `In Review`
- **Active Task Pointer**: `None`
- **Start Time**: `2026-10-23 05:40 UTC`
- **Current Actor**: Repository owner (heyLoey) reviews; Buffy implemented and verified.
- **Next Action**: Owner reviews the harness diff (commit is not authorized yet).

### Transition History

| Previous State | New State | Timestamp | Actor | Reason | Supporting Evidence |
|---|---|---|---|---|---|
| `N/A` | `planned` | `2026-10-23 05:40 UTC` | Buffy | Record created from the approved spec | `docs/specs/2026-10-23-spec-api-suite-shared-server.md` |
| `planned` | `ready` | `2026-10-23 05:40 UTC` | Buffy | Objective, scope, non-goals, ACs, dependencies, verification, owner/approval boundary, and execution policy recorded | This record §2–§4 |
| `ready` | `in_progress` | `2026-10-23 05:40 UTC` | Buffy | Owner approved implementation with "sure lets start that" | Owner reply, 2026-10-23 |
| `in_progress` | `awaiting_review` | `2026-10-23 06:06 UTC` | Buffy | Harness implemented and verified locally; AC-9 needs a post-merge CI run | This record §6 |

### Pending Human Actions

| Pending Action ID | Reason and Required Condition | Owner | Status | Authority Scope | Resume Condition |
|---|---|---|---|---|---|
| `PENDING-api-suite-shared-server-001` | AC-9 needs a real CI run, which needs a commit, push, and PR | Repository owner (heyLoey) | `pending` | Authorizes commit/push/PR only if explicitly requested | A run exists with this harness merged |

- **Pending Action Retention**: `An action stays pending until its recorded condition is met and, where externally observable, verified.`
- **Reply Binding**: `An approval reply resolves only the action it was offered against.`

## 6. Evidence and Completion Gate

- **Changed Files**:
  - `tests/integration/api/server-process.ts` - spawn/readiness/stop seam (new)
  - `tests/integration/api/global-setup.ts` - one boot, manifest, freshness guard, teardown (new)
  - `tests/integration/api/test-server.ts` - shared/fallback split, file-backed logs
  - `vitest.api.config.ts` - base config plus `globalSetup` (new)
  - `package.json` - `test:api` gains `--config vitest.api.config.ts`
  - `docs/releases/ci-triage/ci-cost-measurement.md` - the before/after measurement tables
  - `docs/specs/2026-10-23-spec-api-suite-shared-server.md` - the approved plan (untracked)
  - `docs/tasks/2026-10-23-api-suite-shared-server.md` - this record (untracked)
- **Scope Change Records**: `None`
- **Checkpoint Records**: `None`
- **Handoff Records**: `None`
- **Verification Evidence**: `2026-10-23, local, Supabase up via npm run db:up, preflight green.
  (1) npx tsc --noEmit → exit 0. (2) npm run test:api → 14 files / 84 tests green, 107 s, one boot.
  (3) fallback (base config, no globalSetup) → 14 files / 84 green, 259 s, 14 boots of the same
  revision: the before-number. (4) three consecutive shared runs → 103 s / 91 s / 90 s, all green.
  (5) --sequence.shuffle.files → green, 100 s, on a cold .next. (6) single file with the env file →
  3/3 green, owned server spawned and stopped. (7) M1_16_API_TEST_PORT=1 → exit 1, zero tests, the
  setup failure printed. (8) npm test → 632/638, 6 pre-existing RLS/tenancy failures (AC-7). (9) after replacing the
  extensionless base-config import with `./vitest.config.js` (Vite maps it to the `.ts` file and
  stops warning that the extensionless form will break under `configLoader: 'native'`): 14/84 green,
  90 s, warning gone.
  Two defects found and fixed during verification: a failed `body.cancel()` made a healthy server
  read as "not ready" for the full 30 s deadline, and the timeout message preferred the log tail
  over the client error, hiding it — both are now handled. One environment flake observed and
  attributed: a half-written `.next` Turbopack font cache from a SIGKILLed dev server made the probe
  answer 500; `rm -rf .next` cleared it. Not measured: the CI step (AC-9).`
- **Behavior IDs**: `N/A - TDD Enforcement Mode disabled`
- **TDD Intent Register**: `N/A - TDD Enforcement Mode disabled`
- **TDD Execution Evidence**: `N/A - TDD Enforcement Mode disabled`
- **TDD Exception Verification**: `N/A - Code Work`
- **CI Evidence**: `Pending - post-merge`
- **Review Evidence**: `N/A - owner review is the sign-off`
- **Commit Evidence**: `N/A before commit`
- **Pull Request Evidence**: `N/A before PR`
- **Release Evidence**: `N/A`
- **Blocker and Resume Condition**: `None`

### Durable Authorization Checkpoints

<a id="AUTHZ-api-suite-shared-server-001"></a>

- **Authorization Checkpoint ID**: `AUTHZ-api-suite-shared-server-001`
- **Declared Boundary**: `review`
- **Verbatim Human Instruction**: `sure lets start that` (in reply to "Next action if you agree: `pk:tasks` writes the Task Record, then the harness lands as `vitest.api.config.ts` + `globalSetup` + log shim")
- **Instruction Source**: User message, session 2026-10-23
- **Frozen Task and Milestone Scope**: Implement §4.2 of the spec in the API test harness and the
  `test:api` script; no workflow, product code, or assertion change.
- **Batch Authorization Reference**: `N/A`

- **Completion State**: `awaiting_review`
- **Acceptance Results**: `AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-8 passed; AC-7 failed with a
  pre-existing, out-of-scope cause (6 Drizzle error-shape assertions in RLS/tenancy suites); AC-9
  pending a post-merge CI run`
- **Changed-File Summary**: `server-process.ts` (new, spawn/readiness/stop seam), `global-setup.ts`
  (new, one boot + manifest + freshness guard), `test-server.ts` (shared/fallback split, file-backed
  log reads), `vitest.api.config.ts` (new, base + globalSetup), `package.json` (`test:api` gains
  `--config vitest.api.config.ts`), plus this record, the spec, and the measurement section
- **Completion Exception**: `None`
- **Completion Decision and Timestamp**: `2026-10-23 06:06 UTC — awaiting owner review; not complete
  because AC-9 needs a post-merge run and no commit is authorized`

> **Note on `docs/STATE.md`**: updated only after the measurements in AC-9 exist; `STATE.md` is
> `pk:checkpoint`'s projection and the numbers this task owes it are not measured yet.
