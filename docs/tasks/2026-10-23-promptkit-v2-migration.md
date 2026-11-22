# Task Record: PromptKit OS v2 migration

<a id="TASK-2026-10-23-promptkit-v2-migration"></a>

## 1. Identity and Authority

- **Record Type**: `Task Record`
- **Task ID**: `TASK-2026-10-23-promptkit-v2-migration`
- **Ceremony Level**: `Level 2 (Controlled Work)`
- **PromptKit Adaptation Profile**: `none`
- **Work Type**: `Configuration Work`
- **Specification**: `docs/specs/2026-10-23-spec-promptkit-v2-migration.md`
- **External Reference (Optional)**: `N/A`
- **Owner / Actor**: `Agent (Codebuff/Buffy)`
- **Execution Scope**: `ppl-fitness-tracker, branch chore/promptkit-v2-sync`
- **Approval Boundary**: `Human confirmation required for push, PR, merge, release, deploy, or any action outside this repository.`
- **Created**: `2026-10-22 22:57 UTC`

## 2. Objective and Boundaries

- **Objective**: `Migrate the .promptkit engine from v1.8.0-15 to v2.0.0-71 (0cfa093), refresh the five installed host directives, add the v2 profile fields, and leave the installed governance gates green.`
- **In Scope**:
  - `.promptkit` - engine gitlink and checkout
  - `.gitmodules` - canonical promptkit-os URL
  - `AGENTS.md` - managed directive block
  - `CLAUDE.md` - managed directive block
  - `.opencode/rules.md` - managed directive block
  - `.github/copilot-instructions.md` - managed directive block
  - `.clinerules/promptkit.md` - managed directive block
  - `PROMPTKIT.md` - profile fields, engine row, measured counts
  - `docs/STATE.md` - engine row, session log, current branch
  - `docs/specs/2026-10-23-spec-promptkit-v2-migration.md` - plan and execution record
  - `docs/reviews/2026-10-23-promptkit-v2-migration-plan-review.md` - two-axis review
  - `docs/reviews/2026-10-21-promptkit-os-install-audit.md` - pre-migration audit
  - `docs/tasks/m4/M4-29-first-release.checkpoint-03.md` - baseline checkpoint
  - `docs/tasks/2026-10-23-promptkit-v2-migration.md` - this Task Record
  - `docs/tasks/SCOPE-2026-10-23-promptkit-v2-migration-001.md` - approved §3A scope change
- **Explicit Non-Goals**:
  - Application source, schema, auth, API, database, or runtime changes
  - The C6 PromptKit Governance CI workflow
  - Bulk conversion of the 76 legacy `docs/tasks/` cards
  - A completed intake record
  - Release, tag, deployment, or production action
- **Dependencies**: `Upstream promptkit-os 0cfa093; owner instruction to migrate; no external service.`
- **Risk**: `Low - governance/documentation only, reversible with git, no application code or data touched.`
- **Verification Condition**: `bash .promptkit/scripts/check-doctor.sh . exits 0; bash .promptkit/scripts/validate-references.sh exits 0; bash .promptkit/scripts/validate-execution-control.sh --root . exits 0.`

## 3. Acceptance Criteria

- [x] **AC-1**: Engine is pinned at `0cfa093` and `.gitmodules` names `promptkit-os`.
  - **Result**: `PASS`
  - **Evidence**: `git -C .promptkit describe --tags --match 'v[0-9]*'` -> `v2.0.0-71-g0cfa093`.
- [x] **AC-2**: All five host directives carry the v2 Engine stamp.
  - **Result**: `PASS`
  - **Evidence**: `rg '^Engine: v2.0.0-71-g0cfa093 \(0cfa093\)' AGENTS.md CLAUDE.md .opencode/rules.md .github/copilot-instructions.md .clinerules/promptkit.md`.
- [x] **AC-3**: `PROMPTKIT.md` has one `Profile written` date, no `Installed` line, and the five v2 machine fields, including `size: large`.
  - **Result**: `PASS`
  - **Evidence**: `rg '^(profile|status-cards|card-style|ai-attribution|size|intake-status|tracking):' PROMPTKIT.md` -> `size: large` present.
- [x] **AC-4**: `docs/STATE.md` has the Engine row, one current branch field, and a valid §8 table.
  - **Result**: `PASS`
  - **Evidence**: `validate-execution-control.sh --root .` -> `VALID|RECORDS=2`.
- [x] **AC-5**: `pk:doctor` passes its configured checks.
  - **Result**: `PASS`
  - **Evidence**: `check-doctor.sh` exit 0; `version OK`; `docs-drift` `OK`; `provenance` `SKIP(intake-status: legacy-partial)`.
- [x] **AC-6**: Reference integrity passes.
  - **Result**: `PASS`
  - **Evidence**: `validate-references.sh` exit 0.
- [x] **AC-7**: No application source is changed by the migration commits.
  - **Result**: `PASS`
  - **Evidence**: `git diff --name-only 9f7e5f2..HEAD` lists only governance, profile, and documentation paths.
- [x] **AC-8**: The plan and review are recorded.
  - **Result**: `PASS`
  - **Evidence**: `docs/specs/2026-10-23-spec-promptkit-v2-migration.md`; `docs/reviews/2026-10-23-promptkit-v2-migration-plan-review.md`.

## 4. Execution Policy

- **Mode**: `Gated Mode`
- **TDD Enforcement Mode**: `disabled`
- **Batch Authorization**: `N/A - single-owner instruction`
- **Authorization Checkpoint Reference**: `N/A - pre-PR`
- **Soft Checkpoint**: `N/A - completed in one session`
- **Hard Checkpoint**: `N/A - completed in one session`
- **Event-Driven Checkpoints**: `Milestone, scope expansion, handoff, or context drift`
- **Stop Conditions**: `Missing approval, failed verification, or developer stop`
- **Host Timer Capability**: `Host timer cannot mechanically enforce checkpoints or terminate the session; no forced termination is available.`

## 5. State and Active Ownership

- **Execution State**: `awaiting_review`
- **Mapped `pk:tasks` Status**: `In Review`
- **Active Task Pointer**: `None`
- **Start Time**: `2026-10-22 22:57 UTC`
- **Current Actor**: `Agent (Codebuff/Buffy)`
- **Next Action**: `Owner confirms merge order, then authorizes opening the PR; the C6 governance CI remains out of scope.`
- **Branch / Revision**: `chore/promptkit-v2-sync`

### Transition History

| Previous State | New State | Timestamp | Actor | Reason | Supporting Evidence |
|---|---|---|---|---|---|
| `None` | `planned` | 2026-10-22 22:40 UTC | Agent | Owner requested the migration | Plan |
| `planned` | `in_progress` | 2026-10-22 22:45 UTC | Agent | Execution started | Commit C1 |
| `in_progress` | `awaiting_review` | 2026-10-22 22:57 UTC | Agent | Gates green; owner decisions remain | Doctor, references, validator |

## 6. Evidence and Completion Gate

- **Changed Files**:
  - `.promptkit` - engine gitlink
  - `.gitmodules` - canonical URL
  - `AGENTS.md` - managed directive block
  - `CLAUDE.md` - managed directive block
  - `.opencode/rules.md` - managed directive block
  - `.github/copilot-instructions.md` - managed directive block
  - `.clinerules/promptkit.md` - managed directive block
  - `PROMPTKIT.md` - profile fields and measured counts
  - `docs/STATE.md` - engine row, session log, current branch
  - `docs/specs/2026-10-23-spec-promptkit-v2-migration.md` - plan and execution record
  - `docs/reviews/2026-10-23-promptkit-v2-migration-plan-review.md` - review
  - `docs/reviews/2026-10-21-promptkit-os-install-audit.md` - audit
  - `docs/tasks/m4/M4-29-first-release.checkpoint-03.md` - baseline checkpoint
  - `docs/tasks/2026-10-23-promptkit-v2-migration.md` - this record
  - `docs/tasks/SCOPE-2026-10-23-promptkit-v2-migration-001.md` - approved §3A scope change
- **Scope Change Records**: `SCOPE-2026-10-23-promptkit-v2-migration-001`
- **Checkpoint Records**: `None`
- **Handoff Records**: `None`
- **Verification Evidence**: `check-doctor.sh exit 0 (version OK; docs-drift OK; provenance SKIP); validate-references.sh exit 0; validate-execution-control.sh --root . exit 0 with VALID|RECORDS=2; git diff --check exit 0.`
- **Behavior IDs [Required when enabled]**: `N/A - exception work type`
- **TDD Intent Register [Required when enabled]**: `N/A - exception work type`
- **TDD Execution Evidence [Required when enabled]**: `N/A - exception work type`
- **TDD Exception Verification [Required for Documentation, Configuration, or Research Work; Not applicable for Code Work]**: `N/A - no behavior seam; governance/documentation-only change`
- **CI Evidence**: `N/A - no PR or CI run; local governance gates passed`
- **Review Evidence**: `[REVIEW-2026-10-23-promptkit-v2-migration-plan](../reviews/2026-10-23-promptkit-v2-migration-plan-review.md#REVIEW-2026-10-23-promptkit-v2-migration-plan)`
- **Commit Evidence**: `9f7e5f2 baseline; 4b39636 engine pin; 427a049 host/profile; c80b5be state repair; 6c63325 execution record; 8ac503d current branch; 70e8fba size/Task Record`
- **Pull Request Evidence**: `N/A - not opened`
- **Release Evidence**: `N/A - no release action`
- **Blocker and Resume Condition**: `None`
- **Completion State**: `awaiting_review`
- **Acceptance Results**: `AC-1 PASS; AC-2 PASS; AC-3 PASS; AC-4 PASS; AC-5 PASS; AC-6 PASS; AC-7 PASS; AC-8 PASS`
- **Changed-File Summary**: `Eight governance/docs commits; no application source, schema, auth, API, database, or runtime file changed.`
- **Completion Exception**: `None`
- **Completion Decision and Timestamp**: `Awaiting human review - 2026-10-22 22:57 UTC`
