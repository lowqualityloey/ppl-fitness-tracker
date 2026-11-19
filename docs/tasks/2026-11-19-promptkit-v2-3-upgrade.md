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

- [x] **AC-1**: Engine is at 52adbe1 and git describe --tags --match 'v[0-9]*' returns v2.3.0.
  - **Result**: `PASS` — `rev-parse HEAD` = `52adbe16c0ff2aea0d538e10c3225c2f3e40e315`; `describe --tags --match 'v[0-9]*'` = `v2.3.0`.
  - **Evidence**: `git -C .promptkit rev-parse HEAD; git -C .promptkit describe --tags --match 'v[0-9]*'`
- [x] **AC-2**: .gitmodules names promptkit-os and git submodule status has no leading plus or minus.
  - **Result**: `PASS` — url `https://github.com/lowqualityloey/promptkit-os`; status line ` 52adbe16c0ff2aea0d538e10c3225c2f3e40e315 .promptkit (v2.3.0)` (leading space, no + or -).
  - **Evidence**: `cat .gitmodules; git submodule status`
- [x] **AC-3**: All five host directives carry the v2.3.0 engine stamp.
  - **Result**: `PASS` — `grep -c 'Engine: v2.3.0 (52adbe1)'` = 1 in each of the five.
  - **Evidence**: `grep -c across AGENTS.md, CLAUDE.md, .opencode/rules.md, .clinerules/promptkit.md, .github/copilot-instructions.md`
- [x] **AC-4**: The Untrusted Content guardrail appears exactly once in each of the five directives.
  - **Result**: `PASS` — `grep -c 'Untrusted Content'` = 1 in each of the five.
  - **Evidence**: `grep -c 'Untrusted Content' across the five host files`
- [x] **AC-5**: The nextjs-agent-rules block in AGENTS.md is byte-identical to HEAD.
  - **Result**: `PASS` — the block md5 is `01e8142356e15c3404e0d84c48187cd0` both at `560ebde` and in the working tree; `git diff 560ebde..HEAD -- AGENTS.md` has 0 occurrences of `nextjs-agent-rules`.
  - **Evidence**: `awk '/<!-- BEGIN:nextjs-agent-rules -->/,/<!-- END:nextjs-agent-rules -->/' AGENTS.md | md5sum` versus the same on `git show 560ebde:AGENTS.md`
- [x] **AC-6**: PROMPTKIT.md has one profile line, one tracking line, and Engine prose naming 52adbe1 and v2.3.0.
  - **Result**: `PASS` — `^profile: turbo$` = 1, `^tracking: github$` = 1, line 8 reads `**Engine**: `.promptkit` (submodule @ `52adbe1` = **v2.3.0**, canonical `promptkit-os`).` The installer relocated `profile:` to end-of-file; there is still exactly one.
  - **Evidence**: `grep -c '^profile: turbo$'; grep -c '^tracking: github$'; grep -n 'Engine\*\*:' PROMPTKIT.md`
- [x] **AC-7**: PROMPTKIT.md's directive-block md5 matches the block on disk, identically across all five hosts.
  - **Result**: `PASS` — all five compute `b28a1cd8d852eaf0de91979996c3904f`, the value PROMPTKIT.md line 10 records, and the value the Planning Record predicted.
  - **Evidence**: `awk '/<!-- PROMPTKIT_START -->/,/<!-- PROMPTKIT_END -->/' <file> | md5sum`, five times
- [x] **AC-8**: docs/STATE.md Engine Version reads v2.3.0; section 3A projects TASK-promptkit-v2-3-upgrade
  and satisfies the widened 10-pair projection contract (zero STATE_PROJECTION_MISMATCH rows); and
  check-doctor.sh reports docs-drift OK.
  - **Result**: `PASS` — line 264 reads `- **Engine Version**: v2.3.0 @ 52adbe1`; `validate-execution-control.sh` emits zero `STATE_` rows under the v2.3.0 10-pair contract; `check-doctor.sh` reports `docs-drift OK`.
  - **Evidence**: `grep -n 'Engine Version' docs/STATE.md; bash .promptkit/scripts/validate-execution-control.sh --root .; bash .promptkit/scripts/check-doctor.sh .`
- [x] **AC-9**: The diff is exactly the expected file set across two commits: the engine move carries the
  gitlink in the same commit as the directives, and the section 3A repoint lands separately.
  - **Result**: `PASS` — commit 1 `a5e7769` carries 11 files including the `.promptkit` gitlink; commit 2 `2ab2288` carries only `docs/STATE.md` and this Task Record.
  - **Evidence**: `git show --name-only --format='' a5e7769; git show --name-only --format='' 2ab2288`
- [x] **AC-10**: validate-references.sh --strict exits 0. The strict flag exists only from v2.1.0, so its availability is itself part of the evidence.
  - **Result**: `PASS` — exit 0, `✅ All references valid! No broken links found.` The installed script now defines `STRICT_MODE` (3 occurrences) and documents `Usage: validate-references.sh [--strict] [promptkit-dir]` at line 7; the pre-upgrade engine had no such flag.
  - **Evidence**: `bash .promptkit/scripts/validate-references.sh --strict .promptkit`; `grep -c STRICT_MODE .promptkit/scripts/validate-references.sh`
- [x] **AC-11**: validate-execution-control.sh --root . exits 0 with VALID, or the remaining red is recorded with its cause.
  - **Result**: `PASS` — `VALID|RECORDS=5|ROOT=.`, exit 0. S5 repaired the 9 pre-existing errors; none remain.
  - **Evidence**: `bash .promptkit/scripts/validate-execution-control.sh --root .`
- [x] **AC-12**: check-doctor.sh reports every row OK except version STALE(+5), whose cause is recorded.
  - **Result**: `PASS` — the only non-OK, non-SKIP row is `version STALE(+5) engine v2.3.0 is 5 commit(s) behind refs/remotes/origin/main`. Cause recorded (D1/R5): the doctor compares against `refs/remotes/origin/main` and never a tag, and the 5 post-tag commits are docs-only release records (`git diff --stat v2.3.0..origin/main` = 2 files, +26/-0, both under `docs/releases/`). The four remaining non-OK rows are `SKIP`: five uninstalled hosts and `provenance SKIP(intake-status: legacy-partial)`. Exit 1 is this row alone.
  - **Evidence**: `bash .promptkit/scripts/check-doctor.sh .`
- [x] **AC-13**: check-setup-assert.sh exits 0 after the gitlink commit.
  - **Result**: `PASS` — `ASSERT|submodule|status|OK`, exit 0. It read `FAIL` before commit 1 and flipped on the commit, exactly as R4 predicted.
  - **Evidence**: `bash .promptkit/scripts/check-setup-assert.sh . .promptkit .promptkit`
- [x] **AC-14**: npm run typecheck and npm run lint both exit 0.
  - **Result**: `PASS` — typecheck exit 0 (`✓ Types generated successfully`); lint exit 0. Lint was `6 problems (5 errors, 1 warning)` / exit 1 after the engine bump and before S6.
  - **Evidence**: `npm run typecheck; node node_modules/eslint/bin/eslint.js --max-warnings=0 .`
- [x] **AC-15**: No application source, test, schema, or CI runtime file changed.
  - **Result**: `PASS` — `git diff --name-only 560ebde..HEAD` lists 12 paths and none matches `^(app|lib|src|components|tests|supabase)/` or `^\.github/workflows/`.
  - **Evidence**: `git diff --name-only 560ebde..HEAD | grep -E '^(app|lib|src|components|tests|supabase)/|^\.github/workflows/'`

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

- **Execution State**: `completed`
- **Mapped `pk:tasks` Status**: `Done`
- **Active Task Pointer**: `None`
- **Start Time**: `2026-11-19 09:14 UTC`
- **Current Actor**: `Agent (DeepSeek Harness / lead)`
- **Next Action**: `None - this task is closed. The queued API-suite review findings (Planning Record F-2) are the next unit of work and need their own Task Record.`
- **Branch / Revision**: `chore/promptkit-v2-sync @ d0530f0`

### Transition History

| Previous State | New State | Timestamp | Actor | Reason | Supporting Evidence |
|---|---|---|---|---|---|
| `None` | `planned` | 2026-11-19 08:50 UTC | Agent (DeepSeek Harness / lead) | Owner selected pk:tasks after the pk:route answer | Planning Record |
| `planned` | `ready` | 2026-11-19 08:50 UTC | Agent (DeepSeek Harness / lead) | Every readiness field is populated; execution awaits owner ratification | This record |
| `ready` | `in_progress` | 2026-11-19 09:14 UTC | Agent (DeepSeek Harness / lead) | Owner ratified with reply 1; S0 captured the baseline and S1 pinned the engine | This record; S0/S1 command output |
| `in_progress` | `awaiting_review` | 2026-11-19 09:29 UTC | Agent (DeepSeek Harness / lead) | S0-S8 complete, all 15 ACs PASS, gates green; owner sign-off remains | Commits a5e7769 and 2ab2288; S8 gate sweep |
| `awaiting_review` | `completed` | 2026-11-19 10:03 UTC | Agent (DeepSeek Harness / lead) | Owner signed off with reply 1; S9 pk:sync reloaded the 2.3.0 rules from disk and the gate sweep stayed green | Commit d0530f0; S9 drift audit and post-S9 gate sweep |

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
  - `docs/tasks/2026-10-23-api-suite-shared-server.md` - link labels and In Scope (S5); the file is still untracked and travels with the queued API-suite work, so this repair is NOT in either commit
  - `docs/specs/2026-11-19-spec-promptkit-v2-3-upgrade.md` - Planning Record
  - `docs/tasks/2026-11-19-promptkit-v2-3-upgrade.md` - this Task Record
- **Scope Change Records**: `None`
- **Scope Note**: S5 repaired two records. `docs/tasks/2026-10-23-ci-runtime-reduction.md` is tracked and rides in commit `a5e7769`. `docs/tasks/2026-10-23-api-suite-shared-server.md` is untracked (part of the queued API-suite work), so its identical repair is applied on disk but deliberately unstaged; staging it would smuggle another task's artifact into this upgrade.
- **Checkpoint Records**: `None`
- **Handoff Records**: `None`
- **Verification Evidence**: `2026-11-19, after both commits: validate-references.sh --strict exit 0 (✅ All references valid); validate-execution-control.sh --root . exit 0 (VALID|RECORDS=5|ROOT=.); check-setup-assert.sh exit 0 (ASSERT|submodule|status|OK); check-doctor.sh exit 1 on version STALE(+5) alone, docs-drift OK, submodule OK; npm run typecheck exit 0; eslint --max-warnings=0 exit 0. Baseline before execution: validate-execution-control FAILED|ERRORS=9|RECORDS=4; check-doctor version STALE(+228).`
- **Behavior IDs [Required when enabled]**: `N/A - exception work type`
- **TDD Intent Register [Required when enabled]**: `N/A - exception work type`
- **TDD Execution Evidence [Required when enabled]**: `N/A - exception work type`
- **TDD Exception Verification [Required for Documentation, Configuration, or Research Work; Not applicable for Code Work]**: `Configuration Work has no behavior seam to drive Red-Green-Refactor. Verification is the governance gate sweep in section 3 and the S4 diff-scope gate in the Planning Record.`
- **CI Evidence**: `N/A - no PR or CI run; no governance workflow exists (follow-up F-1)`
- **Review Evidence**: `Owner review at the S8 boundary: the two commits, the 15 measured AC results and the gate sweep were presented and signed off with reply 1; S9 pk:sync then reloaded the 2.3.0 rules and the sweep was re-run green. No independent reviewer was engaged - this is a governance install with no application code, and the review was the owner's.`
- **Commit Evidence**: `a5e7769 chore(promptkit): upgrade engine to v2.3.0 (52adbe1) — 11 files, the gitlink with the five directives; 2ab2288 docs(promptkit): project the v2.3.0 upgrade task in 3A — docs/STATE.md plus this record; d0530f0 docs(promptkit): close the v2.3.0 upgrade task at awaiting_review — the post-execution state change. Each entry is recorded in a later commit than the one it names, per the two-commit pattern in workflows/commit.md.`
- **Pull Request Evidence**: `N/A - not opened`
- **Release Evidence**: `N/A - consumes an existing upstream tag; creates no release`
- **Blocker and Resume Condition**: `None - execution is complete and the gates are green; resume when the owner reviews a5e7769 and 2ab2288 and signs off, or requests a rollback per the Planning Record section 7.`
- **Completion State**: `completed`
- **Acceptance Results**: `AC-1 through AC-15 PASS`
- **Changed-File Summary**: `12 distinct paths across four commits (a5e7769, 2ab2288, d0530f0, and this closure commit; the last three touch only docs/STATE.md, the Planning Record and this record): .promptkit (gitlink to 52adbe1); AGENTS.md, CLAUDE.md, .opencode/rules.md, .clinerules/promptkit.md, .github/copilot-instructions.md (directive block re-injected, md5 edb5dc6d -> b28a1cd8); PROMPTKIT.md (engine prose, md5, 2.3.0 bullet); docs/STATE.md (Engine Version, Last Updated, session row, section 3A); eslint.config.mjs (.promptkit/** ignore); docs/tasks/2026-10-23-ci-runtime-reduction.md (link labels and In Scope); docs/specs/2026-11-19-spec-promptkit-v2-3-upgrade.md (Planning Record); docs/tasks/2026-11-19-promptkit-v2-3-upgrade.md (this record).`
- **Completion Exception**: `None`
- **Completion Decision and Timestamp**: `Owner signed off - 2026-11-19 10:03 UTC`
