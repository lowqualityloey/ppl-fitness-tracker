# Task Record: Upgrade the PromptKit OS engine to v2.4.0

<a id="TASK-promptkit-v2-4-upgrade"></a>

## 1. Identity and Authority

- **Record Type**: `Task Record`
- **Task ID**: `TASK-promptkit-v2-4-upgrade`
- **Ceremony Level**: `Level 2 (Controlled Work)`
- **PromptKit Adaptation Profile**: `sdlc-overlay-v1`
- **Work Type**: `Configuration Work`
- **Planning Record Link**: [PLAN-promptkit-v2-4-upgrade](../specs/2026-11-22-spec-promptkit-v2-4-upgrade.md#PLAN-promptkit-v2-4-upgrade)
- **Planning Depth Reference**: `Full`
- **Assumption Record Links**: `None`
- **Specification**: `docs/specs/2026-11-22-spec-promptkit-v2-4-upgrade.md`
- **External Reference**: `N/A - local Markdown tracking; no issue filed`
- **Owner / Actor**: `Agent (DeepSeek Harness / lead)`
- **Execution Scope**: `ppl-fitness-tracker, branch chore/promptkit-v2-sync, one worktree`
- **Approval Boundary**: `Owner ratification of the plan's decisions D1-D7 and open decisions O1-O3 is required before S0 runs. Commit, push, PR, merge, tag, release, deploy, and any action outside this repository require explicit human confirmation.`
- **Created**: `2026-11-22 14:05 UTC`

> This Local Task Source is authoritative for Controlled Work. The Planning Record supplies context only; it does not control readiness, execution state, active ownership, completion, or approval.

## 2. Objective and Boundaries

- **Objective**: `Move the .promptkit engine from 52adbe1 (v2.3.0) to the peeled commit of tag v2.4.0 (13006a6), re-inject the five host directives, complete the four hand-maintained claims the installer never touches, and leave every installed governance gate green or its red recorded with a measured cause.`
- **In Scope**:
  - `.promptkit` - engine gitlink and detached checkout at 13006a6
  - `AGENTS.md` - managed directive block re-injection
  - `CLAUDE.md` - managed directive block re-injection
  - `.opencode/rules.md` - managed directive block re-injection
  - `.clinerules/promptkit.md` - managed directive block re-injection
  - `.github/copilot-instructions.md` - managed directive block re-injection
  - `PROMPTKIT.md` - engine prose, directive-block md5, and the v2.4.0 drift-table bullet
  - `docs/STATE.md` - Engine Version row, Last Updated, session-log row, section 3A projection
  - `docs/specs/2026-11-22-spec-promptkit-v2-4-upgrade.md` - the Planning Record this task consumes
  - `docs/tasks/2026-11-22-promptkit-v2-4-upgrade.md` - this Task Record
- **Explicit Non-Goals**:
  - Application source, schema, auth, API, database, or runtime changes of any kind
  - The PromptKit Governance CI workflow (follow-up F-1, needs its own workflow with explicit paths)
  - The branch review's evidence defects (F-2: AC-11 scoping, AC-13 counts, section 3A's falsified claim)
  - The docs/STATE.md reconciliation against origin/main and its STATE-ARCHIVE split (F-3)
  - The fixtures.ts anon-key fallback and the missing anon-key preflight check (F-4)
  - The six pre-existing Drizzle/RLS failures carried from 81fdd3c (F-5, needs its own record)
  - Pinning origin/main (43cb101) instead of the release tag
  - Release, tag creation, publication, deployment, or any remote action
- **Dependencies**: `Upstream promptkit-os tag v2.4.0 (13006a6) reachable by fetch; owner ratification of D1-D7 and O1-O3; no external service, no credential.`
- **Risk**: `Low - governance and documentation only, no application code or data, fully reversible with git. Residual risk is scope drift during the installer run, mitigated by the S3 diff-scope gate.`
- **Verification Condition**: `bash .promptkit/scripts/validate-references.sh --strict exits 0; bash .promptkit/scripts/validate-execution-control.sh --root . exits 0 with VALID; bash .promptkit/scripts/check-setup-assert.sh . .promptkit .promptkit exits 0; npm run typecheck and npm run lint exit 0.`

## 3. Acceptance Criteria

- [x] **AC-1**: Engine is at 13006a6 and git describe --tags --match 'v[0-9]*' returns v2.4.0.
  - **Result**: `PASS` — `rev-parse HEAD` = `13006a6e3fe955d220ee7a5d5518d4bd6b7e1652`; `describe --tags --match 'v[0-9]*'` = `v2.4.0`.
  - **Evidence**: `git -C .promptkit rev-parse HEAD; git -C .promptkit describe --tags --match 'v[0-9]*'`
- [x] **AC-2**: .gitmodules names promptkit-os and git submodule status has no leading plus or minus.
  - **Result**: `PASS` — url `https://github.com/lowqualityloey/promptkit-os`; status line ` 13006a6e3fe955d220ee7a5d5518d4bd6b7e1652 .promptkit (v2.4.0)` (leading space, no + or -).
  - **Evidence**: `cat .gitmodules; git submodule status`
- [x] **AC-3**: All five host directives carry the v2.4.0 engine stamp.
  - **Result**: `PASS` — `grep -c 'Engine: v2.4.0 (13006a6)'` = 1 in each of `AGENTS.md`, `CLAUDE.md`, `.opencode/rules.md`, `.clinerules/promptkit.md`, `.github/copilot-instructions.md`.
  - **Evidence**: `grep -c 'Engine: v2.4.0 (13006a6)' across the five host files`
- [x] **AC-4**: The directive-block md5 is 98425dbeb277c71f405f5e9aba999a7f in all five hosts and matches PROMPTKIT.md line 10.
  - **Result**: `PASS` — all five compute `98425dbeb277c71f405f5e9aba999a7f`, the value `PROMPTKIT.md:10` records and the value the Planning Record predicted from the sandbox. The pre-upgrade value was `b28a1cd8d852eaf0de91979996c3904f`.
  - **Evidence**: `awk '/<!-- PROMPTKIT_START -->/,/<!-- PROMPTKIT_END -->/' <file> | md5sum`, five times; `grep -n 'Directive-block md5' PROMPTKIT.md`
- [x] **AC-5**: The nextjs-agent-rules block in AGENTS.md is byte-identical to the pre-upgrade revision.
  - **Result**: `PASS` — `git show 17b64ed -- AGENTS.md` is a single one-line hunk, the `Engine:` stamp; the committed diff contains 0 occurrences of `nextjs-agent-rules`. `git diff -- AGENTS.md` is empty in the working tree because the stamp is now committed, so the proof is the committed hunk, not a working-tree diff.
  - **Evidence**: `git show 17b64ed -- AGENTS.md; git show 17b64ed -- AGENTS.md | grep -c 'nextjs-agent-rules'`
- [x] **AC-6**: PROMPTKIT.md has one profile line, one tracking line, and Engine prose naming 13006a6 and v2.4.0.
  - **Result**: `PASS` — `^profile: turbo$` = 1, `^tracking: github$` = 1, and line 8 reads `- **Engine**: `.promptkit` (submodule @ `13006a6` = **v2.4.0**, canonical `promptkit-os`).`
  - **Evidence**: `grep -c '^profile: turbo$'; grep -c '^tracking: github$'; grep -n 'Engine\*\*:' PROMPTKIT.md`
- [x] **AC-7**: docs/STATE.md Engine Version reads v2.4.0 @ 13006a6, Last Updated names the v2.4.0 upgrade, and section 8 carries a 2026-11-22 row.
  - **Result**: `PASS` — line 264 reads `- **Engine Version**: v2.4.0 @ 13006a6`; line 263 Last Updated leads with 2026-11-22 (the v2.4.0 upgrade) and demotes 2.3.0 to an `Earlier:` note; section 8 has exactly one `^| 2026-11-22` row.
  - **Evidence**: `grep -n 'Engine Version\|Last Updated\|^| 2026-11-22' docs/STATE.md`
- [x] **AC-8**: The installer's own footprint is exactly six files at 1+/1- each, with zero new paths; PROMPTKIT.md's extra hand edits are counted separately.
  - **Result**: `PASS` — `git show --stat --format='' 17b64ed` = 7 files, 14 insertions(+), 8 deletions(-). The six installer paths are `.clinerules/promptkit.md`, `.github/copilot-instructions.md`, `.opencode/rules.md`, `.promptkit` (gitlink), `AGENTS.md`, `CLAUDE.md`, each at 1+/1-; `PROMPTKIT.md` carries 8+/2- of hand edits from S4. Zero untracked or created paths outside the three planning artifacts. The criterion was restated at S3 because the installer's footprint and the commit's footprint are not the same set.
  - **Evidence**: `git show --stat --format='' 17b64ed; git status --porcelain --untracked-files=all`
- [x] **AC-9**: The engine move carries the gitlink in the same commit as the directives and PROMPTKIT.md; the docs-only commits that follow carry only docs/STATE.md, the Planning Record and this record.
  - **Result**: `PASS` — commit 1 `17b64ed` carries exactly `.clinerules/promptkit.md`, `.github/copilot-instructions.md`, `.opencode/rules.md`, `.promptkit`, `AGENTS.md`, `CLAUDE.md`, `PROMPTKIT.md`. Commit 2 `c54be47` carries exactly `docs/STATE.md`, `docs/specs/2026-11-22-spec-promptkit-v2-4-upgrade.md`, `docs/tasks/2026-11-22-promptkit-v2-4-upgrade.md`. Commit 3 `b8d45c9` carries `docs/STATE.md` and this record only. The criterion was restated at the S7 gate: the original wording assumed two commits, and the measured evidence, the `awaiting_review` state change and this closure form three, all docs-only after the engine move. This entry names only the three commits that precede it, per the template commit-evidence rule.
  - **Evidence**: `git show --name-only --format='' 17b64ed; git show --name-only --format='' c54be47; git show --name-only --format='' b8d45c9`
- [x] **AC-10**: validate-references.sh --strict exits 0.
  - **Result**: `PASS` — exit 0, `✅ All references valid! No broken links found.`
  - **Evidence**: `bash .promptkit/scripts/validate-references.sh --strict`
- [x] **AC-11**: validate-execution-control.sh --root . exits 0 with VALID and zero STATE_ rows.
  - **Result**: `PASS` — `VALID|RECORDS=7|ROOT=.`, exit 0, zero `STATE_` and zero `MISSING_FIELD` rows under the v2.4.0 10-pair projection contract.
  - **Evidence**: `bash .promptkit/scripts/validate-execution-control.sh --root .`
- [x] **AC-12**: check-doctor.sh reports every row OK or SKIP except version STALE(+12), whose cause and count are recorded here.
  - **Result**: `PASS` — exit 1 on exactly one row: `version  STALE(+12)  engine v2.4.0 is 12 commit(s) behind refs/remotes/origin/main  Offer pk:sync upgrade (read-only doctor never upgrades)`. Cause is D1/R5: the doctor compares against `refs/remotes/origin/main` and never a tag, and the 12 post-tag commits are unreleased upstream work (`43cb101`); v2.4.0's own fix addresses DIVERGED-for-ahead (issue #743) and deliberately leaves the STALE branch alone. All host rows are `OK`; the uninstalled hosts are `SKIP(not installed)`; `submodule OK`; `docs-drift OK`; `provenance SKIP(intake-status: legacy-partial)`.
  - **Evidence**: `bash .promptkit/scripts/check-doctor.sh .`
- [x] **AC-13**: check-setup-assert.sh exits 0 after the gitlink commit.
  - **Result**: `PASS` — `ASSERT|submodule|status|OK`, exit 0. It read `FAIL` after S2 and flipped on commit 1, exactly as R4 predicted.
  - **Evidence**: `bash .promptkit/scripts/check-setup-assert.sh . .promptkit .promptkit`
- [x] **AC-14**: npm run typecheck and npm run lint both exit 0.
  - **Result**: `PASS` — typecheck exit 0 (`✓ Types generated successfully`); `node node_modules/eslint/bin/eslint.js --max-warnings=0 .` exit 0. The engine ships 0 TypeScript files, so neither tool observes the upgrade; this criterion proves no collateral damage, not coverage of the change.
  - **Evidence**: `npm run typecheck; node node_modules/eslint/bin/eslint.js --max-warnings=0 .`
- [x] **AC-15**: No application source, test, schema, or CI runtime file changed.
  - **Result**: `PASS` — the grep returns nothing (exit 1) across `f0b413e..HEAD`.
  - **Evidence**: `git diff --name-only f0b413e..HEAD | grep -E '^(app|lib|src|components|tests|supabase)/|^\.github/workflows/'`

## 4. Execution Policy

- **Mode**: `Gated Mode`
- **TDD Enforcement Mode**: `disabled`
- **Batch Authorization**: `N/A - single-owner instruction`
- **Authorization Checkpoint Reference**: `N/A - pre-PR`
- **Soft Checkpoint**: `Around 60 minutes of execution, or at the S3 diff-scope gate, whichever comes first`
- **Hard Checkpoint**: `At or before 90 minutes, or before any commit if a gate is red for a reason this task did not cause`
- **Event-Driven Checkpoints**: `Milestone, task switch, scope expansion, handoff, compaction, or context drift`
- **Stop Conditions**: `Missing owner ratification, unexpected file in the S3 diff, failed governance gate not covered by the spec's recorded reds, submodule dirty or carrying local-only commits, hard checkpoint, or developer stop`
- **Host Timer Capability**: `The host cannot mechanically enforce checkpoints or terminate the session; timing is recorded, never enforced.`

## 5. State and Active Ownership

- **Execution State**: `completed`
- **Mapped `pk:tasks` Status**: `Done`
- **Active Task Pointer**: `None`
- **Start Time**: `2026-11-22 14:07 UTC`
- **Current Actor**: `Agent (DeepSeek Harness / lead)`
- **Next Action**: `None - this task is closed. The queued review findings (Planning Record F-1 through F-5) are the next unit of work and need their own Task Record.`
- **Branch / Revision**: `chore/promptkit-v2-sync @ b8d45c9`

### Transition History

| Previous State | New State | Timestamp | Actor | Reason | Supporting Evidence |
|---|---|---|---|---|---|
| `None` | `planned` | 2026-11-22 14:05 UTC | Agent (DeepSeek Harness / lead) | Owner selected the upgrade as the first unit of work (reply 4 at m02599); the Planning Record exists and this record seeds its readiness fields | Planning Record |
| `planned` | `in_progress` | 2026-11-22 14:07 UTC | Agent (DeepSeek Harness / lead) | Owner ratified the plan; execution began at S0 with HEAD at f0b413e and the engine at 52adbe1 (v2.3.0) | S0 baseline commands |
| `in_progress` | `awaiting_review` | 2026-11-22 14:33 UTC | Agent (DeepSeek Harness / lead) | S0 through S6 are complete: the engine is at v2.4.0, the five directives and the four hand-maintained claims are written, the section 3A projection is repointed, and the gate sweep ran with one accepted red | section 6 Verification Evidence; section 3 Acceptance Criteria |
| `awaiting_review` | `completed` | 2026-11-22 20:32 UTC | Owner (reply `1` at m03111), recorded by Agent (DeepSeek Harness / lead) | The owner reviewed 17b64ed, c54be47 and b8d45c9 with the 15 measured criteria and the gate sweep and signed off at the S8 boundary; the section 3A projection is reconciled to the same state in this closure commit | section 6 Review Evidence; section 7 Completion Gate |

## 6. Evidence and Completion Gate

- **Changed Files**:
  - `.promptkit` - engine gitlink moved to 13006a6
  - `AGENTS.md` - managed directive block re-injected at the v2.4.0 stamp
  - `CLAUDE.md` - managed directive block re-injected at the v2.4.0 stamp
  - `.opencode/rules.md` - managed directive block re-injected at the v2.4.0 stamp
  - `.clinerules/promptkit.md` - managed directive block re-injected at the v2.4.0 stamp
  - `.github/copilot-instructions.md` - managed directive block re-injected at the v2.4.0 stamp
  - `PROMPTKIT.md` - engine prose, directive-block md5, and the v2.4.0 drift-table bullet
  - `docs/STATE.md` - Engine Version row, Last Updated, session row, section 3A projection
  - `docs/specs/2026-11-22-spec-promptkit-v2-4-upgrade.md` - the Planning Record
  - `docs/tasks/2026-11-22-promptkit-v2-4-upgrade.md` - this Task Record
- **Scope Change Records**: `None`
- **Checkpoint Records**: `None`
- **Handoff Records**: `None`
- **Verification Evidence**: `2026-11-22, after commit 1 (17b64ed): validate-references.sh --strict exit 0 (All references valid); validate-execution-control.sh --root . exit 0 (VALID|RECORDS=7|ROOT=.); check-setup-assert.sh exit 0 (ASSERT|submodule|status|OK); check-doctor.sh exit 1 on version STALE(+12) alone, with submodule OK and docs-drift OK; npm run typecheck exit 0; eslint --max-warnings=0 exit 0. Baseline before execution at f0b413e: validate-references --strict exit 0, validate-execution-control VALID|RECORDS=6, check-doctor STALE(+36), typecheck and lint exit 0.`
- **Behavior IDs [Required when enabled]**: `N/A - exception work type`
- **TDD Intent Register [Required when enabled]**: `N/A - exception work type`
- **TDD Execution Evidence [Required when enabled]**: `N/A - exception work type`
- **TDD Exception Verification [Required for Documentation, Configuration, or Research Work; Not applicable for Code Work]**: `Configuration Work has no behavior seam to drive Red-Green-Refactor. Verification is the governance gate sweep in section 3 and the S3 diff-scope gate in the Planning Record.`
- **CI Evidence**: `N/A - no PR or CI run; no governance workflow exists (follow-up F-1)`
- **Review Evidence**: `Owner review at the S8 boundary: commits 17b64ed, c54be47 and b8d45c9, the 15 measured criteria and the full gate sweep were presented and signed off with reply 1 at m03111; the closure commit then reconciled section 3A to the same state. No independent reviewer was engaged - this is a governance install with no application code, and the review was the owner's own.`
- **Commit Evidence**: `17b64ed chore(promptkit) upgrade engine to v2.4.0 (13006a6) - 7 files: the .promptkit gitlink, the five host directives and PROMPTKIT.md; c54be47 docs(promptkit) plan and project the v2.4.0 upgrade - docs/STATE.md, the Planning Record and this record; b8d45c9 docs(promptkit): move the v2.4.0 upgrade task to awaiting_review - the measured AC evidence and the projection state change. Each entry is recorded in a later commit than the one it names, per the template commit-evidence rule; this closure commit carries the evidence for all three.`
- **Pull Request Evidence**: `N/A - no pull request was opened; the owner reviewed the commits on the local branch and signed off directly (human-confirmed at m03111)`
- **Release Evidence**: `N/A - no release, tag, or deployment action is in scope`
- **Blocker and Resume Condition**: `None - execution is complete and the gates are green; resume when the owner reviews 17b64ed, c54be47 and b8d45c9 and signs off, or requests a rollback per the Planning Record section 7.`

## 7. Completion Gate

- **Completion State**: `completed`
- **Acceptance Results**: `AC-1 through AC-15 PASS`
- **Changed-File Summary**: `10 distinct paths across four commits (17b64ed, c54be47, b8d45c9, and this closure commit; the last three touch only docs/STATE.md, the Planning Record and this record): .promptkit (gitlink to 13006a6); AGENTS.md, CLAUDE.md, .opencode/rules.md, .clinerules/promptkit.md, .github/copilot-instructions.md (directive block re-injected, md5 b28a1cd8 -> 98425dbe); PROMPTKIT.md (engine prose, md5, the 2.4.0 bullet); docs/STATE.md (Engine Version, Last Updated, session row, section 3A); docs/specs/2026-11-22-spec-promptkit-v2-4-upgrade.md (Planning Record); docs/tasks/2026-11-22-promptkit-v2-4-upgrade.md (this record).`
- **Completion Exception**: `None`
- **Completion Decision and Timestamp**: `Owner signed off - 2026-11-22 20:32 UTC`

A task may be marked `completed` only after acceptance results, verification evidence, changed-file summary, and required commit evidence are linked. This record authorizes nothing beyond the Approval Boundary in section 1.
