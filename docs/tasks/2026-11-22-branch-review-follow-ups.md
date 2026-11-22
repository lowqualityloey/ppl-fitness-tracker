# Task Record: Clear the branch review's queued follow-ups (F-1 to F-5)

<a id="TASK-branch-review-follow-ups"></a>

## 1. Identity and Authority

- **Record Type**: `Task Record`
- **Task ID**: `TASK-branch-review-follow-ups`
- **Ceremony Level**: `Level 2 (Controlled Work)`
- **PromptKit Adaptation Profile**: `sdlc-overlay-v1`
- **Work Type**: `Documentation Work`
- **Work Type Note**: The register is mixed by construction. F-1 adds a workflow (configuration), F-2 corrects three documents (documentation), F-4 and the F-5 child leak change code under `tests/` and `scripts/`. The record is filed as Documentation Work because its first deliverable is the corrected record set; each code item must add its own measured evidence and its own TDD decision before it is executed, and F-5 already requires a separate record.
- **Planning Record Link**: [PLAN-promptkit-v2-4-upgrade](../specs/2026-11-22-spec-promptkit-v2-4-upgrade.md#PLAN-promptkit-v2-4-upgrade)
- **Planning Depth Reference**: `Minimal`
- **Assumption Record Links**: `None`
- **Specification**: `docs/specs/2026-11-22-spec-promptkit-v2-4-upgrade.md`
- **External Reference**: `N/A - local Markdown tracking; no issue filed`
- **Owner / Actor**: `Agent (DeepSeek Harness / lead)`
- **Execution Scope**: `ppl-fitness-tracker, branch chore/promptkit-v2-sync, one worktree`
- **Approval Boundary**: `The owner's instruction at m03192 ("do next steps 1 and 3") authorizes opening this record and executing F-3. Every other item needs a fresh go-ahead before it runs, and F-1 and F-4 need it explicitly because they change CI and shared test infrastructure. Commit, push, PR, merge, tag, release, deploy, and any action outside this repository require explicit human confirmation.`
- **Created**: `2026-11-22 08:45 UTC`

> This Local Task Source is authoritative for Controlled Work. The Planning Record supplies context only; it does not control readiness, execution state, active ownership, completion, or approval.

## 2. Objective and Boundaries

- **Objective**: `Convert the five findings the branch review left queued into tracked, individually verifiable work: F-1 the missing governance CI, F-2 the three evidence defects in the API-suite documents, F-3 the docs/STATE.md reconciliation against origin/main, F-4 the fixtures.ts anon-key fallback and the missing preflight check, and F-5 the six pre-existing Drizzle/RLS failures plus the owned-child leak. Each item closes on measured evidence, not on an assertion that it was addressed.`
- **In Scope**:
  - `.github/workflows/` - the governance workflow F-1 adds, and the `paths-ignore` cost control in `test.yml` it must not silently undo
  - `docs/specs/2026-11-19-spec-api-suite-hardening.md` - F-2: the 31-to-36 test count, the AC-13 row, and G5's scope
  - `docs/tasks/2026-11-19-api-suite-hardening.md` - F-2: AC-11's evidence and the 31-to-36 count in the completion gate
  - `tests/integration/api/fixtures.ts` - F-4: remove the anon-key fallback and the `process.env` assignment
  - `scripts/preflight.ts` - F-4: the missing anon-key check
  - `tests/integration/api/test-server.ts` - F-5: stop the owned child on a failed spawn
  - `docs/tasks/` - the separate record F-5 requires for the six Drizzle/RLS failures
  - `docs/STATE.md` - section 1 Last Updated, the section 3A projection, and the section 8 session row
  - `docs/tasks/2026-11-22-branch-review-follow-ups.md` - this Task Record
  - `docs/reviews/2026-11-22-promptkit-v2-sync-branch.md` - the findings register this record consumes, read only
- **Explicit Non-Goals**:
  - Application source, schema, auth, API, database, or runtime changes of any kind
  - Re-reviewing the branch or re-opening findings the review already closed
  - Fixing the six Drizzle/RLS failures inside this record (F-5 needs its own record with its own reproduction)
  - Changing `test.yml`'s `paths-ignore` cost control, or accepting a docs-only CI cost without the measurement that justified the ignore list
  - Pinning `origin/main` instead of tag `v2.4.0`, or greening the doctor's `STALE(+12)` row
  - Release, tag creation, publication, deployment, or any remote action
- **Dependencies**: `The review report on disk (it is currently untracked, so this record's citation resolves only while the file exists). F-4 needs a reachable Supabase local stack to prove the removal does not break the green lane; the host's Docker port publishing was broken on 2026-11-20 and was working again when the reviewer measured on 2026-11-22, so the stack state must be re-established rather than assumed.`
- **Risk**: `Medium overall, concentrated in two items. F-1 can reintroduce the docs-only CI cost that paths-ignore was added to remove, so it needs its own cost reasoning. F-4 changes how every one of the thirteen API test files resolves its anon key, and a mistake turns a named error into a collection-time crash. F-2 and F-5's record are documentation and carry no runtime risk.`
- **Verification Condition**: `bash .promptkit/scripts/validate-references.sh --strict exits 0; bash .promptkit/scripts/validate-execution-control.sh --root . exits 0 with VALID; bash .promptkit/scripts/check-setup-assert.sh . .promptkit .promptkit exits 0; bash .promptkit/scripts/check-doctor.sh . reports docs-drift OK; npm run typecheck and eslint --max-warnings=0 . exit 0; and, for the code items only, npm run test:api returns 14 files / 84 tests green against a reachable stack.`

## 3. Acceptance Criteria

- [ ] **AC-1** (F-1): A governance workflow exists that runs the three governance validators on changes to the governance surface.
  - **Result**: `Pending`
  - **Evidence**: will be `grep -n 'validate-references\|validate-execution-control\|check-setup-assert' .github/workflows/<new>.yml` plus a parse check of the file
- [ ] **AC-2** (F-1): The governance workflow's `paths` cover `docs/**`, `**/*.md`, `PROMPTKIT.md`, the five host directives, and `.promptkit`, so a governance-only commit runs at least one workflow.
  - **Result**: `Pending`
  - **Evidence**: will be the workflow's `on:` block read against `git show --name-only` for the four v2.4.0 commits, which currently trigger nothing
- [ ] **AC-3** (F-1): The workflow is cheap by construction - one job, no browser download, no service containers - and the record states what it adds to the measured CI cost that `paths-ignore` was created to reduce.
  - **Result**: `Pending`
  - **Evidence**: will be the job definition plus a written cost comparison against `docs/releases/ci-triage/ci-cost-measurement.md`
- [x] **AC-4** (F-2): `docs/specs/2026-11-19-spec-api-suite-hardening.md` states 36 tests, not 31, in the M2 seam-hardening line.
  - **Result**: `PASS`
  - **Evidence**: `grep -cE '^\s+it\(' tests/unit/infra/api-harness.test.ts` → 36; `grep -n '36 tests' docs/specs/2026-11-19-spec-api-suite-hardening.md` → `:345: **Done** — 14 files / 84 tests green, 111.06 s; tests/unit/infra/api-harness.test.ts 36 tests`. The line keeps the 31 as a milestone count with its reason rather than dropping it, so the intermediate state stays visible.
- [x] **AC-5** (F-2): The spec's AC-13 row cites the Task Record for the counts instead of restating `632/638`.
  - **Result**: `PASS`
  - **Evidence**: `grep -c '632/638' docs/specs/2026-11-19-spec-api-suite-hardening.md` → 0; the row at `:383` now reads "the counts and their two measurement dates live in the Task Record's AC-13 evidence, which is the single source for them". The record's AC-13 gained an annotation stating that `663/669` was measured at the 31-test intermediate state and that the same lane reads `668 passed (674)` at the delivered 36.
- [x] **AC-6** (F-2): The Task Record's AC-11 evidence is a diff scoped to `544081d`, not a working-tree status, and it names `560ebde` as the workflow change that rides the branch under `TASK-ci-runtime-reduction`.
  - **Result**: `PASS`
  - **Evidence**: `git diff --stat 544081d^...544081d -- .github/workflows/` → 0 lines. `git diff --stat origin/main...HEAD -- .github/workflows/test.yml` → 1 file, 46 insertions, 4 deletions, attributed by `git log` to `560ebde`. The record's AC-11 keeps its original working-tree evidence verbatim and appends a dated "Correction, 2026-11-22 (branch review F1)" note carrying both measurements, so the original claim is auditable rather than overwritten.
- [x] **AC-7** (F-2): G5 in the spec is scoped to `544081d`, and the record's completion gate says 36 unit tests.
  - **Result**: `PASS`
  - **Evidence**: `grep -n 'G5' docs/specs/2026-11-19-spec-api-suite-hardening.md` → `:143: **G5** — No test body, assertion, budget, threshold, or workflow file changes **in 544081d**.` with the `560ebde` carve-out on the three lines below; the §2 Scope Boundary carries the same carve-out. `grep -n '31 unit tests' docs/tasks/2026-11-19-api-suite-hardening.md` → no match; the completion gate now reads 36 with the 31 kept as the intermediate state. Spec AC-11's evidence was also repointed to the scoped diff, which is the same claim at its second site.
- [ ] **AC-8** (F-3): `docs/STATE.md` is main's split tracker with section 3A re-added, and the projection still agrees with its canonical record.
  - **Result**: `PASS` - satisfied at `cd745d2`: `docs/STATE.md` is 224 lines against main's 188-line skeleton plus `docs/STATE-ARCHIVE.md` (2724 lines), section 3A sits at line 66 and names `TASK-promptkit-v2-4-upgrade`, `git rev-list --left-right --count origin/main...HEAD` reads `0 21`, and `check-doctor` reports `docs-drift OK`.
  - **Evidence**: `git rev-list --left-right --count origin/main...HEAD; wc -l docs/STATE.md docs/STATE-ARCHIVE.md; grep -n '3A\. Execution-Control' docs/STATE.md; bash .promptkit/scripts/check-doctor.sh .`
- [ ] **AC-9** (F-3): `docs/STATE.md` section 9 is one five-column table, so the validator's orphan-row and column checks pass.
  - **Result**: `PASS` - satisfied at `cd745d2`: main's two one-row tables separated by a blank line became a single table holding both rows, and `validate-execution-control.sh --root .` returns `VALID|RECORDS=7|ROOT=.` exit 0.
  - **Evidence**: `bash .promptkit/scripts/validate-execution-control.sh --root .`
- [ ] **AC-10** (F-4): `tests/integration/api/fixtures.ts` defines no anon-key fallback and assigns nothing to `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY`.
  - **Result**: `Pending`
  - **Evidence**: will be `grep -n 'SUPABASE_ANON_KEY' tests/integration/api/fixtures.ts` showing no fallback literal and no `??=` assignment on that variable
- [ ] **AC-11** (F-4): `scripts/preflight.ts` fails with a named error when `NEXT_PUBLIC_SUPABASE_ANON_KEY` is absent, so the guard survives the removal of the fallback.
  - **Result**: `Pending`
  - **Evidence**: will be a run of `scripts/preflight.ts` with the variable unset, showing the named error rather than a downstream authentication failure
- [ ] **AC-12** (F-4): `npm run test:api` still returns 14 files / 84 tests green with the key set, so the removal does not break the reachable-stack path.
  - **Result**: `Pending`
  - **Evidence**: will be `npm run test:api` against a reachable local stack
- [ ] **AC-13** (F-5): A separate Task Record exists for the six pre-existing Drizzle/RLS failures, reproducing them from `81fdd3c`'s dependency move rather than describing them.
  - **Result**: `Pending`
  - **Evidence**: will be the new record path plus its own `validate-execution-control` acceptance
- [ ] **AC-14** (F-5): `tests/integration/api/test-server.ts` stops the owned child when its spawn fails, so a failed boot cannot leave `next dev` holding port 3101.
  - **Result**: `Pending`
  - **Evidence**: will be the corrected catch block plus a measured run that fails the boot and then shows nothing listening on 3101
- [ ] **AC-15** (scope): No application source, schema, auth, API, database, or runtime file changed, and `test.yml`'s `paths-ignore` cost control is untouched.
  - **Result**: `Pending`
  - **Evidence**: will be `git diff --name-only <base>..HEAD | grep -E '^(app|lib|src|components|supabase)/'` returning nothing and `git diff <base>..HEAD -- .github/workflows/test.yml` returning nothing

## 4. Execution Policy

- **Mode**: `Gated Mode`
- **TDD Enforcement Mode**: `disabled`
- **Batch Authorization**: `N/A - each item needs its own go-ahead; the record authorizes nothing by itself`
- **Authorization Checkpoint Reference**: `N/A - pre-PR`
- **Soft Checkpoint**: `Around 60 minutes of execution, or at the first code item (F-4 or F-5's leak), whichever comes first`
- **Hard Checkpoint**: `At or before 90 minutes, or before any commit if a gate is red for a reason this record did not cause`
- **Event-Driven Checkpoints**: `Milestone, task switch, scope expansion, handoff, compaction, or context drift`
- **Stop Conditions**: `Missing go-ahead for an individual item; F-4 attempted without a reachable Supabase stack, because the green lane cannot be re-measured; F-1 attempted without a cost comparison against the paths-ignore measurement; an unexpected file in a diff-scope gate; a failed governance gate not covered by a recorded red; hard checkpoint; developer stop`
- **Host Timer Capability**: `The host cannot mechanically enforce checkpoints or terminate the session; timing is recorded, never enforced.`

## 5. State and Active Ownership

- **Execution State**: `in_progress`
- **Mapped `pk:tasks` Status**: `In Progress`
- **Active Task Pointer**: `TASK-branch-review-follow-ups`
- **Start Time**: `2026-11-22 09:33 UTC`
- **Current Actor**: `Agent (DeepSeek Harness / lead)`
- **Next Action**: `F-2 is complete at this revision (AC-4 through AC-7 PASS, four falsified or unscoped claims corrected across two documents). Next is F-1, the governance workflow, which cannot be closed without the written cost comparison AC-3 requires against docs/releases/ci-triage/ci-cost-measurement.md. After F-1: F-4, which needs a reachable Supabase local stack, then F-5's separate record for the six Drizzle/RLS failures plus the owned-child leak.`
- **Branch / Revision**: `chore/promptkit-v2-sync @ a08edf9`

### Transition History

| Previous State | New State | Timestamp | Actor | Reason | Supporting Evidence |
|---|---|---|---|---|---|
| `None` | `planned` | 2026-11-22 08:45 UTC | Agent (DeepSeek Harness / lead) | Owner instruction at m03192 ("do next steps 1 and 3") asked for this record and for F-3; F-3 was executed first because the merge was already in progress, and this record registers the five findings as tracked work | section 2 Objective; section 3 Acceptance Criteria |
| `planned` | `in_progress` | 2026-11-22 09:33 UTC | Agent (DeepSeek Harness / lead) | Owner instruction at m03699 ("1") selected the offered next step, executing F-2; the record takes the active pointer because F-2 is work under it and the remaining items stay open | AC-4 through AC-7 PASS; section 6 Verification Evidence |

## 6. Evidence and Completion Gate

- **Changed Files**:
  - `.github/workflows/` - the governance workflow F-1 adds
  - `docs/specs/2026-11-19-spec-api-suite-hardening.md` - F-2 corrections
  - `docs/tasks/2026-11-19-api-suite-hardening.md` - F-2 corrections
  - `tests/integration/api/fixtures.ts` - F-4 fallback removal
  - `scripts/preflight.ts` - F-4 anon-key check
  - `tests/integration/api/test-server.ts` - F-5 owned-child leak
  - `docs/tasks/` - the separate F-5 record
  - `docs/STATE.md` - section 1, section 3A and section 8 rows
  - `docs/tasks/2026-11-22-branch-review-follow-ups.md` - this record
- **Scope Change Records**: `None`
- **Checkpoint Records**: `None`
- **Handoff Records**: `None`
- **Verification Evidence**: `F-2 measured 2026-11-22 09:33 UTC on a08edf9 with the F-2 edits applied: grep -cE '^\s+it\(' tests/unit/infra/api-harness.test.ts = 36; grep -c '632/638' docs/specs/2026-11-19-spec-api-suite-hardening.md = 0; grep '31 unit tests' docs/tasks/2026-11-19-api-suite-hardening.md = no match; git diff --stat 544081d^...544081d -- .github/workflows/ = 0 lines. Gates after the edits: validate-references.sh --strict exit 0 (420 markdown files valid); validate-execution-control.sh --root . exit 0 VALID|RECORDS=8|ROOT=.. The pre-work baseline at cd745d2 was validate-references exit 0, validate-execution-control VALID|RECORDS=7 exit 0, check-setup-assert ASSERT|submodule|status|OK exit 0, check-doctor exit 1 on version STALE(+12) alone with submodule OK and docs-drift OK. No code item has been verified yet; AC-1, AC-2, AC-3 and AC-10 through AC-15 read Pending by design.`
- **Behavior IDs [Required when enabled]**: `N/A - exception work type`
- **TDD Intent Register [Required when enabled]**: `N/A - exception work type`
- **TDD Execution Evidence [Required when enabled]**: `N/A - exception work type`
- **TDD Exception Verification [Required for Documentation, Configuration, or Research Work; Not applicable for Code Work]**: `The documentation and configuration items have no behaviour seam to drive Red-Green-Refactor; their verification is the governance gate sweep plus the per-item commands in section 3. F-4 and the F-5 child leak do change code, so each must state its own TDD decision before it executes and may not inherit this record's disabled mode by default.`
- **CI Evidence**: `N/A - no PR or CI run; no governance workflow exists, which is F-1 itself`
- **Review Evidence**: `docs/reviews/2026-11-22-promptkit-v2-sync-branch.md - a Level 2 review of the branch with verdict Changes Requested and no BLOCKING findings. Its F1, F2, F3, F4 and F5 are the source of this record's items, each with a measured reproduction, and the specification's section 9 (follow-ups this plan does not do) is the queued list they came from. The report is currently untracked; committing it is a separate step the owner has not authorized.`
- **Commit Evidence**: `cd745d2 chore(state): merge origin/main and reconcile the split tracker - F-3, 6 files, already landed. a08edf9 docs(promptkit): register the branch review follow-ups - this record plus the §3A repoint, 2 files. F-2's corrections land as one further docs(api-suite) commit on this branch, subject docs(api-suite): correct the three falsified or unscoped claims (branch review F-2); a commit cannot name its own SHA, so it is identified by subject, and no later item has a commit yet.`
- **Pull Request Evidence**: `N/A - no pull request was opened for this branch; work is reviewed on the local branch (human-confirmed at m03192)`
- **Release Evidence**: `N/A - no release, tag, or deployment action is in scope`
- **Blocker and Resume Condition**: `Blocked on owner go-ahead per item. Resume when the owner names an item; F-4 additionally requires a reachable Supabase local stack, and F-1 requires the cost comparison in AC-3.`

## 7. Completion Gate

- **Completion State**: `N/A - record is in_progress; F-2 is done, F-1, F-4 and F-5 remain`
- **Acceptance Results**: `Six of fifteen criteria read PASS: AC-4, AC-5, AC-6 and AC-7 on F-2 executed this session, and AC-8 and AC-9 on F-3 landed at cd745d2. AC-1, AC-2, AC-3 and AC-10 through AC-15 read Pending; none was evaluated and none is claimed.`
- **Changed-File Summary**: `F-2 is two documents, 15 insertions and 7 deletions: docs/specs/2026-11-19-spec-api-suite-hardening.md (18 lines changed - M2's test count, G5's scope plus the 560ebde carve-out, the §2 Scope Boundary sentence, the AC-11 evidence, the AC-13 row) and docs/tasks/2026-11-19-api-suite-hardening.md (4 lines - AC-11's correction note, AC-13's annotation, the Acceptance Results count). No other path changed.`
- **Completion Exception**: `None`
- **Completion Decision and Timestamp**: `N/A - no completion decision has been taken`

A task may be marked `completed` only after acceptance results, verification evidence, changed-file summary, and required commit evidence are linked. This record authorizes nothing beyond the Approval Boundary in section 1.
