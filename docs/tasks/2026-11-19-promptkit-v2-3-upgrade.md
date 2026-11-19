# Task Record: Upgrade the PromptKit OS engine to v2.3.0

<a id="TASK-promptkit-v2-3-upgrade"></a>

## 1. Identity and Authority

- **Record Type**: `Task Record`
- **Task ID**: `TASK-promptkit-v2-3-upgrade`
- **Ceremony Level**: `Level 2 (Controlled Work)`
- **PromptKit Adaptation Profile**: `sdlc-overlay-v1`
- **Work Type**: `Configuration Work`
- **Planning Record Link**: [PLAN-promptkit-v2-3-upgrade](../specs/2026-11-19-spec-promptkit-v2-3-upgrade.md#PLAN-promptkit-v2-3-upgrade)
- **Planning Depth Reference**: `Full`
- **Assumption Record Links**: `None`
- **Specification**: `docs/specs/2026-11-19-spec-promptkit-v2-3-upgrade.md`
- **External Reference**: `N/A - local Markdown tracking; no issue filed`
- **Owner / Actor**: `Agent (DeepSeek Harness / lead)`
- **Execution Scope**: `ppl-fitness-tracker, branch chore/promptkit-v2-sync, one worktree`
- **Approval Boundary**: `Owner ratification of the plan's decisions D1-D7 and open decisions O1-O3 is required before S0 runs. Commit, push, PR, merge, tag, release, deploy, and any action outside this repository require explicit human confirmation.`
- **Created**: `2026-11-19 08:50 UTC`

> This Local Task Source is authoritative for Controlled Work. The Planning Record supplies context only; it does not control readiness, execution state, active ownership, completion, or approval.

## 2. Objective and Boundaries

- **Objective**: `Move the .promptkit engine from 0cfa093 (v2.0.0-71) to tag v2.3.0 (52adbe1), re-inject the five host directives, complete the four hand-maintained claims the installer never touches, and leave every installed governance gate green or its red recorded with a measured cause.`
- **In Scope**:
  - `.promptkit` - engine gitlink and detached checkout at 52adbe1
  - `AGENTS.md` - managed directive block re-injection
  - `CLAUDE.md` - managed directive block re-injection
  - `.opencode/rules.md` - managed directive block re-injection
  - `.clinerules/promptkit.md` - managed directive block re-injection
  - `.github/copilot-instructions.md` - managed directive block re-injection
  - `PROMPTKIT.md` - engine prose, directive-block md5, and the v2.3.0 untrusted-content bullet
  - `docs/STATE.md` - Engine Version row, Last Updated, session-log row, section 3A projection
  - `eslint.config.mjs` - globalIgnores entry for the vendored engine (S6)
  - `docs/tasks/2026-10-23-ci-runtime-reduction.md` - link-label and In Scope repair (S5)
  - `docs/tasks/2026-10-23-api-suite-shared-server.md` - link-label and In Scope repair (S5)
  - `docs/specs/2026-11-19-spec-promptkit-v2-3-upgrade.md` - the Planning Record this task consumes
  - `docs/tasks/2026-11-19-promptkit-v2-3-upgrade.md` - this Task Record
- **Explicit Non-Goals**:
  - Application source, schema, auth, API, database, or runtime changes of any kind
  - The PromptKit Governance CI workflow (follow-up F-1, needs its own workflow with explicit paths)
  - Implementation of the queued API-suite review findings in docs/reviews/2026-11-19-api-suite-shared-server.md
  - A profile, tracking, or intake-status change; turbo and github stay as installed
  - Bulk conversion of the legacy docs/tasks cards
  - Release, tag creation, publication, deployment, or any remote action
- **Dependencies**: `Upstream promptkit-os tag v2.3.0 (52adbe1) reachable by fetch; owner ratification of D1-D7 and O1-O3; no external service, no credential.`
- **Risk**: `Low - governance and documentation only, no application code or data, fully reversible with git. Residual risk is scope drift during the installer run, mitigated by the S4 diff-scope gate.`
- **Verification Condition**: `bash .promptkit/scripts/check-setup-assert.sh . .promptkit .promptkit exits 0; bash .promptkit/scripts/validate-references.sh --strict exits 0; bash .promptkit/scripts/validate-execution-control.sh --root . exits 0; npm run typecheck and npm run lint exit 0.`

## 3. Acceptance Criteria

- [ ] **AC-1**: Engine is at 52adbe1 and git describe --tags --match 'v[0-9]*' returns v2.3.0.
  - **Result**: `Pending`
  - **Evidence**: `git -C .promptkit rev-parse HEAD; git -C .promptkit describe`
- [ ] **AC-2**: .gitmodules names promptkit-os and git submodule status has no leading plus or minus.
  - **Result**: `Pending`
  - **Evidence**: `cat .gitmodules; git submodule status`
- [ ] **AC-3**: All five host directives carry the v2.3.0 engine stamp.
  - **Result**: `Pending`
  - **Evidence**: `grep -c 'Engine: v2.3.0 (52adbe1)' across the five files`
- [ ] **AC-4**: The Untrusted Content guardrail appears exactly once in each of the five directives.
  - **Result**: `Pending`
  - **Evidence**: `grep -c 'Untrusted Content' = 1 in each file`
- [ ] **AC-5**: The nextjs-agent-rules block in AGENTS.md is byte-identical to HEAD.
  - **Result**: `Pending`
  - **Evidence**: `git diff -- AGENTS.md shows only the three PromptKit hunks`
- [ ] **AC-6**: PROMPTKIT.md has one profile line, one tracking line, and Engine prose naming 52adbe1 and v2.3.0.
  - **Result**: `Pending`
  - **Evidence**: `grep -c '^profile:' = 1; grep -c '^tracking:' = 1; grep -n 'Engine:'`
- [ ] **AC-7**: PROMPTKIT.md's directive-block md5 matches the block on disk, identically across all five hosts.
  - **Result**: `Pending`
  - **Evidence**: `awk '/<!-- PROMPTKIT_START -->/,/<!-- PROMPTKIT_END -->/' <file> | md5sum, five times`
- [ ] **AC-8**: docs/STATE.md Engine Version reads v2.3.0; section 3A projects TASK-promptkit-v2-3-upgrade
  and satisfies the widened 10-pair projection contract (zero STATE_PROJECTION_MISMATCH rows); and
  check-doctor.sh reports docs-drift OK.
  - **Result**: `Pending`
  - **Evidence**: `grep; bash .promptkit/scripts/check-doctor.sh .`
- [ ] **AC-9**: The diff is exactly the expected file set across two commits: the engine move carries the
  gitlink in the same commit as the directives, and the section 3A repoint lands separately.
  - **Result**: `Pending`
  - **Evidence**: `git show --stat`
- [ ] **AC-10**: validate-references.sh --strict exits 0. The strict flag exists only from v2.1.0, so its availability is itself part of the evidence.
  - **Result**: `Pending`
  - **Evidence**: `bash .promptkit/scripts/validate-references.sh --strict`
- [ ] **AC-11**: validate-execution-control.sh --root . exits 0 with VALID, or the remaining red is recorded with its cause.
  - **Result**: `Pending`
  - **Evidence**: `bash .promptkit/scripts/validate-execution-control.sh --root .`
- [ ] **AC-12**: check-doctor.sh reports every row OK except version STALE(+5), whose cause is recorded.
  - **Result**: `Pending`
  - **Evidence**: `bash .promptkit/scripts/check-doctor.sh .`
- [ ] **AC-13**: check-setup-assert.sh exits 0 after the gitlink commit.
  - **Result**: `Pending`
  - **Evidence**: `bash .promptkit/scripts/check-setup-assert.sh . .promptkit .promptkit`
- [ ] **AC-14**: npm run typecheck and npm run lint both exit 0.
  - **Result**: `Pending`
  - **Evidence**: `npm run typecheck; npm run lint`
- [ ] **AC-15**: No application source, test, schema, or CI runtime file changed.
  - **Result**: `Pending`
  - **Evidence**: `git show --stat scope check against this record's In Scope list`

## 4. Execution Policy

- **Mode**: `Gated Mode`
- **TDD Enforcement Mode**: `disabled`
- **Batch Authorization**: `N/A - single-owner instruction`
- **Authorization Checkpoint Reference**: `N/A - pre-PR`
- **Soft Checkpoint**: `Around 60 minutes of execution, or at the S4 diff-scope gate, whichever comes first`
- **Hard Checkpoint**: `At or before 90 minutes, or before any commit if a gate is red for a reason this task did not cause`
- **Event-Driven Checkpoints**: `Milestone, task switch, scope expansion, handoff, compaction, or context drift`
- **Stop Conditions**: `Missing owner ratification, unexpected file in the S4 diff, failed governance gate not covered by S5 or S6, submodule dirty or carrying local-only commits, hard checkpoint, or developer stop`
- **Host Timer Capability**: `The host cannot mechanically enforce checkpoints or terminate the session; timing is recorded, never enforced.`

## 5. State and Active Ownership

- **Execution State**: `in_progress`
- **Mapped `pk:tasks` Status**: `In Progress`
- **Active Task Pointer**: `TASK-promptkit-v2-3-upgrade`
- **Start Time**: `2026-11-19 09:14 UTC`
- **Current Actor**: `Agent (DeepSeek Harness / lead)`
- **Next Action**: `Commit the engine move and the section 3A repoint in their two separate commits, then run the S8 gate sweep and S9 pk:sync.`
- **Branch / Revision**: `chore/promptkit-v2-sync @ 560ebde`

### Transition History

| Previous State | New State | Timestamp | Actor | Reason | Supporting Evidence |
|---|---|---|---|---|---|
| `None` | `planned` | 2026-11-19 08:50 UTC | Agent (DeepSeek Harness / lead) | Owner selected pk:tasks after the pk:route answer | Planning Record |
| `planned` | `ready` | 2026-11-19 08:50 UTC | Agent (DeepSeek Harness / lead) | Every readiness field is populated; execution awaits owner ratification | This record |
| `ready` | `in_progress` | 2026-11-19 09:14 UTC | Agent (DeepSeek Harness / lead) | Owner ratified with reply 1; S0 captured the baseline and S1 pinned the engine | This record; S0/S1 command output |

## 6. Evidence and Completion Gate

- **Changed Files**:
  - `.promptkit` - engine gitlink moved to 52adbe1
  - `AGENTS.md` - managed directive block re-injected
  - `CLAUDE.md` - managed directive block re-injected
  - `.opencode/rules.md` - managed directive block re-injected
  - `.clinerules/promptkit.md` - managed directive block re-injected
  - `.github/copilot-instructions.md` - managed directive block re-injected
  - `PROMPTKIT.md` - engine prose, md5, untrusted-content bullet
  - `docs/STATE.md` - engine row, last updated, session row, section 3A
  - `eslint.config.mjs` - .promptkit/** ignore (S6, if run)
  - `docs/tasks/2026-10-23-ci-runtime-reduction.md` - link labels and In Scope (S5, if run)
  - `docs/tasks/2026-10-23-api-suite-shared-server.md` - link labels and In Scope (S5, if run)
  - `docs/specs/2026-11-19-spec-promptkit-v2-3-upgrade.md` - Planning Record
  - `docs/tasks/2026-11-19-promptkit-v2-3-upgrade.md` - this Task Record
- **Scope Change Records**: `None`
- **Checkpoint Records**: `None`
- **Handoff Records**: `None`
- **Verification Evidence**: `Not yet executed. Baseline measured 2026-11-19: validate-references exit 0; validate-execution-control FAILED|ERRORS=9|RECORDS=4; check-setup-assert ASSERT|submodule|status|OK; check-doctor version STALE(+228).`
- **Behavior IDs [Required when enabled]**: `N/A - exception work type`
- **TDD Intent Register [Required when enabled]**: `N/A - exception work type`
- **TDD Execution Evidence [Required when enabled]**: `N/A - exception work type`
- **TDD Exception Verification [Required for Documentation, Configuration, or Research Work; Not applicable for Code Work]**: `Configuration Work has no behavior seam to drive Red-Green-Refactor. Verification is the governance gate sweep in section 3 and the S4 diff-scope gate in the Planning Record.`
- **CI Evidence**: `N/A - no PR or CI run; no governance workflow exists (follow-up F-1)`
- **Review Evidence**: `N/A - the Planning Record is the design artifact; pk:review follows execution`
- **Commit Evidence**: `N/A before commit`
- **Pull Request Evidence**: `N/A - not opened`
- **Release Evidence**: `N/A - consumes an existing upstream tag; creates no release`
- **Blocker and Resume Condition**: `None - execution waits on owner ratification recorded in the Approval Boundary; resume when the owner accepts D1-D7 and chooses O1-O3.`
- **Completion State**: `pending`
- **Acceptance Results**: `AC-1 through AC-15 Pending`
- **Changed-File Summary**: `No file changed yet. This record and its Planning Record are the only artifacts written.`
- **Completion Exception**: `None`
- **Completion Decision and Timestamp**: `Not decided - 2026-11-19 08:50 UTC`
