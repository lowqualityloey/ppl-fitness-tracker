# PromptKit OS — Install Audit & v2.0.0 Migration Assessment

**Date**: 2026-10-21 · **Scope**: `.promptkit` submodule, the five installed host directives, `PROMPTKIT.md`, `docs/STATE.md`, and the gap to `github.com/lowqualityloey/promptkit-os` @ `v2.0.0`.

**Method**: read-only. Upstream cloned to `/tmp/pk-upstream` (`v2.0.0-39-g2ecc74b`). Every number below came from a command run this session; nothing was executed against the migration target.

---

## 1. Verdict

The install is **structurally sound and functionally stale**.

- Nothing is broken: references validate, the submodule is clean, and all five host directive blocks are intact and byte-identical to each other.
- The engine is **6 releases / 5 weeks behind**: `v1.8.0-15` (2026-09-16) → `v2.0.0` (2026-10-12).
- The real damage is **in the host artifacts, not the kit**: `docs/STATE.md` has grown to 520 KB with a single 12 KB line carrying 23 compressed checkpoints, and `PROMPTKIT.md` describes a tree that no longer exists. Upgrading the engine will *not* fix either — v2's installer only touches the machine-readable lines.

---

## 2. What is healthy (measured)

| Check | Result |
| :--- | :--- |
| Submodule pointer | `2340251` = `v1.8.0-15-g2340251`, `git status` clean |
| `validate-references.sh` | **exit 0** — "All references valid! No broken links found." |
| Directive block vs `templates/agent-directive-template.md` | identical after `$KIT_DIR_REL` → `.promptkit` substitution, plus the two leading newlines the host file always carried |
| Host block md5 | `7dc523825c728e3b0d55d94f3512bbf5` on `CLAUDE.md`, `.clinerules/promptkit.md`, `.opencode/rules.md`, `.github/copilot-instructions.md` |
| `AGENTS.md` | `88a40f32…` — differs only by the `next dev`-regenerated `nextjs-agent-rules` block, appended **outside** the `PROMPTKIT_START/END` markers |
| `validate-execution-control.sh --root .` | exit 0, `RECORDS=0` (no v2 execution-control records; non-strict) |
| v2 `check-doctor.sh .` (run from the upstream clone) | 5 hosts `OK`, 4 `SKIP(not installed)`, all ignore checks `OK` |

So the v1.8 install did what v1.8 promised. The findings below are about age, host-side entropy, and unenforced gates.

---

## 3. Findings

### S1 — `docs/STATE.md` is no longer readable as a state store

Measured: **2,677 lines / 520,159 bytes** (~130 k tokens).

| Region | Evidence |
| :--- | :--- |
| §1 Executive Summary | lines 3–339, **55,991 bytes** |
| `Last Updated` | `docs/STATE.md:293` — **one line, 12,005 characters, 23 `Earlier:` entries** |
| §8 Session Continuity Log | lines 1575–2661, **1,087 lines** |
| Competing "where am I now" fields | **18** `Current Working Branch — … (supersedes …)` bullets inside §1 |

Two failure modes follow directly:

1. The kit's own rule — recite invariants from a *current* read of `STATE.md` — now costs a six-figure token read before any work starts, which is exactly the pressure that produces the search-circuit-breaker halts.
2. §1 contains mutually exclusive claims in one file (an early bullet says "Nothing is in flight" three times, then a later bullet declares two concerns in flight). A human or agent quoting §1 can be wrong depending on which bullet they read.

v2's `templates/state-tracker-template.md` is **166 lines / 10,494 bytes**, with contiguous-table invariants for §8/§9 and a single `Current Working Branch` field, and `protocols/context-economy.md` mandates minimum-sufficient context. This is the finding the upgrade *enables* you to fix; it does not fix it for you.

### S1 — `PROMPTKIT.md` describes a tree that is gone

Measured **359 lines / 38,542 bytes**, last intake scan 2026-09-14.

| Claim in `PROMPTKIT.md` | Actual on disk |
| :--- | :--- |
| "Route handlers (**11** `route.ts` files)" (line 79) | **14** |
| "**62** `.test.ts` files" (lines 87, 140) | **85** |
| "**13** spec files / 61 tests" (line 177) | **16** spec files |

The file's own §6 rule is "Documentation describes what exists, not what is planned." The file violates its own rule, which is worse than an absent section: it is the artifact every session reads first.

### S2 — None of the kit's gates run anywhere

`.github/workflows/` contains exactly one file, `test.yml`, and it has **zero** references to `promptkit`. There is no tracked git hook. Therefore:

- `validate-references.sh`, `validate-execution-control.sh`, `validate-release-records.sh`, `check-contrast`, and the kit's secret scan are all **manual**.
- The 6 protocols' quality gates are advisory by construction on this repo. No CI can notice when they stop holding.

v2 adds exactly the machinery that would have caught S1: `pk:doctor` (installed-governance audit), `scripts/scan-staged-secrets.sh`, `scripts/check-checkpoint-ignore.sh`, and `scripts/pk route`.

### S2 — Missing v2 machine-readable profile lines

`PROMPTKIT.md` carries only `profile: turbo` and `tracking: github`. v2's `templates/project-profile-template.md` expects six more, and their absence is observable:

- Missing `status-cards:` → card emission is inferred rather than declared.
- Missing `card-style:` → framed vs markdown callouts are unspecified.
- Missing `ai-attribution:` → commit/PR attribution policy defaults silently.
- Missing `size:` / `intake-status:` → `pk:plan` Step 0 cannot tell a completed intake from an unanswered one.
- `docs/STATE.md` has **no `Engine Version:` row** → v2's doctor reports `version SKIP(no engine stamp)`, i.e. the drift detector designed for this exact audit stays switched off.
- `docs/STATE.md` has no §3A projection → doctor reports `docs-drift SKIP(no execution-control projection)`.

### S2 — The submodule still names the retired repository

`.gitmodules` and `.promptkit`'s `origin` both say `lowqualityloey/better-promptkit`. The canonical repository is `promptkit-os`; the old name resolves only through a GitHub rename redirect. A redirect is not a pin — fix the URL as part of the migration, not after it.

### S3 — `docs/tasks/` is not execution-control shaped

76 Markdown files under `docs/tasks/`, all legacy cards with prose bodies. The v2 validator found `RECORDS=0` because it keys on `- **Record Type**:` and the 20-label field set. The newest record, `docs/tasks/m4/M4-29-first-release.checkpoint-03.md` (untracked at audit time), has a `**Task ID**` and rich prose phases but no record type or labeled fields, so it too is invisible to the validator and to STATE §3A.

This is a **policy choice**, not a defect: the legacy cards are the historical record and should not be rewritten. But any *new* Controlled (L2/L3) work under v2 should use `templates/execution-task-record-template.md` / `templates/execution-checkpoint-template.md`, or the validator is decoration.

### S3 — Working tree is dirty at audit time

`docs/STATE.md` modified; `docs/tasks/m4/M4-29-first-release.checkpoint-03.md` untracked. The migration must start from a clean, committed tree or its own diff will be unreviewable.

### S3 — Engine gap: 510 changed files, 382 added

`v1.8.0..HEAD` = **510 files changed, +45,392 / −2,255**. What lands:

| Surface | v1.8.0-15 (installed) | v2.0.0 |
| :--- | :--- | :--- |
| `workflows/` | **23** | **26** (+`auto.md`, `doctor.md`, `verify-bootstrap.md`) |
| `protocols/` | **6** | **9** (+`context-economy.md`, `checkpoint-ignore-policy.md`, `rendered-ui-evidence.md`) |
| Directive template | 9,908 B | 9,364 B (smaller: description compression, new Context Economy / Context Recovery / Pre-response rules) |
| Router | absent | `scripts/pk-route.sh` + `scripts/pk` shim (offline, deterministic, exit 2 on unknown subcommand) |
| Execution control | validation only | verification-evidence contract, checkpoint/handoff records, STATE §3A projection |
| Install safety | marker replacement | + keyboard wizard, host-aware targeting, `--add-host`, destination containment, transactional staging with rollback |
| Governance | none | `pk:doctor`, staged-secret scan, checkpoint-ignore preflight, AI-attribution policy |

---

## 4. What the upgrade does *not* cost you

The v2 headline **breaking change** is the retirement of Jev / System One assisted routing. It has **no impact here**:

- v1.8.0-15 ships no `scripts/pk-route.*` at all, so there is no configuration to migrate.
- `rg 'AI_GATEWAY|TYPESAFE|Jev'` across the repo (excluding `.promptkit/` and `node_modules/`) returns **no real hits** — one `sha512` blob in `package-lock.json` contains the substring by chance.
- The `--timeout` / `--dry-run` compatibility no-ops apply to automation that calls the router; nothing in this repo does.

Second non-issue: **`AGENTS.md`'s Next.js block survives**. v2's `init.sh` replaces only the lines between `<!-- PROMPTKIT_START -->` and `<!-- PROMPTKIT_END -->` (verified in `init.sh`'s awk injector), so the `next dev`-managed rules outside the markers are untouched.

Third: **`PROMPTKIT.md`'s body survives**. v2's `init.sh` rewrites `profile:` / `tracking:` / `projection:` and inserts a `- **Engine Version**:` row into `docs/STATE.md` after `- **Last Updated**:`. It never replaces the hand-maintained body. That is why S1/S2 must be scheduled as their **own** change.

---

## 5. Execution plan (ratified: `main` @ `2ecc74b`, one change)

Target: **`main` HEAD `2ecc74b` (`v2.0.0-39`)**. The submodule gitlink records that exact SHA, so the pin is reproducible even though it is not a release tag; re-pinning later is a one-line gitlink bump. Everything below lands in **one branch / one PR**, ordered as separate commits so the diff stays reviewable.

```bash
# 0. Clean tree first — the two current items are their own commit
git add docs/STATE.md docs/tasks/m4/M4-29-first-release.checkpoint-03.md \
        docs/reviews/2026-10-21-promptkit-os-install-audit.md
git commit -m "docs(state): checkpoint 03 at 532c1c9"
git switch -c chore/promptkit-v2-sync

# 1. Re-point the submodule at its canonical name, then pin the release
git submodule set-url .promptkit https://github.com/lowqualityloey/promptkit-os
git submodule update --init --remote .promptkit
git -C .promptkit checkout 2ecc74b        # main HEAD, v2.0.0-39
git -C .promptkit log --oneline -1        # expect: 2ecc74b Merge pull request #640 ...

# 2. Re-run the installer with the exact host set that exists here.
#    AGENTS.md is always written; --host= skips the interactive wizard.
bash .promptkit/init.sh --turbo --experimental \
  --host=claude,opencode,copilot,cline --tracking=github

# 3. Verify before committing anything
bash .promptkit/scripts/check-doctor.sh .        # expect no SKIP(no engine stamp)
bash .promptkit/scripts/validate-references.sh   # expect exit 0
git diff --stat                                   # expect: .promptkit, 5 host files, PROMPTKIT.md machine lines, STATE.md Engine Version row
git diff -- AGENTS.md | head -40                  # confirm the Next.js block is untouched

# 4. Rollback if step 3 is not clean
git checkout -- .
git -C .promptkit checkout 2340251
```

Notes and caveats:

- The validators and installers are shipped `100644` (`scripts/pk` is `100755`); invoke the validators as `bash .promptkit/scripts/<name>.sh`.
- v2's `init.sh` stages every write and restores snapshots on failure (`STAGING_DIR` / `BACKUP_DIR` / `rollback` trap), so a mid-run failure is recoverable — but it is still a file-writing step: commit or stash before running it.
- Run `validate-execution-control.sh --root .` **non-strict** as the standing gate. `--strict` is not a valid gate for this tree even after §5.1: the back-filled records are evidence-degraded by design, and making them pass would require the fabricated evidence the kit forbids.

### Commit sequence inside the one change

Ordered so a reviewer can read one concern at a time, even though the branch merges once.

| # | Commit | Contents |
| :--- | :--- | :--- |
| C1 | `chore(state): checkpoint 03` | The pending checkpoint, this audit, and `docs/STATE.md` — committed before anything moves |
| C2 | `chore(promptkit): engine v2.0.0-39 sync` | `.promptkit` gitlink, `.gitmodules` URL, 5 regenerated host blocks. No host-authored file. |
| C3 | `docs(profile): v2 machine lines + measured counts` | `PROMPTKIT.md` only |
| C4 | `docs(state): compaction` | `docs/STATE.md` §1 collapse, §8 truncation, `Engine Version` row |
| C5 | `docs(tasks): execution-control records` | The converter output for the 76 legacy cards (§5.1) |
| C6 | `ci: promptkit gates` | `test.yml` additions |
| C7 | `docs(promptkit): sync` | Post-bump `pk:sync` notes, if the workflow produces any |

A PR body that lists C1–C7 as the review order is what makes the single-change decision survivable; without it the PR is a 510-file submodule move plus a 520 KB rewrite in one diff.

### 5.1 Migrating the 76 legacy cards (ratified: back-fill all of them)

This is the one part of the plan with a hard honesty constraint.

- The cards record **decisions and outcomes**, not machine evidence. Most carry no `exit_code`, no `diff_digest`, no verification block — those fields did not exist when they were written.
- The kit's oracle rule forbids inventing evidence. So the converter must emit **structural records with explicit degradation**: every unmapped evidence field is written as `not recorded (historical import 2026-10-21)`, never as a plausible value, and never as `PASS`.
- Realistic outcome: ~76 `Task Record`s that validate structurally, plus a set of `POLICY_LIMITATION` / `READINESS_FAILURE` diagnostics for tasks whose original scope and acceptance criteria were never written in that shape. **`--strict` will not go green on the back-filled set**, and that is the correct result — not something to fix by writing fake evidence.
- Do it with a committed script (`scripts/migrate-task-records.ts` or a one-off under `scripts/`), not 76 hand edits: reviewable, re-runnable, and revertible. Map `TASK-<slug>` from the existing filename; keep the original card path in a `Legacy Card` field so provenance survives.
- Expect the back-fill to be reviewed as a *mechanical* diff. Any card where the converter cannot decide a required value should be listed in a `docs/tasks/MIGRATION-UNRESOLVED.md`, not guessed.

### Detail for C3, C4, C6

5. **`PROMPTKIT.md` refresh** — add `status-cards: on`, `card-style: framed`, `ai-attribution: host-default`, `size: medium`, `intake-status: legacy-partial`; correct §1/§2/§3 counts to measured values (14 routes, 85 unit/integration files, 16 e2e specs); state the engine row as `v2.0.0-39 @ 2ecc74b`.
6. **`docs/STATE.md` compaction** — collapse the 18 branch bullets into one; move the 23 `Earlier:` entries on line 293 into §8 rows; truncate §8 to the current milestone plus a pointer to git history. Target the v2 template's shape (166 lines is the template, not a hard cap). This is the change that actually buys back context budget.
7. **CI wiring** (optional, highest value per line) — add `validate-references.sh`, `scan-staged-secrets.sh` on the PR diff, and `check-doctor.sh` as an informational (non-blocking at first) job in `test.yml`.
8. **`pk:sync`** in the first session after the bump, per the directive's disk-first rule.

---

## 6. Ratified decisions (2026-10-21)

| # | Decision | Ruling | Consequence accepted |
| :--- | :--- | :--- | :--- |
| 1 | Migration target | **`main` HEAD `2ecc74b`** | Not a release tag. Mitigated by the gitlink recording the SHA; re-pin later is one line. Re-validate if `main` moves before C2 lands. |
| 2 | Work split | **One branch / one PR** | Mitigated by the C1–C7 sequence in §5 and a review-order PR body. `git bisect` across the PR is not meaningful; per-commit revert is. |
| 3 | Legacy task cards | **Back-fill all 76** | Accepts structural records with explicit `not recorded` degradation; `--strict` will not pass (§5.1). Fabricating evidence to make it pass is out of bounds. |
| 4 | Profile after upgrade | **`turbo`** (`--turbo --experimental`) | Parallel-wave token cost retained; `balanced` remains the fallback if the waves become noise. |

Reversibility: the entire change is one `git revert` of the merge (C2's gitlink plus C3–C6 are pure file content), and locally `git -C .promptkit checkout 2340251` restores the old engine.

---

## 7. Provenance

Commands run this session: `git submodule status`, `git -C .promptkit log/describe/remote`, `git ls-remote` (both repository names), `git clone` of `promptkit-os` to `/tmp/pk-upstream`, `git diff --name-status/--stat v1.8.0..HEAD`, `CHANGELOG.md` sections for 1.9.0–2.0.0, `docs/MIGRATION.md`, `templates/*`, `init.sh` inspection, `bash .promptkit/scripts/validate-references.sh`, `bash .promptkit/scripts/validate-execution-control.sh --root .`, `bash /tmp/pk-upstream/scripts/check-doctor.sh .`, `wc -lc`, `awk` line/byte counts of `docs/STATE.md`, `fd`/`rg` counts for routes and specs, and `md5sum` on the five host files.

Not measured, and not claimed: any behavior of the v2 installer on this repository (it was not run), the v1.8 instruction set's live behavioral compliance, and any token savings from the proposed compaction.
