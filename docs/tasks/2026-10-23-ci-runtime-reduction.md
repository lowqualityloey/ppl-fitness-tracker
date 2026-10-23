# Task Record: Reduce CI runtime on both lanes without raising billed minutes

<a id="TASK-ci-runtime-reduction"></a>

## 1. Identity and Authority

- **Record Type**: `Task Record`
- **Task ID**: `TASK-ci-runtime-reduction`
- **Ceremony Level**: `Level 2 (Controlled Work)`
- **PromptKit Adaptation Profile**: `sdlc-overlay-v1`
- **Work Type**: `Configuration Work`
- **Planning Record Link**: [`PLAN-ci-runtime-reduction`](../specs/2026-10-23-spec-ci-runtime-reduction.md#PLAN-ci-runtime-reduction)
- **Planning Depth Reference**: `Full`
- **Assumption Record Links**: [`ASSUMPTION-ci-runtime-reduction-001`](../specs/2026-10-23-spec-ci-runtime-reduction.md#ASSUMPTION-ci-runtime-reduction-001), [`ASSUMPTION-ci-runtime-reduction-002`](../specs/2026-10-23-spec-ci-runtime-reduction.md#ASSUMPTION-ci-runtime-reduction-002)
- **Specification**: `docs/specs/2026-10-23-spec-ci-runtime-reduction.md`
- **External Reference**: `N/A - local Markdown tracking`
- **Owner / Actor**: Repository owner (heyLoey)
- **Execution Scope**: `.github/workflows/test.yml` plus the measurement record; single branch, single worktree.
- **Approval Boundary**: Implementation of the three workflow edits is authorized by the owner's
  "sure" reply (2026-10-23). Commit, push, PR creation, merge, and any `gh` mutation remain
  unauthorized until the owner asks.
- **Created**: `2026-10-23 03:48 UTC`

## 2. Objective and Boundaries

- **Objective**: Both CI lanes finish faster with no increase in billed runner-minutes, by caching
  Playwright browsers, aligning CI's Supabase stack with `npm run db:up`, and deleting the
  `Stop Supabase` teardown step.
- **In Scope**:
  - `.github/workflows/test.yml`: add the version probe + `actions/cache@v4` restore steps; change
    `supabase start` to use the six exclusions; remove `Stop Supabase`.
  - `docs/tasks/2026-10-23-ci-runtime-reduction.md` (this record).
- **Explicit Non-Goals**:
  - No parallel jobs, no E2E sharding, no worker-count change (raises billed minutes or `#80` flake).
  - No test, assertion, budget, or threshold change.
  - No narrowing or skipping of the `main` lane.
  - No Playwright/Supabase/Node/action major upgrade.
  - No Docker image caching, no API-suite server rework (§8 later ledger).
  - No branch protection or ruleset change.
- **Dependencies**: `actions/cache@v4` availability on GitHub-hosted runners (GitHub-owned action);
  the lock-resolved Playwright `1.63.0`. No human dependency for implementation.
- **Risk**: `Low` — three workflow edits, each revertible with `git revert`; no data, deploy, or tag.
  The main risk (a silently skipped gate) is barred by `AC-5`.
- **Verification Condition**: The proposed YAML parses; `git diff` is confined to
  `.github/workflows/test.yml`; no `continue-on-error` or `if:` appears on the install step; no test
  command changed. Lane timings are verified only by real CI runs after merge (`AC-1`–`AC-4`, `AC-6`).

## 3. Acceptance Criteria

- [ ] **AC-1**: On a cache hit, the Playwright install step is ≤ 60 s on both lanes.
  - **Result**: `Pending - requires a post-merge CI run`
  - **Evidence**: `gh run view <run-id> --json jobs` (install step duration)
- [ ] **AC-2**: On a cache miss, the install still succeeds and E2E launches a browser.
  - **Result**: `Pending - first post-merge run is the miss case`
  - **Evidence**: same command; E2E step green
- [ ] **AC-3**: `Start Supabase` is not slower than its lane baseline (153 s PR / 174 s `main`).
  - **Result**: `Pending - requires a post-merge CI run`
  - **Evidence**: same command (Start Supabase step duration)
- [ ] **AC-4**: Unit + integration, API, and E2E are green with the reduced Supabase stack.
  - **Result**: `Pending - requires a post-merge CI run`
  - **Evidence**: steps 10, 11, 13 of the same run
- [x] **AC-5**: No `continue-on-error`, no `if:` on the install step, and no test command changed.
  - **Result**: `Passed`
  - **Evidence**: `git diff .github/workflows/test.yml` (37 insertions, 4 deletions, comments + the three changes only); YAML parse reports `continue-on-error` absent and the install step's only key is `run: npx playwright install --with-deps chromium`
- [ ] **AC-6**: Job total is lower than the 1 091 s / 1 309 s baselines on the same lanes.
  - **Result**: `Pending - requires a post-merge CI run`
  - **Evidence**: `gh run view --json jobs`, `startedAt`/`completedAt`
- [ ] **AC-7**: Measured before/after table recorded in
  `docs/releases/ci-triage/ci-cost-measurement.md`; `docs/STATE.md` updated.
  - **Result**: `Pending - follows the post-merge runs`
  - **Evidence**: file contents
- [x] **AC-8**: Billed-minute direction is non-increasing: a single job, no duplicated boot.
  - **Result**: `Passed`
  - **Evidence**: the workflow still declares exactly one job (`jobs.test`); the diff adds steps, never a job

## 4. Execution Policy

- **Mode**: `Gated Mode`
- **TDD Enforcement Mode**: `disabled`
- **Batch Authorization**: `N/A`
- **Authorization Checkpoint Reference**: `AUTHZ-ci-runtime-reduction-001`
- **Soft Checkpoint**: `N/A - single sitting, well under 60 minutes`
- **Hard Checkpoint**: `N/A - single sitting`
- **Event-Driven Checkpoints**: `Scope expansion, verification failure, handoff`
- **Stop Conditions**: `Missing approval, failed verification, blocker, developer stop`
- **Host Timer Capability**: `No mechanical timer enforcement; checkpoints are conversational only`

## 5. State and Active Ownership

- **Execution State**: `awaiting_review`
- **Mapped `pk:tasks` Status**: `In Review`
- **Active Task Pointer**: `None`
- **Start Time**: `2026-10-23 03:48 UTC`
- **Current Actor**: Repository owner (heyLoey) reviews; Buffy wrote the change.
- **Next Action**: Owner reviews the workflow diff; the timing ACs then need a post-merge run on both lanes.

### Transition History

| Previous State | New State | Timestamp | Actor | Reason | Supporting Evidence |
|---|---|---|---|---|---|
| `N/A` | `planned` | `2026-10-23 03:48 UTC` | Buffy | Record created from the approved spec | `docs/specs/2026-10-23-spec-ci-runtime-reduction.md` |
| `planned` | `ready` | `2026-10-23 03:48 UTC` | Buffy | Objective, scope, non-goals, ACs, dependencies, verification, owner/approval boundary, and execution policy recorded | This record §2–§4 |
| `ready` | `in_progress` | `2026-10-23 03:48 UTC` | Buffy | Owner approved implementation with "sure" | Owner reply, 2026-10-23 |
| `in_progress` | `awaiting_review` | `2026-10-23 03:49 UTC` | Buffy | Three edits applied and statically verified; lane timings cannot be measured until the change reaches GitHub | This record §6 |

### Pending Human Actions

| Pending Action ID | Reason and Required Condition | Owner | Status | Authority Scope | Resume Condition |
|---|---|---|---|---|---|
| `PENDING-ci-runtime-reduction-001` | CI lane timings can only be measured after the change reaches GitHub | Repository owner (heyLoey) | `pending` | Authorizes commit/push/PR only if explicitly requested | A run exists on both lanes with this workflow |

- **Pending Action Retention**: `An action stays pending until its recorded condition is met and, where externally observable, verified.`
- **Reply Binding**: `An approval reply resolves only the action it was offered against.`

## 6. Evidence and Completion Gate

- **Changed Files**:
  - `.github/workflows/test.yml` - three runtime changes (cache, Supabase exclusions, teardown removal)
  - `docs/specs/2026-10-23-spec-ci-runtime-reduction.md` - the approved plan (untracked)
  - `docs/tasks/2026-10-23-ci-runtime-reduction.md` - this record (untracked)
- **Scope Change Records**: `None`
- **Checkpoint Records**: `None`
- **Handoff Records**: `None`
- **Verification Evidence**: `2026-10-23, local: python3 yaml.safe_load('.github/workflows/test.yml') → OK, 14 steps, one job; install step has no if/continue-on-error; version probe prints version=1.63.0; probe guard exits 1 with '::error::' when the command substitution yields empty (negative test executed); git diff --stat → only .github/workflows/test.yml. Not run: any CI job (nothing pushed), ESLint/typecheck (no JS/TS changed).`
- **Behavior IDs**: `N/A - exception work type`
- **TDD Intent Register**: `N/A - exception work type`
- **TDD Execution Evidence**: `N/A - exception work type`
- **TDD Exception Verification**: `Configuration Work: no product behavior to drive Red→Green; verification is YAML validity + diff review now, and measured CI runs post-merge. See docs/specs/2026-10-23-spec-ci-runtime-reduction.md §6.`
- **CI Evidence**: `Pending - post-merge`
- **Review Evidence**: `N/A - owner review is the sign-off`
- **Commit Evidence**: `N/A before commit`
- **Pull Request Evidence**: `N/A before PR`
- **Release Evidence**: `N/A`
- **Blocker and Resume Condition**: `None`

### Durable Authorization Checkpoints

<a id="AUTHZ-ci-runtime-reduction-001"></a>

- **Authorization Checkpoint ID**: `AUTHZ-ci-runtime-reduction-001`
- **Declared Boundary**: `review`
- **Verbatim Human Instruction**: `sure` (in reply to the plan's next-step offer to create the Task Record and implement the three CI workflow changes)
- **Instruction Source**: User message, session 2026-10-23
- **Frozen Task and Milestone Scope**: Implement §4.2–§4.4 of the spec in `.github/workflows/test.yml`; no commit, push, PR, or merge.
- **Batch Authorization Reference**: `N/A`

- **Completion State**: `awaiting_review`
- **Acceptance Results**: `AC-5 passed; AC-8 passed; AC-1, AC-2, AC-3, AC-4, AC-6, AC-7 pending post-merge CI runs`
- **Changed-File Summary**: `.github/workflows/test.yml` (cache + Supabase exclusions + teardown removal); spec and Task Record added under `docs/`
- **Completion Exception**: `None`
- **Completion Decision and Timestamp**: `N/A - not complete; awaiting owner review and post-merge CI evidence`

> **Note on `docs/STATE.md`**: the spec's M3 records the measured lane facts there after the post-merge
> runs. It is not edited here — `STATE.md` is `pk:checkpoint`'s projection, and the numbers this task
> owes it do not exist yet.
