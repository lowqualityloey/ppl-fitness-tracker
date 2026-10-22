# Review: PromptKit OS v2 Migration Plan

<a id="REVIEW-2026-10-23-promptkit-v2-migration-plan"></a>

- **Review ID**: `REVIEW-2026-10-23-promptkit-v2-migration-plan`
- **Review Status**: complete
- **Resolved Diff Reference**: revised plan at `docs/specs/2026-10-23-spec-promptkit-v2-migration.md`;
  prior plan at `docs/reviews/2026-10-21-promptkit-os-install-audit.md` §5; upstream fixed point
  `0cfa09390e4f6f0ffe090a6ba193db912b9a3c6d` (`v2.0.0-71-g0cfa093`)
- **Review type**: planning/documentation review, not a code diff review
- **Working tree**: `M docs/STATE.md`; untracked audit, checkpoint-03, plan, and this review

---

## Executive Summary

- **Overall Verdict**: **Changes Requested** for the 2026-10-21 audit's execution plan as written.
  **Approved with conditions** for the revised plan in `docs/specs/2026-10-23-spec-promptkit-v2-migration.md`.
- **Spec Fidelity**: The audit correctly identified the engine gap and the host-side entropy, but its
  target pin, validator evidence, legacy-card conversion, and CI step are now stale or wrong.
- **Technical Standards**: The revised plan is reversible and evidence-based. Its main residual risks
  are the installer's write scope, the missing tag fetch, and the fact that the state reflow is manual.

The revised plan is not executed by this review. No installer, test suite, or CI workflow was run.

---

## Axis 1: Spec Fidelity

### 🚨 [BLOCKING] F1 — The audit's target pin is 32 commits stale

- **Evidence**: the audit pins `2ecc74b` (`v2.0.0-39`). Upstream HEAD is `0cfa093`
  (`v2.0.0-71`), dated 2026-10-23. `git rev-list --count 2ecc74b..HEAD` = 32; the delta is 79 files,
  +5,892 / −75.
- **Risk**: executing the audit verbatim installs an engine that predates the `Profile written`
  migration (#643), the `intake-record` authority field (#647), the five-check doctor (#646), and the
  provenance hardening (#641). The plan would then be describing a different installer than the one it
  runs.
- **Required fix**: pin `0cfa093`, as the revised plan does, or explicitly pin the `v2.0.0` tag and
  accept the loss of those fixes.
- **Disposition**: incorporated as D1.

### 🚨 [BLOCKING] F2 — The audit's validator evidence is from the v1.8 engine, and the v2 gate is red

- **Evidence**: the audit records `validate-execution-control.sh --root .` → exit 0, `RECORDS=0`, and
  attributes that to "the v2 validator". The cited command is `.promptkit/scripts/validate-execution-control.sh`,
  i.e. v1.8. That script only inspects `docs/STATE.md` when §3A exists
  (`.promptkit/scripts/validate-execution-control.sh:584`). The v2 validator checks tables
  unconditionally: run against this tree it exits **1** with `ERRORS=86`, all `ORPHANED_TABLE_ROW` in
  `docs/STATE.md`, `RECORDS=0`.
- **Risk**: the audit's "standing gate is green" claim is false under the engine being installed. A PR
  that adopts C4 as a later/optional compaction step lands a red gate, and any CI wiring added before
  C4 fails immediately.
- **Required fix**: make the state table repair part of the same PR as the engine bump, and use the v2
  validator as the acceptance check. The revised plan's C5 does this.
- **Disposition**: incorporated as C5 and AC-6.

### 🚨 [BLOCKING] F3 — The 76-card back-fill has no valid identity scheme as written

- **Evidence**: 76 Markdown files under `docs/tasks/`; only **6** contain a `Task ID` and **5** contain
  a `Record Type`. The audit proposes mapping `TASK-<slug>` from the filename. The v2 validator's
  default profile accepts only `TASK-YYYY-MM-DD-<slug>`
  (upstream `scripts/validate-execution-control.sh:250`); `TASK-<slug>` is accepted only when the record
  declares `PromptKit Adaptation Profile: sdlc-overlay-v1` (`:245`), which also triggers the
  adaptation-field validation (`:506`) — fields the legacy cards do not have. The existing IDs
  (`TASK-m4-29-first-release`) are date-less and would fail the default profile.
- **Risk**: the mechanical converter either produces 76 invalid records, or requires a profile choice
  and 76 adaptation-field back-fills, while the audit explicitly forbids inventing evidence. Either
  outcome makes the migration PR unreviewable and does not improve any current check.
- **Required fix**: defer the conversion, keep the legacy cards as history, and require new L2/L3
  records to use the v2 template. If conversion is later desired, decide the profile first and ship a
  committed converter plus an `UNRESOLVED` list.
- **Disposition**: incorporated as D3; the revised plan drops C5 from the migration.

### ⚠️ [IMPORTANT] F4 — `test.yml` cannot host the governance gates it was asked to host

- **Evidence**: `.github/workflows/test.yml` has `paths-ignore: ['docs/**', '**/*.md']` on both `push`
  and `pull_request`; it contains one incidental `PROMPTKIT.md` comment and no PromptKit job. A
  migration PR is mostly `*.md` plus a `.promptkit` gitlink; the markdown files are skipped, and a
  docs-only follow-up produces **no run at all**.
- **Risk**: adding `check-doctor` / `validate-references` / `validate-execution-control` steps to
  `test.yml` creates a gate that never runs on the changes most likely to break it.
- **Required fix**: a separate workflow with explicit `paths`, as in C6. Do not add `paths-ignore` to it.
- **Disposition**: incorporated as C6 and AC-10.

### ⚠️ [IMPORTANT] F5 — The audit's C3 misses the new profile date and `intake-record`

- **Evidence**: `PROMPTKIT.md:5` currently reads `- **Installed**: 2026-09-14`. The v2 installer
  normalizes it to exactly one `- **Profile written**: 2026-09-14` (#643), and the v2 template adds
  `intake-record:` (#647). The audit's C3 lists five added machine lines and does not mention either.
- **Risk**: a plan that does not expect the `Profile written` rewrite will misread the installer diff as
  an unexpected edit; adding a fake `intake-record` would make the doctor's provenance check report
  `MISSING`.
- **Required fix**: expect the date-label migration, preserve the 2026-09-14 date, and omit
  `intake-record` for a legacy profile.
- **Disposition**: incorporated as C3/C4.

### ⚠️ [IMPORTANT] F6 — The audit's "measured counts" are not reproducible

- **Evidence**: the audit says 85 `.test.ts` files and 16 e2e spec files. This tree measures
  **80** `.test.ts` files under `tests/`, **16** `.spec.ts` files under `tests/e2e/`, and **96** total
  test/spec files; route handlers are **14**, not 11. The audit's 85 does not match any single
  definition I can reproduce.
- **Risk**: correcting `PROMPTKIT.md` from the audit's numbers would replace one stale count with
  another, violating the file's own §6 rule.
- **Required fix**: re-measure at C4 with the commands recorded in the plan, and state the definition.
- **Disposition**: incorporated as C4 and §3.

### ⚠️ [IMPORTANT] F7 — "Doctor green" after migration is not "all checks OK"

- **Evidence**: with the v2 doctor on the current tree: hosts OK (5), version `SKIP(no engine stamp)`,
  ignore rows OK except the engine row (`SKIP(engine outside project root)` because the checker was
  external), `docs-drift SKIP(no execution-control projection)`, `provenance SKIP(no intake-status
  line)`, exit 0. After C3, `version` becomes `OK`; the other two remain `SKIP` because the plan
  deliberately adds neither §3A nor an intake record.
- **Risk**: a completion claim of "doctor is green" would overstate what was checked. Exit 0 with two
  `SKIP` rows is a valid configured result, not a full audit.
- **Required fix**: acceptance states `version OK` and both `SKIP` reasons explicitly; do not report
  `OK` for a check that did not run.
- **Disposition**: incorporated as AC-8.

### ⚠️ [IMPORTANT] F8 — The baseline checkpoint is stale relative to the branch

- **Evidence**: `docs/tasks/m4/M4-29-first-release.checkpoint-03.md` records `main @ 532c1c9` and a
  clean tree. The current branch is `fix/drizzle-orm-cve` at `81fdd3c`, one commit ahead of `main`,
  with `docs/STATE.md` modified and the checkpoint untracked.
- **Risk**: committing it as the migration baseline would record a "clean tree at 532c1c9" immediately
  before an installer run on a different revision, weakening the baseline evidence the migration
  depends on.
- **Required fix**: commit it as a historical record with its SHA intact, or regenerate it at
  `81fdd3c`; do not edit the recorded SHA. Start C2 only after the tree is clean.
- **Disposition**: incorporated as C1's baseline caveat.

### 💡 [SUGGEST] F9 — Turbo is retained without a current measurement

- **Evidence**: the plan keeps `turbo` because the audit ratified it. The audit itself records no token
  measurement; the engine's own docs describe up to ~2× measured cost.
- **Remedy**: keep it for the migration, then compare two normal sessions against `balanced`. This is a
  cost decision, not a correctness one.
- **Disposition**: open as O4.

### 👏 [PRAISE] F10 — The audit's reversibility and host verification are sound

- The submodule SHA pin, the per-commit C1–C7 ordering, the explicit `.gitmodules` URL fix, and the
  `AGENTS.md` Next.js block check are all correct and survive into the revised plan.

---

## Axis 2: Standards, Safety & Evidence

### 🚨 [BLOCKING] S1 — The installer must not run on the current tree

- **Evidence**: `git status --porcelain` shows `M docs/STATE.md`, `??` audit, `??` checkpoint. `init.sh`
  stages every write and snapshots targets, but a dirty tree makes its diff ambiguous and a failure
  would restore over unrelated edits.
- **Required fix**: C1 commits the baseline first. If the owner does not want to commit the checkpoint,
  stash it explicitly and say so; do not rely on the installer's rollback.
- **Disposition**: incorporated as C1.

### ⚠️ [IMPORTANT] S2 — The Engine stamp depends on tags that a submodule checkout may not have

- **Evidence**: `init.sh:21` uses `git describe --tags --match 'v[0-9]*'`; the current submodule is a
  detached HEAD. A checkout without tags yields a bare SHA, and the stamp becomes `0cfa093 (0cfa093)`.
- **Required fix**: `git -C .promptkit fetch origin --tags` before checkout, and verify `describe`
  returns `v2.0.0-71-g0cfa093` before running the installer.
- **Disposition**: incorporated as C2.

### ⚠️ [IMPORTANT] S3 — `git submodule set-url` alone does not prove the submodule remote moved

- **Evidence**: the superproject config still reads `submodule..promptkit.url =
  https://github.com/lowqualityloey/better-promptkit`, and `.gitmodules` names the retired repository.
  The old name resolves through a GitHub redirect today (both names return HEAD `0cfa093`), but a
  redirect is not a pin.
- **Required fix**: `git submodule set-url`, then `git submodule sync -- .promptkit`, then verify
  `git -C .promptkit remote -v` and `.gitmodules` both name `promptkit-os`.
- **Disposition**: incorporated as C2.

### ⚠️ [IMPORTANT] S4 — The state compaction has no automated backup

- **Evidence**: the installer's transactional rollback covers its own writes; C5's manual `STATE.md`
  reflow does not. `docs/STATE.md` is 520,159 bytes, and the 86 table diagnostics mean a partial reflow
  is easy to leave behind.
- **Required fix**: do C5 on a branch with C1–C4 committed, keep the current milestone, blockers,
  invariants, and three latest checkpoints, and use `git diff` plus the validator as the check. Do not
  rewrite the file in one unreviewable pass.
- **Disposition**: incorporated as C5 and §8.

### 💡 [SUGGEST] S5 — `size:` and `ai-attribution` are policy values, not mechanical edits

- **Evidence**: `size:` is an intake field the template says never to guess; `ai-attribution:` changes
  commit/PR trailers. The plan originally proposed `medium`, but the v2 size table classifies this
  project as `large` (authentication + data + deployment).
- **Remedy**: confirm `large` or leave `size:` unset; confirm `host-default` or `off` for attribution.
- **Disposition**: O2 resolved (`large`, 2026-10-23); O3 open.

### 👏 [PRAISE] S6 — The installer and doctor have defensible safety properties

- `init.sh` stages writes, snapshots all destinations once, and restores on failure; `check-doctor.sh`
  is read-only and explicitly reports `SKIP` rather than a green row when a check cannot run. Both are
  appropriate for a governance install.

---

## Simplification Audit

- **Review ID**: `REVIEW-2026-10-23-promptkit-v2-migration-plan`
- **Audit Status**: complete
- **Resolved Diff Reference**: revised plan (working tree) against the 2026-10-21 audit plan
- **Audit Result**: Candidate(s) recorded
- **Authority**: `pk:review`; this report is the sole home for the recommendation

<a id="SIMPLIFICATION-REVIEW-2026-10-23-promptkit-v2-migration-plan-001"></a>
### Simplification Candidate: `SIMPLIFICATION-REVIEW-2026-10-23-promptkit-v2-migration-plan-001`

- **Candidate ID**: `SIMPLIFICATION-REVIEW-2026-10-23-promptkit-v2-migration-plan-001`
- **Classification**: `deletion`
- **Affected Location**: the audit's C5 "back-fill all 76 legacy cards" and the revised plan's legacy
  conversion scope
- **Diff Evidence**: audit §5.1 / decision 3; measured 6/76 `Task ID`, 5/76 `Record Type`; validator ID
  rules at upstream `scripts/validate-execution-control.sh:245-250`
- **Behavior-Preservation Condition**: the legacy cards remain readable history; new L2/L3 work uses
  the v2 template; `validate-execution-control --root .` exits 0 and the record count grows only by the
  one migration Task Record.
- **Risk**: future reviewers may read the legacy prose as if it were execution-control evidence. The
  plan mitigates this by stating the cards are historical and by requiring new records.
- **Verification Action**: run the v2 validator after C5; confirm exit 0 and `RECORDS=1` (the migration
  record only); confirm no legacy card was rewritten.
- **Recommendation**: delete the bulk back-fill from this migration. It is not a prerequisite, it has
  no valid ID scheme without a separate profile decision, and it would add 76 evidence-degraded records
  to a PR that is already dominated by a submodule move.

---

## Verification Evidence

| Check | Result |
| :--- | :--- |
| `git submodule status` | `2340251` installed; clean |
| `git -C .promptkit describe --tags` | `v1.8.0-15-g2340251` |
| Upstream HEAD | `0cfa093` = `v2.0.0-71-g0cfa093` |
| `git diff --stat 2ecc74b..HEAD` | 79 files, +5,892 / −75 |
| `git diff --stat v1.8.0..HEAD` | 568 files, +51,221 / −2,267 |
| v2 doctor on current tree | exit 0; hosts 5 OK; version / docs-drift / provenance `SKIP` |
| v1.8 execution-control validator | exit 0, `VALID|RECORDS=0` (only checks STATE with §3A) |
| v2 execution-control validator | **exit 1**, `ERRORS=86`, `RECORDS=0` |
| `validate-references.sh` (v1.8) | exit 0 |
| `git diff --no-index --check /dev/null <file>` on the new docs | no whitespace errors; final newline present |

**Not measured, not claimed**: the v2 installer on this repository, the project's test/lint/typecheck
suites, the new CI workflow on GitHub, the token cost of `turbo`, and any savings from compaction.

---

## Recommendation

Proceed only with the revised plan's C1–C5 in one PR, then C6 (CI) separately. Do not execute the
2026-10-21 audit verbatim: its pin is stale, its validator evidence is from the old engine, its card
conversion is invalid without a profile decision, and its CI proposal cannot run on the docs-only
changes it is meant to protect.
