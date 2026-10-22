# Spec: PromptKit OS Migration — v1.8.0-15 → v2.0.0-71

- **Status**: Executed on `chore/promptkit-v2-sync` (C1–C4); C5 governance CI remains
- **Date**: 2026-10-23
- **Supersedes**: the execution plan in `docs/reviews/2026-10-21-promptkit-os-install-audit.md` §5
- **Scope**: governance install only. No application code, schema, auth, release, or deployment action.
- **Ceremony**: Level 2 (Controlled). Execution requires a canonical Task Record before C1.
- **Target pin**: `0cfa09390e4f6f0ffe090a6ba193db912b9a3c6d` = `v2.0.0-71-g0cfa093`, repository
  `lowqualityloey/promptkit-os` (`https://github.com/lowqualityloey/promptkit-os`).

---

## 1. Outcome

Move the `.promptkit` submodule from `v1.8.0-15-g2340251` to current upstream HEAD, re-inject the five
installed host directives, add the v2 machine-readable profile fields, and leave the repository with:

1. the engine pinned to a reproducible SHA and the canonical repository URL;
2. `pk:doctor` reporting `version OK` rather than `SKIP(no engine stamp)`;
3. `docs/STATE.md` compact enough to read every session and structurally valid for the v2
   execution-control validator;
4. an opt-in CI workflow that actually runs the installed governance gates, including on docs-only
   changes that the existing `test.yml` intentionally skips.

**Explicit non-goals**

- No application source, database, auth, API, or production change.
- No bulk rewrite of the 76 legacy `docs/tasks/` cards. v2's execution-control validator is adopted as
  the gate for *new* L2/L3 records only; the old cards remain the historical record.
- No §3A projection and no invented intake record. Both checks are allowed to `SKIP` until there is a
  canonical record to project.
- No release, tag, deployment, or CI billing change.

---

## 2. Decisions this plan makes

| # | Decision | Value | Why |
| :--- | :--- | :--- | :--- |
| D1 | Target revision | `0cfa093` (`v2.0.0-71`), not the `v2.0.0` tag | The current fixes include the profile-date migration (#643), `intake-record` (#647), the five-check doctor (#646), and provenance hardening (#641). The submodule gitlink records the exact SHA, so pinning unreleased HEAD is reproducible; re-pinning is one line. |
| D2 | Delivery shape | Two PRs: engine/profile/state, then CI | The engine diff is a 500+ file submodule move plus a 520 KB state rewrite. Splitting review from automation keeps each diff attributable. |
| D3 | Legacy task cards | Defer conversion | Only 6 of 76 cards carry a `Task ID` and 5 carry a `Record Type`; the validator's default ID rule is `TASK-YYYY-MM-DD-<slug>`, while the existing IDs are `TASK-m4-...`. The audit's `TASK-<slug>` mapping is only valid under `PromptKit Adaptation Profile: sdlc-overlay-v1`, which also demands adaptation fields the cards lack. |
| D4 | Profile / tracking | Keep `turbo` / `github` | Existing ratified posture. Turbo's ~2× token cost is retained knowingly; re-evaluate after two normal sessions. |
| D5 | State projection | No §3A yet | Without a canonical Task Record, a §3A filled with placeholders would make `docs-drift` compare fiction. `SKIP(no execution-control projection)` is the honest result until one exists. |

---

## 3. Measured baseline

All values were produced in this planning session; commands are listed in §9.

| Surface | Measured now | Source |
| :--- | :--- | :--- |
| Engine gitlink | `2340251` = `v1.8.0-15-g2340251` (2026-09-16) | `git submodule status`, `git -C .promptkit describe` |
| Upstream HEAD | `0cfa093` = `v2.0.0-71-g0cfa093` (2026-10-23) | `git ls-remote`, clone |
| Commits since audit pin | 32 (`2ecc74b..0cfa093`), 79 files, +5,892 / −75 | `git diff --stat 2ecc74b..HEAD` |
| Engine delta since installed | 568 files, +51,221 / −2,267 | `git diff --stat v1.8.0..HEAD` |
| Workflows / protocols | 26 / 9 (was 23 / 6) | `ls .promptkit/workflows`, `ls protocols` |
| State template | 178 lines / 11,821 bytes | `wc -lc templates/state-tracker-template.md` |
| Directive template | 9,364 bytes | `wc -c templates/agent-directive-template.md` |
| `docs/STATE.md` | 2,677 lines / 520,159 bytes; `Last Updated` line 12,005 bytes with 23 `Earlier:` entries (26 in the file); 20 `Current Working Branch` mentions | `wc`, `awk`, `rg` |
| `PROMPTKIT.md` | 359 lines / 38,542 bytes; last intake 2026-09-14 | `wc`, file read |
| Measured app counts | 14 `route.ts`; 80 `.test.ts`; 16 e2e `.spec.ts`; 96 total test/spec files | `fd` + `rg` |
| Task cards | 76 Markdown files; 6 with `Task ID`; 5 with `Record Type` | `fd`, `rg -l` |
| Host directives | 5 files: `AGENTS.md`, `CLAUDE.md`, `.opencode/rules.md`, `.github/copilot-instructions.md`, `.clinerules/promptkit.md` | `ls`, `md5sum` |
| Dirty tree | `M docs/STATE.md`; `??` audit doc; `??` checkpoint-03 | `git status --porcelain` |
| Branch | `fix/drizzle-orm-cve` @ `81fdd3c`, one commit ahead of `main` | `git status -sb`, `git log main..HEAD` |
| Existing CI | One workflow (`test.yml`); no PromptKit job; `paths-ignore` covers `docs/**` and `**/*.md` | `.github/workflows/test.yml` |
| v2 doctor on current tree | hosts OK (5), version `SKIP(no engine stamp)`, ignore rows OK except engine `SKIP(engine outside project root)` because the checker was external, `docs-drift SKIP`, `provenance SKIP`; exit 0 | `/tmp/pk-upstream/scripts/check-doctor.sh .` |
| v2 execution-control validator | **exit 1**, `ERRORS=86`, `RECORDS=0` — all 86 are `ORPHANED_TABLE_ROW` in `docs/STATE.md` | `scripts/validate-execution-control.sh --root .` |

The last row is the material change from the audit. The audit reported `RECORDS=0` at exit 0, but its
cited command was the **v1.8** validator, which only inspects `docs/STATE.md` when §3A exists (`.promptkit/scripts/validate-execution-control.sh:584`).
The v2 validator validates tables unconditionally. The standing gate is therefore red **before** the
migration, not after it.

---

## 4. What changed since the 2026-10-21 audit

`2ecc74b..0cfa093` is 32 commits. The behavior surfaces that matter to this repository:

| Change | Effect on this migration |
| :--- | :--- |
| #643 — `Installed` → `Profile written` | The installer now migrates `- **Installed**: 2026-09-14` to one `- **Profile written**: 2026-09-14`, retaining the date. The audit's C3 did not mention this. |
| #647 — `intake-record` authority | The v2 profile has one more machine field. Absent is valid for a legacy profile; do not invent a path. |
| #646 — doctor five-check contract | The report is hosts, version, ignore-state, docs-drift, provenance. The audit described four checks. |
| #641 / #644 / #648 — provenance and state-template hardening | The template's invariant examples are now explicitly illustrative; the doctor's provenance check fails closed on bad paths. Neither changes the install command. |
| Execution-control validator | Unchanged since `2ecc74b`, but now demonstrably red on this `STATE.md` (see §3). |
| No new workflows/protocols after v2.0.0 | Still 26 / 9; the audit's counts hold. |

---

## 5. Migration steps

### C1 — Establish a clean, honest baseline

Do not run the installer on the current dirty tree.

```bash
# Start from the integration tip. If fix/drizzle-orm-cve merges first, branch from main instead.
git switch -c chore/promptkit-v2-sync

# Stage only the baseline artifacts, not application code.
git add docs/STATE.md \
        docs/tasks/m4/M4-29-first-release.checkpoint-03.md \
        docs/reviews/2026-10-21-promptkit-os-install-audit.md \
        docs/specs/2026-10-23-spec-promptkit-v2-migration.md \
        docs/reviews/2026-10-23-promptkit-v2-migration-plan-review.md
git commit -m "docs(promptkit): record the pre-migration baseline"
```

Baseline caveat: checkpoint-03 records `main @ 532c1c9`, but the current branch tip is `81fdd3c`
(the drizzle upgrade). Commit it as a historical record with that SHA intact, **or** regenerate it at
`81fdd3c`. Do not edit the recorded SHA to make it look current.

### C2 — Repoint and pin the engine

```bash
git submodule set-url .promptkit https://github.com/lowqualityloey/promptkit-os
git submodule sync -- .promptkit
git -C .promptkit fetch origin --tags
git -C .promptkit checkout 0cfa09390e4f6f0ffe090a6ba193db912b9a3c6d
```

Verify before staging:

```bash
git -C .promptkit rev-parse HEAD        # 0cfa09390e4f6f0ffe090a6ba193db912b9a3c6d
git -C .promptkit describe --tags --match 'v[0-9]*'  # v2.0.0-71-g0cfa093
git -C .promptkit remote -v             # origin .../promptkit-os
git submodule status                    # after `git add .promptkit`, no leading + or -
```

Before the gitlink is staged, `git submodule status` will show a leading `+` because the working-tree
checkout differs from the index. That is expected; the `+` disappears after `git add .promptkit`.

If `describe` returns only a SHA, tags did not arrive: repeat the fetch with `--tags` before running
the installer, otherwise the Engine stamp degrades to `0cfa093 (0cfa093)`.

### C3 — Re-run the canonical installer

```bash
bash .promptkit/init.sh --turbo --experimental \
  --host=claude,opencode,copilot,cline --tracking=github
```

The installer is transactional (staging + snapshot + rollback trap), but it still writes files. Across
C2 + C3 the total diff is exactly these nine paths:

```text
.gitmodules
.promptkit
AGENTS.md
CLAUDE.md
.clinerules/promptkit.md
.opencode/rules.md
.github/copilot-instructions.md
PROMPTKIT.md
docs/STATE.md
```

C3's own diff is the five host files plus `PROMPTKIT.md` and `docs/STATE.md`; `.gitmodules` and
`.promptkit` belong to C2.

Any application file in `git diff --stat` is a stop condition.

Verify:

```bash
rg -n '^Engine: v2\.0\.0-71-g0cfa093 \(0cfa093\)' \
  AGENTS.md CLAUDE.md .opencode/rules.md .github/copilot-instructions.md .clinerules/promptkit.md
rg -n '^- \*\*Profile written\*\*: 2026-09-14$' PROMPTKIT.md   # exactly one
rg -n '^- \*\*Installed\*\*:' PROMPTKIT.md                     # no output
rg -n '^- \*\*Engine Version\*\*: v2\.0\.0-71-g0cfa093 @ 0cfa093$' docs/STATE.md
git diff -- AGENTS.md | head -40                            # Next.js block outside markers untouched
```

The installer will **not** add `status-cards`, `card-style`, `ai-attribution`, `size`, or
`intake-status`; those are C4. It **will** rewrite `profile:` / `tracking:` and insert the Engine row.

### C4 — Finish the profile

Edit `PROMPTKIT.md` only. Add the v2 machine lines after `profile: turbo`, before `tracking: github`:

```text
profile: turbo

status-cards: on
card-style: framed
ai-attribution: host-default
intake-status: legacy-partial

tracking: github
```

- `size:` is deliberately omitted pending O2. The v2 size table classifies this project as **large**
  (authentication + data + deployment), not `medium`; a missing `size:` on an existing install resolves
  to `legacy-partial` and does not trigger a re-interview. Do not write `medium`.
- `intake-status: legacy-partial` is the honest status: there was no bounded v2 intake, and the
  codebase is the record. Do **not** add `intake-record:` without a real file.
- `ai-attribution: host-default` preserves current behavior. Use `off` only if the owner wants
  PromptKit to strip AI trailers from commits/PRs.

Update §0 of the same file:

- Engine row: `.promptkit` @ `0cfa093` = **v2.0.0-71**, canonical URL `promptkit-os`.
- Workflows / protocols: **26 / 9** (was 23 / 6).
- Host blocks: **5**, new md5 (measure after C3).
- Replace the stale v1.7/v1.8 "what changed" essays with a compact v2 delta: `pk:auto`, `pk:doctor`,
  context economy, execution control, canonical router. Keep the SHA the row describes.
- Correct §2/§3/§5 counts to the measured values in §3: **14** routes, **80** `.test.ts`, **16**
  e2e `.spec.ts`, **96** total.

### C5 — Compact and repair `docs/STATE.md`

This is the change that buys back context budget and turns the standing validator green.

1. Collapse the 20 `Current Working Branch` mentions in §1 to one current value.
2. Replace the 12,005-byte `Last Updated` line with one dated sentence. Move the 23 `Earlier:` entries
   on that line (26 in the file) into §8 rows, or replace the older ones with a pointer to git history.
3. Truncate §8 to the current milestone, the open blockers, the locked invariants, and the three most
   recent checkpoints. Older rows are recoverable with `git log --follow -- docs/STATE.md`.
4. Reflow every §8 table so rows are contiguous, every row has the same column count as its header,
   and no blank line or prose interrupts a table. The 86 `ORPHANED_TABLE_ROW` diagnostics are all in
   §8; the validator is the acceptance check.
5. Keep the `Engine Version` row written by C3.
6. Do **not** add §3A. Leave `docs-drift` at `SKIP(no execution-control projection)`.

Acceptance:

```bash
bash .promptkit/scripts/validate-execution-control.sh --root .
# expected: VALID|RECORDS=0, exit 0
```

`RECORDS=0` remains correct: there are no canonical v2 Task Records yet. `--strict` is not an
acceptable gate for this tree; it would demand records that do not exist.

### C6 — Add the governance CI workflow

Do **not** add these steps to `test.yml`: it ignores `docs/**` and `**/*.md`, so the migration's own
changes would produce no run. Add a separate workflow with explicit paths.

```yaml
name: PromptKit Governance

on:
  pull_request:
    paths:
      - '.promptkit/**'
      - '.gitmodules'
      - 'PROMPTKIT.md'
      - 'AGENTS.md'
      - 'CLAUDE.md'
      - '.clinerules/**'
      - '.opencode/**'
      - '.github/copilot-instructions.md'
      - 'docs/STATE.md'
      - 'docs/tasks/**'
  push:
    branches: [main]
    paths:
      - '.promptkit/**'
      - '.gitmodules'
      - 'PROMPTKIT.md'
      - 'AGENTS.md'
      - 'CLAUDE.md'
      - '.clinerules/**'
      - '.opencode/**'
      - '.github/copilot-instructions.md'
      - 'docs/STATE.md'
      - 'docs/tasks/**'

jobs:
  audit:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive
          fetch-depth: 0
      - name: Refresh engine refs
        run: git -C .promptkit fetch --tags origin main
      - name: Doctor
        run: bash .promptkit/scripts/check-doctor.sh .
      - name: Reference integrity
        run: bash .promptkit/scripts/validate-references.sh
      - name: Execution-control records
        run: bash .promptkit/scripts/validate-execution-control.sh --root .
```

Notes:

- `check-doctor.sh` needs `origin/main` inside the submodule to compare the stamp; fetch it explicitly.
- `check-doctor.sh` exits 0 with `docs-drift SKIP` and `provenance SKIP`. That is a pass, not a full
  green board; the workflow should not print a stronger claim.
- Do **not** wire `scan-staged-secrets.sh` here. It reads the **staged index**, and CI checkouts have
  no staged diff. Keep it in `pk:commit`; a PR-diff wrapper is separate work.
- Make the execution-control step blocking only after C5 is green on `main`.

### C7 — Sync and checkpoint

Run `pk:sync` in the first session after the bump so the directive is loaded from disk, then update
`docs/STATE.md` and take a checkpoint. Re-run:

```bash
bash .promptkit/scripts/check-doctor.sh .
bash .promptkit/scripts/validate-references.sh
bash .promptkit/scripts/validate-execution-control.sh --root .
```

---

## 6. Commit and review sequence

| # | Commit | Contents | PR |
| :--- | :--- | :--- | :--- |
| C1 | `docs(promptkit): record the pre-migration baseline` | `STATE.md`, checkpoint-03, audit, this plan, the review | A |
| C2 | `chore(promptkit): pin engine v2.0.0-71 (0cfa093)` | gitlink, `.gitmodules`, 5 host blocks, installer stamps in `PROMPTKIT.md` / `STATE.md` | A |
| C3 | `docs(profile): v2 machine lines and measured counts` | `PROMPTKIT.md` only | A |
| C4 | `docs(state): compact and repair the tracker` | `docs/STATE.md` only | A |
| C5 | `ci(promptkit): run the installed governance gates` | new workflow | B |
| C6 | `docs(promptkit): post-migration sync` | sync notes, if any | B |

Review order is C1 → C2 → C3 → C4, then C5 → C6. Do not mix C5/C4 into one commit; the state reflow is
the only part a reviewer needs to inspect line by line.

---

## 7. Acceptance criteria

| ID | Criterion | Evidence |
| :--- | :--- | :--- |
| AC-1 | `.promptkit` is at `0cfa093` and `.gitmodules` names `promptkit-os` | `git submodule status`, `git -C .promptkit describe`, `cat .gitmodules` |
| AC-2 | All five host directives carry `Engine: v2.0.0-71-g0cfa093 (0cfa093)` | `rg` across the five files |
| AC-3 | `AGENTS.md`'s `nextjs-agent-rules` block is byte-identical | `git diff -- AGENTS.md` shows only the PromptKit block |
| AC-4 | `PROMPTKIT.md` has exactly one `Profile written: 2026-09-14`, no `Installed` line, and the four non-guessed v2 machine lines (`status-cards`, `card-style`, `ai-attribution`, `intake-status`); `size:` stays absent pending O2 | `rg` |
| AC-5 | `docs/STATE.md` has one `Last Updated`, one `Current Working Branch`, and the `Engine Version` row | `rg`, `wc -lc` |
| AC-6 | v2 execution-control validator exits 0 with `VALID`, `RECORDS=0` | validator run |
| AC-7 | `validate-references.sh` exits 0 | script run |
| AC-8 | `check-doctor.sh` exits 0; `version OK` (or `STALE(+n)` only if upstream advanced after `0cfa093`); `docs-drift` and `provenance` `SKIP` with reasons | doctor run |
| AC-9 | No application file changed | `git diff --stat` scope check |
| AC-10 | A docs-only PR touching `PROMPTKIT.md` or `docs/STATE.md` produces a PromptKit Governance run | PR check list |

---

## 8. Risks, failure modes, and rollback

| Risk | Detection | Mitigation | Rollback |
| :--- | :--- | :--- | :--- |
| Installer runs on a dirty tree | `git status --porcelain` before C3 | C1 commits the baseline | `git checkout -- .`; re-run after C1 |
| Installer writes an unexpected file | `git diff --stat` against the expected nine paths | Stop and inspect; do not stage | Installer's own snapshot/rollback trap, plus `git checkout -- .` |
| Tags missing, weak Engine stamp | `git -C .promptkit describe` returns only SHA | `fetch origin --tags` before install | Re-fetch and re-run; stamp is a line write |
| Old URL survives in submodule config | `git -C .promptkit remote -v` | `git submodule sync -- .promptkit` after `set-url` | `git submodule set-url` back to the old URL |
| STATE reflow loses current facts | Read §1/§3A/§7/§8 diff | Keep current milestone, blockers, invariants, 3 latest checkpoints; history stays in git | `git checkout HEAD~ -- docs/STATE.md` |
| Validator stays red | `ERRORS>0` | Reflow §8 until `VALID`; do not suppress the check | Keep C4 unmerged; revert C4 |
| CI workflow never runs | PR check list empty | New workflow has explicit `paths`, not `paths-ignore` | Revert C5; manual gates remain |
| Turbo cost is not worth it | Two weeks of sessions | Re-evaluate `balanced` with measured token data | `--balanced` re-run changes one line |

The whole change is reversible with one `git revert` per PR. Locally,
`git -C .promptkit checkout 2340251` restores the old engine, and `git checkout -- .gitmodules` restores
the old URL.

---

## 9. Open decisions for the owner

| # | Decision | Recommendation | Consequence if changed |
| :--- | :--- | :--- | :--- |
| O1 | Pin HEAD `0cfa093` or released `v2.0.0` (`c5193857`) | **HEAD** | `v2.0.0` loses the profile-date, five-check doctor, and provenance fixes; HEAD is unreleased but SHA-pinned. |
| O2 | `size:` | **Confirm `large` or leave unset** | The v2 size table defines `large` as authentication + data + deployment, which this project has; `medium` would understate it. It drives `pk:plan` intake depth only; never guessed. |
| O3 | `ai-attribution: host-default` or `off` | **host-default** | `off` strips AI trailers from future commits/PRs; it does not rewrite history. |
| O4 | Keep `turbo` | **Keep for now; measure** | `balanced` is cheaper and less experimental; switching is a one-line re-run. |
| O5 | Legacy card conversion | **Defer** | Converting all 76 requires a profile decision and 76 evidence-degraded records; not a migration prerequisite. |
| O6 | Two PRs vs one | **Two** | One PR is a 500+ file submodule move plus a 520 KB state rewrite; reviewability suffers. |

---

## 10. Provenance

Commands run in this planning session:

`git submodule status`, `git -C .promptkit log/describe/remote/show`, `git ls-remote` for both repository
names, `git clone` of `promptkit-os` to `/tmp/pk-upstream`, `git log/describe/diff --stat/--name-status`
for `v1.8.0..HEAD` and `2ecc74b..HEAD`, `git diff` of `docs/STATE.md`, `git status -sb`,
`git log main..HEAD`, `git config --get-regexp '^submodule\.'`, `wc -lc`, `awk`/`rg` counts for
`docs/STATE.md` and `PROMPTKIT.md`, `fd`/`rg` counts for routes/tests/specs/task cards, `md5sum` on the
five host files, `bash .promptkit/scripts/validate-references.sh`,
`bash .promptkit/scripts/validate-execution-control.sh --root .` (v1.8), and
`bash /tmp/pk-upstream/scripts/validate-execution-control.sh --root .` (v2), plus
`bash /tmp/pk-upstream/scripts/check-doctor.sh .`.

Not measured, and not claimed: the v2 installer's actual behavior on this repository (it was not run),
the project's test/lint/typecheck suites, the new workflow's behavior on GitHub, and any token savings
from the proposed compaction.

---

## 11. Execution gate

This plan authorizes no write. Implementation starts only after:

1. O1 and O2 are ratified (the pin and the size class);
2. a canonical Task Record exists at `docs/tasks/<task-id>.md` for the execution;
3. the working tree is clean at C1's commit.

---

## 12. Execution record (2026-10-23)

- **Branch**: `chore/promptkit-v2-sync`, based on `fix/drizzle-orm-cve` @ `81fdd3c`.
- **Commits**: `9f7e5f2` baseline; `4b39636` engine pin; `427a049` host directives, profile
  fields, and measured counts; `c80b5be` §8 repair and session-log compaction.
- **Verification**: `check-doctor.sh` exit 0 (`version OK`; `docs-drift` and `provenance` `SKIP`);
  `validate-references.sh` exit 0; `validate-execution-control.sh --root .` exit 0 with
  `VALID|RECORDS=0`.
- **State**: `docs/STATE.md` reduced from 2,677 lines / 520,159 bytes to 1,572 lines / 191,705
  bytes; §8 replaced with four rows plus a `git log --follow` pointer; §1 now has one current branch
  field and 17 dated notes demoted to `Historical Branch Note`.
- **Not done**: `size:` (O2) and the C5 governance CI workflow.
- **Gate note**: O2 remains open and no canonical v2 Task Record was created; the owner's "current
  update" instruction was treated as O1 ratification. This record is the evidence, not a substitute
  for the Task Record.
- **Branch base**: the branch includes `81fdd3c` (the drizzle/vitest upgrade) because it was cut
  from `fix/drizzle-orm-cve`. Merge that first or rebase if a migration-only PR is wanted.
