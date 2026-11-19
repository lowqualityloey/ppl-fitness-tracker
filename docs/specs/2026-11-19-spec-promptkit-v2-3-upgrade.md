# Spec: PromptKit OS Upgrade — v2.0.0-71 (0cfa093) → v2.3.0 (52adbe1)

<a id="PLAN-promptkit-v2-3-upgrade"></a>

- **Status**: Proposed — not executed. Nothing in this repository has been changed by this plan.
- **Date**: 2026-11-19
- **Ceremony**: Level 2 (Controlled), Configuration Work. The canonical Task Record is
  `docs/tasks/2026-11-19-promptkit-v2-3-upgrade.md` (created by `pk:tasks`); this document
  supplies its planning inputs and creates no execution state.
- **Supersedes**: nothing. It follows `docs/specs/2026-10-23-spec-promptkit-v2-migration.md`
  (v1.8.0-15 → v2.0.0-71, executed) and closes that migration's open follow-up class.
- **Target pin**: `52adbe16c0ff2aea0d538e10c3225c2f3e40e315` = tag `v2.3.0`, repository
  `lowqualityloey/promptkit-os` (`https://github.com/lowqualityloey/promptkit-os`).
- **Scope**: governance install only. No application source, schema, auth, API, database, runtime,
  release, tag, or deployment action.

---

## 1. Outcome

Move the `.promptkit` submodule from `0cfa093` (`v2.0.0-71`, 228 commits behind) to the latest
release `v2.3.0` (`52adbe1`), re-inject the five installed host directives, and leave the repository
with:

1. the engine pinned to a released, reproducible revision;
2. all five host directives carrying the new engine stamp and the 2.3.0 untrusted-content boundary;
3. `PROMPTKIT.md` and `docs/STATE.md` hand-maintained engine claims no longer stale;
4. every installed governance validator green, or a red row recorded with a measured reason;
5. zero application-code change.

## 2. Explicit non-goals

- **No application work.** No `lib/`, `app/`, `components/`, `tests/`, schema, migration, or CI
  runtime change. The upgrade touches governance documents only.
- **No PromptKit Governance CI workflow.** This was the prior migration's unfinished C6 and remains
  unfinished. `.github/workflows/test.yml` carries `paths-ignore` for `docs/**` and `**/*.md`, so a
  governance gate needs its own workflow with explicit `paths`; that is a separate change with its own
  risk surface. Tracked as F-1 below.
- **No profile or tracking change.** `turbo` and `github` stay.
- **No legacy `docs/tasks/` card conversion.** Ratified in the prior migration (D3) and unchanged.
- **No implementation of the queued API-suite review findings**
  (`docs/reviews/2026-11-19-api-suite-shared-server.md`). Step S5 touches two of those documents for
  link formatting only; it implements no finding.
- **No `docs/STATE.md` reflow.** The prior migration had to rewrite a 520 KB state file. This one does
  not: the installer stamps the `Engine Version` row and `docs-drift` stays `OK` (measured, §4.1).

## 3. Decisions this plan makes

| # | Decision | Value | Why |
| :--- | :--- | :--- | :--- |
| D1 | Target revision | Tag `v2.3.0` = `52adbe1`, **not** `origin/main` (`9f68bc2` = `v2.3.0-5-g9f68bc2`) | `v2.3.0` is the latest *release* and is immutable. The 5 commits past it are docs-only release-publication records — `git diff --stat v2.3.0..origin/main` = 2 files, +26/−0, both under `docs/releases/` — so they are not engine behaviour. Cost of this choice: `check-doctor.sh` reports `version STALE(+5)` and exits 1, because its version check compares against `refs/remotes/origin/main`, never against a tag. That red row is accepted and recorded (§7 R5). Pinning `9f68bc2` instead would turn that row green by moving the pin off the release — the same "green from a weaker definition" failure the 2026-11-19 API-suite review flagged. Alternative recorded in §8 O1. |
| D2 | Installer invocation | Flagless: `PROMPTKIT_NO_INTERACTIVE=1 bash .promptkit/init.sh` | Measured in a scratch copy: a flagless run prints `Keeping installed profile: turbo (previously acknowledged --experimental)`, keeps `tracking: github`, and runs the real preflight (`PREFLIGHT\|NO_FINDINGS\|FIXED_SCOPE_ONLY`). Passing `--turbo --experimental` re-asserts the experimental acknowledgement and adds nothing. |
| D3 | Upgrade recipe | Explicit checkout of the pinned SHA, **not** `git submodule update --remote --merge` | `QUICKSTART.md:76-82` documents `--remote --merge`, which tracks upstream HEAD. Measured: that recipe lands on `9f68bc2` (`v2.3.0-5`), not on the tag — it cannot express a pin. It is the wrong tool for a reproducible governance upgrade. |
| D4 | Dirty-tree handling | Capture a baseline and a safety ref; do not stash, do not commit | The tree carries 3 modified + 8 untracked paths: 6 from the queued API-suite work, plus this plan and its Task Record. The installer writes only `AGENTS.md`, `CLAUDE.md`, `.opencode/rules.md`, `.clinerules/promptkit.md`, `.github/copilot-instructions.md`, `PROMPTKIT.md`, `docs/STATE.md` — a set disjoint from every dirty path (measured). Stashing risks the owner's uncommitted work for no correctness gain; a baseline plus a `git stash create` ref gives the same verifiability. |
| D5 | Manual edits after the installer | Required for 4 stale claims (§5 S3) | The installer stamps only the `docs/STATE.md` `Engine Version` row. It never rewrites `PROMPTKIT.md`'s `Engine:` prose, its directive-block md5, or `docs/STATE.md`'s `Last Updated` / session-log prose. Those go stale silently unless edited by hand. |
| D6 | Pre-existing validator errors | Repair them (S5), separably | `validate-execution-control.sh` exits 1 with `ERRORS=4` on clean `HEAD` and `ERRORS=9` with the API-suite work present — under **both** engines, byte-identically. The upgrade neither causes nor fixes them, so leaving them means the upgrade lands with the governance gate still red. The fix is docs-only and proven (§5 S5). |
| D7 | Vendored-engine lint noise | Add a `.promptkit/**` ignore to `eslint.config.mjs` (S6) | `npm run lint` exits 1 with 7 problems, all inside the submodule. The latest engine ships both files unchanged, so the upgrade cannot clear it. Proven: with the ignore added, lint exits 0. The submodule is vendored third-party code, consistent with the existing `.next`/`out`/`build`/`spikes` ignores. |

## 4. Measured baseline (2026-11-19, `chore/promptkit-v2-sync` @ `560ebde`)

| Fact | Value | Command |
| :--- | :--- | :--- |
| Engine HEAD | `0cfa09390e4f6f0ffe090a6ba193db912b9a3c6d` = `v2.0.0-71-g0cfa093` | `git -C .promptkit describe --tags --match 'v[0-9]*'` |
| Commits behind upstream | 228 | `check-doctor.sh` → `version STALE(+228)` |
| Submodule worktree | clean, 0 modified, no local-only commits on any branch | `git -C .promptkit status --porcelain` |
| `.gitmodules` url | `https://github.com/lowqualityloey/promptkit-os` (canonical) | `cat .gitmodules` |
| Target tag | `v2.3.0` = `52adbe1`; `origin/main` = `9f68bc2` = `v2.3.0-5-g9f68bc2` | `git -C .promptkit rev-parse` |
| Engine diff | `0cfa093..v2.3.0` = 1424 files, +124,379/−774; **excluding `benchmarks/` = 186 files, +16,549/−774** | `git diff --stat` |
| Surface stability | workflows 26→26, protocols 9→9, templates 29→29; 19/6/6 modified, **none added or removed** | `ls <dir>/*.md \| wc -l` |
| Breaking changes | none — CHANGELOG 2.0.1→2.3.0 contains no Breaking heading | CHANGELOG read |
| Working-tree dirt | 3 modified + 8 untracked = 11 paths (6 API-suite files, this plan, this Task Record) | `git status --porcelain \| wc -l` = 11 |
| Lint | exit 1, 7 problems (6 errors, 1 warning), all inside `.promptkit/` | `node node_modules/eslint/bin/eslint.js --max-warnings=0 .` |
| Typecheck | exit 0 | `npm run typecheck` |
| Governance CI | none — `.github/workflows/test.yml` has no PromptKit gate | `grep -n promptkit .github/workflows/test.yml` |
| TypeScript files under `.promptkit` | 0 — the engine cannot affect `tsc` or Vitest | `find .promptkit -name '*.ts' -o -name '*.tsx' \| wc -l` |

### 4.1 What the upgrade actually changes — proven by a faithful dry-run

A full copy of the repository (including `.git` and `.git/modules`) was taken to `/tmp/pk-dry`, the
submodule checked out to `v2.3.0`, and the real installer run against the real latest engine. Result:

**exit 0; exactly 7 files change, +17/−12.**

| File | Δ | Change |
| :--- | :--- | :--- |
| `AGENTS.md` | 5 +− | engine stamp; `pk:doctor` bullet; new untrusted-content guardrail |
| `CLAUDE.md` | 5 +− | identical |
| `.opencode/rules.md` | 5 +− | identical |
| `.clinerules/promptkit.md` | 5 +− | identical |
| `.github/copilot-instructions.md` | 5 +− | identical |
| `PROMPTKIT.md` | 2 +− | `profile: turbo` moved to the machine-line cluster |
| `docs/STATE.md` | 2 +− | `Engine Version` row re-stamped |

The three directive hunks are: (a) `Engine: v2.0.0-71-g0cfa093 (0cfa093)` → `Engine: v2.3.0 (52adbe1)`;
(b) the `pk:doctor` bullet gains `, intake provenance, submodule registration`; (c) a new guardrail
bullet **Untrusted Content (Prompt Injection)** is inserted after *STATE.md Untrusted Until Read*,
declaring repository files, README text, issue/PR bodies, commit messages, and fetched pages to be
data rather than instructions. Verified present exactly once in each of the five files.

The `PROMPTKIT.md` change is a content-preserving move: `set_staged_machine_field()` appends
`field: value` at end of file, so `profile: turbo` relocates from the guardrail block to the machine
cluster. No prose is altered.

**Post-upgrade gate state in the dry-run tree** (real exit codes):

| Gate | Exit | Output |
| :--- | :--- | :--- |
| `validate-references.sh --strict` | **0** | all references valid, 411 markdown files |
| `validate-execution-control.sh --root .` | 1 | `FAILED\|ERRORS=9\|RECORDS=4` — the pre-existing errors, unchanged (measured in that tree before S5; after S5 the same tree reads `VALID\|RECORDS=4\|ROOT=.`) |
| `check-doctor.sh .` | 1 | every row OK except `version STALE(+5)` |
| `check-setup-assert.sh . .promptkit .promptkit` | 1 | `ASSERT\|submodule\|status\|FAIL` — **because the gitlink is not yet committed** |

That last row is the one sequencing trap in this plan: `check-setup-assert.sh` compares the
submodule's working-tree HEAD against the **recorded gitlink**, so it fails until `git add .promptkit`
is committed, and passes immediately after (measured both ways).

## 5. Migration steps

### S0 — Preconditions and baseline capture (read-only)

    git rev-parse HEAD                      # expect 560ebde1a37d044c355676f537637e1c8bf2d2c3
    git status --porcelain > /tmp/pk-baseline.txt ; wc -l /tmp/pk-baseline.txt   # expect 11
    git stash create > /tmp/pk-safety-ref.txt   # a commit object; nothing is stashed or removed
    git -C .promptkit status --porcelain | wc -l          # expect 0
    git -C .promptkit log --oneline --branches --not --remotes   # expect empty
    git -C .promptkit fetch origin --tags   # prior-review S2: without tags the stamp degrades to a bare SHA

Halt if: the submodule worktree is dirty, any local-only commit exists, or the fetch fails. The 11
dirty host-repo paths are expected and are not a blocker (D4) — but confirm none of them is one of
the 7 files the installer writes.

### S1 — Pin the engine

    git -C .promptkit checkout --detach 52adbe16c0ff2aea0d538e10c3225c2f3e40e315
    git -C .promptkit rev-parse HEAD                    # 52adbe16c0ff2aea0d538e10c3225c2f3e40e315
    git -C .promptkit describe --tags --match 'v[0-9]*' # v2.3.0  (a bare SHA here means S0's fetch did not land tags — stop)
    git submodule status                                # leading ' M'/'+' is expected until the gitlink is staged

### S2 — Run the canonical installer, flagless

    PROMPTKIT_NO_INTERACTIVE=1 bash .promptkit/init.sh

Expect exit 0 and, in the output: `Keeping installed profile: turbo (previously acknowledged
--experimental)`, `PREFLIGHT|NO_FINDINGS|FIXED_SCOPE_ONLY`, and five `Updated PromptKit OS directives
in: …` lines. Do **not** pass `--turbo --experimental` (D2) and do not skip the preflight.

### S3 — Complete the hand-maintained claims (the installer does not do these)

1. `PROMPTKIT.md:8` — the `Engine:` prose currently reads `submodule @ 0cfa093 = **v2.0.0-71**`. It must
   read `submodule @ 52adbe1 = **v2.3.0**`.
2. `PROMPTKIT.md:9` — directive-block md5 `edb5dc6dccc99cc5c4025e1df9c99f48` → the new value.
   Method (confirmed — it reproduces the recorded value on the current tree):
   `awk '/<!-- PROMPTKIT_START -->/,/<!-- PROMPTKIT_END -->/' AGENTS.md | md5sum`.
   Expected after upgrade: `b28a1cd8d852eaf0de91979996c3904f`. Verify all five host files agree.
3. `PROMPTKIT.md` §0 — the *What v2 changes* bullet should gain the 2.3.0 untrusted-content boundary,
   which is the release's only behavioural change for a host. The workflow/protocol counts quoted
   there (26/9) remain correct (measured).
4. `docs/STATE.md:263` `Last Updated` and `:1578` session-log row still describe the v2.0.0-71
   migration. Add a new dated row rather than rewriting history; do not touch the `Engine Version` row
   (the installer owns it).
5. `docs/STATE.md` §3A still projects `TASK-2026-10-23-promptkit-v2-migration`, whose
   `Execution State` is `awaiting_review`. The new Task Record
   `docs/tasks/2026-11-19-promptkit-v2-3-upgrade.md` is the live Controlled Work record, so §3A must be
   repointed at it — otherwise the synchronized projection describes finished work while the active
   record is invisible to it. **This lands in its own commit after the engine commit**, matching the
   precedent: the prior migration did exactly this as `901c90e docs(promptkit): populate the §3A
   execution-control projection`, separate from its engine pin `4b39636` and its directive
   re-injection `427a049`. Repointing it inside the engine commit would mix a governance state
   change into a dependency bump.

   Repointing is not a free edit: §3A and the Task Record are compared field by field, and **v2.3.0
   widens that contract from 4 pairs to 10** (see §7 R11). Measured in a scratch copy with §3A
   repointed at the new record: `validate-execution-control.sh` reports zero `STATE_` rows under
   **both** the installed validator and the v2.3.0 validator, and `check-doctor.sh` reports
   `docs-drift OK`. Controls confirm the check is live rather than vacuous — breaking
   `Execution State`, `Owner / Current Actor`, `Active Task Pointer`, or `Task ID` each raises
   `STATE_PROJECTION_MISMATCH`, and breaking `Next Action` or `Specification` raises it under
   v2.3.0 only (those two pairs are new).

### S4 — Verify the diff scope before staging

    git diff --stat -- . ':!.promptkit'   # expect the 7 files, +17/−12, plus the pre-existing dirt
    git diff -- AGENTS.md                 # expect exactly the 3 hunks in §4.1
    git diff --stat                       # confirm no file outside the expected set

Also confirm the `nextjs-agent-rules` block in `AGENTS.md` (outside the
`PROMPTKIT_START`/`PROMPTKIT_END` markers) is byte-identical — the installer must not touch it.

**Any file outside the expected set is a halt**: inspect, do not stage, roll back per §7.

### S5 — Repair the pre-existing execution-control errors (recommended, separable)

Independent of the engine move, `validate-execution-control.sh` fails on two records. Both failure
kinds were root-caused, and the fix was applied step by step in a scratch copy of the tree:

| After | Result | Exit |
| :--- | :--- | :--- |
| baseline, before this plan's Task Record existed | `FAILED|ERRORS=9|RECORDS=4` | 1 |
| baseline, with the v2.3.0 upgrade Task Record added | `FAILED|ERRORS=9|RECORDS=5` — the new record adds no diagnostic | 1 |
| backticks removed from both records' link labels | `FAILED|ERRORS=3|RECORDS=5` — all six `INVALID_LINK` rows gone, only `SCOPE_CHANGE_MISSING` left | 1 |
| spec + record paths added to both records' `In Scope` | `VALID|RECORDS=5|ROOT=.` | **0** |

The last row was re-measured under **both** validators: the installed one and the v2.3.0 one agree
(`VALID|RECORDS=5|ROOT=.`, exit 0). So the repair survives the engine move — it is not a fix that only
holds on the old validator.

One measured dependency worth knowing: the new Task Record's `Planning Record Link` resolves only while
its plan document exists. Adding the record **without** `docs/specs/2026-11-19-spec-promptkit-v2-3-upgrade.md` raises
`INVALID_LINK|TASK-promptkit-v2-3-upgrade|...|Missing PLAN link target or anchor` and takes the count to
`ERRORS=10|RECORDS=5`. With both files present the count is `ERRORS=9|RECORDS=5` and **no** diagnostic
names the new record. Both artifacts therefore have to land together.

1. **`INVALID_LINK`** (3 per record, 6 total). The validator's link pattern is
   `^\[([A-Za-z0-9._-]+)\]\(([^)#]+)#([A-Za-z0-9._-]+)\)$` — it cannot match link text that begins
   with a backtick. Both records write the link label with backticks around the ID. Remove those
   backticks from the `Planning Record Link` and `Assumption Record Links` cells in
   `docs/tasks/2026-10-23-ci-runtime-reduction.md` and
   `docs/tasks/2026-10-23-api-suite-shared-server.md`. The anchors themselves are correct and present.
2. **`SCOPE_CHANGE_MISSING`** (2 per record). `Changed Files` lists the spec and the record, but
   `In Scope` lists neither, and the validator does a substring containment test. Add both paths to
   each record's `In Scope`.

Drop this step if the owner prefers to keep the two records frozen while
`docs/reviews/2026-11-19-api-suite-shared-server.md` is open — it edits documents currently under
review. Dropping it means the governance gate stays red (`ERRORS=9`, the pre-existing count, not a
count this upgrade introduces) and that red must be recorded in the Task Record rather than left
implicit.

### S6 — Silence the vendored-engine lint noise (recommended, separable)

In `eslint.config.mjs`, inside the `globalIgnores` array, after the `spikes/**` entry, add:

    // PromptKit OS engine submodule: vendored, versioned upstream, not our source.
    ".promptkit/**",

Proven: lint exits 0 with this ignore and exit 1 without it. Without it the upgrade leaves
`npm run lint` red on files this repository does not own.

### S7 — Stage and commit in two commits

**Commit 1 — the engine move.** S3 items 1-4 are already applied; the §3A repoint (S3 item 5) is not.

    git add .promptkit AGENTS.md CLAUDE.md PROMPTKIT.md docs/STATE.md \
            .opencode/rules.md .clinerules/promptkit.md .github/copilot-instructions.md
    # plus, if S5/S6 ran: eslint.config.mjs and the two task records
    git commit -m "chore(promptkit): upgrade engine to v2.3.0 (52adbe1)"
    git submodule status        # no leading '+' or '-' after the commit

The gitlink must be in the **same** commit as the directives, or the tree passes through a state
where the recorded engine and the shipped rules disagree.

**Commit 2 — the §3A repoint** (S3 item 5). Separate on purpose: commit 1 is a dependency bump whose
only STATE.md edits are the installer's `Engine Version` stamp and the S3 item 4 prose, while commit 2
changes which Task Record the project's governance state describes. Precedent in this repository:
the prior migration split them as `4b39636` (engine pin) / `427a049` (directives) / `901c90e` (§3A
populate).

    git add docs/STATE.md docs/tasks/2026-11-19-promptkit-v2-3-upgrade.md
    git commit -m "docs(promptkit): project the v2.3.0 upgrade task in §3A"

Stage nothing from the queued API-suite work. If commit 2 is dropped, §3A keeps describing the
finished v2.0.0-71 migration while the live record is invisible to it — record that as an accepted
red, not as a passing state.

### S8 — Gate sweep (all of it, this turn, with real exit codes)

    bash .promptkit/scripts/check-setup-assert.sh . .promptkit .promptkit   # exit 0 (only after S7)
    bash .promptkit/scripts/validate-references.sh --strict                 # exit 0 (flag exists only from v2.1.0 — see below)
    bash .promptkit/scripts/validate-execution-control.sh --root .          # exit 0 if S5 ran; else ERRORS=9 recorded
    bash .promptkit/scripts/check-doctor.sh .                               # every row OK except version STALE(+5) and submodule
    npm run typecheck                                                       # exit 0
    npm run lint                                                            # exit 0 if S6 ran

Run the sweep **with the v2.3.0 scripts**, not the ones you measured at S0 — that is the whole point
of R11. Two rows need reading rather than asserting:

- `validate-execution-control.sh` must show zero `STATE_` rows. A `STATE_PROJECTION_MISMATCH` row here
  means the §3A repoint does not satisfy the widened 10-pair contract. Measured in a scratch copy:
  with §3A repointed at the new record and all 10 fields populated, the v2.3.0 validator emits no
  `STATE_` row at all, and controls confirm the check is live (breaking `Next Action` or `Specification` raises
  one under v2.3.0 while the installed validator stays silent, because those two pairs are new).
- `check-doctor.sh` gains a `submodule` row in v2.3.0 (issue #667). It reads `OK` here because
  `.gitmodules` maps `.promptkit` and the index records mode 160000; if it reads
  `MISSING(.gitmodules)` the clone this repository is checked out into would materialize an empty engine.

`npm test` is **not** a gate for this change: the engine ships 0 TypeScript files (measured), so
neither `tsc` nor Vitest can see it. The suite's current state is out of scope and is not claimed here.

**`--strict` is new in this upgrade.** The installed engine's `validate-references.sh` has no such
flag — it reads `${1:-`.promptkit}` as the kit directory, so `--strict` is rejected as a path
(`❌ ERROR: PromptKit directory not found: --strict`, exit 1). Measured: 0 occurrences of `strict` in
the installed script. The flag arrives with v2.1.0 (CHANGELOG line 120, issue #662); against this
repository it reports `✅ All references valid` and exits 0. So S8's command is correct **after** S1
and wrong before it, and before the upgrade the same gate is the bare
`bash .promptkit/scripts/validate-references.sh` (exit 0, measured).

### S9 — Hot-reload in the next session

Run `pk:sync` so the agent reloads the updated rules from disk. The 2.3.0 untrusted-content boundary
is directive text; it takes effect only when a session reads the new block.

## 6. Acceptance criteria

| ID | Criterion | Evidence |
| :--- | :--- | :--- |
| AC-1 | `.promptkit` is at `52adbe1` and `git describe --tags --match 'v[0-9]*'` returns `v2.3.0` | `git -C .promptkit rev-parse HEAD`, `describe` |
| AC-2 | `.gitmodules` names `promptkit-os`, and `git submodule status` has no leading plus or minus | `cat .gitmodules`, `git submodule status` |
| AC-3 | All five host directives carry `Engine: v2.3.0 (52adbe1)` | `grep -c` across the five files |
| AC-4 | The Untrusted Content guardrail appears exactly once in each of the five directives | `grep -c 'Untrusted Content'` = 1 each |
| AC-5 | The `nextjs-agent-rules` block in `AGENTS.md` is byte-identical to `HEAD` | `git diff -- AGENTS.md` shows only the three PromptKit hunks |
| AC-6 | `PROMPTKIT.md` has exactly one `profile: turbo`, one `tracking: github`, and its `Engine:` prose names `52adbe1` / `v2.3.0` | `grep -c`, `grep -n` |
| AC-7 | `PROMPTKIT.md`'s directive-block md5 matches the block actually on disk, identically across all five hosts | `awk … | md5sum` × 5 |
| AC-8 | `docs/STATE.md` `Engine Version` reads `v2.3.0 @ 52adbe1`; §3A projects `TASK-promptkit-v2-3-upgrade` and satisfies the widened 10-pair contract (zero `STATE_PROJECTION_MISMATCH` rows); and `check-doctor.sh` reports `docs-drift OK` | `grep`, both validators, doctor run |
| AC-9 | Two commits with exactly the expected file set: commit 1 carries the gitlink in the same commit as the 7 governance files (plus, if run, `eslint.config.mjs` and the two repaired records); commit 2 carries only `docs/STATE.md` and the new Task Record | `git show --stat` on both |
| AC-10 | `validate-references.sh --strict` exits 0 — the strict flag is only available after the engine move, which is itself part of the evidence | script run |
| AC-11 | `validate-execution-control.sh --root .` exits 0 with `VALID` — or, if S5 was dropped, the red is recorded in the Task Record with its cause | script run |
| AC-12 | `check-doctor.sh` reports every row OK except `version STALE(+5)`, whose cause is recorded | doctor run |
| AC-13 | `check-setup-assert.sh` exits 0 after the gitlink commit | script run |
| AC-14 | `npm run typecheck` exits 0 and `npm run lint` exits 0 | both scripts |
| AC-15 | No application source, test, schema, or CI runtime file changed | `git show --stat` scope check |

## 7. Risks, failure modes, and rollback

| # | Risk | Detection | Mitigation | Rollback |
| :--- | :--- | :--- | :--- | :--- |
| R1 | Installer writes a file outside the expected set | S4 diff scope | Do not stage; inspect the unexpected hunk | `git checkout -- .`; `git -C .promptkit checkout 0cfa093` |
| R2 | The documented `--remote --merge` recipe is used and lands on `9f68bc2` instead of the tag | `describe` returns `v2.3.0-5-g9f68bc2` | D3 forbids that recipe; S1 uses an explicit SHA checkout | `git -C .promptkit checkout 52adbe1` |
| R3 | Engine stamp degrades to a bare SHA because tags are missing | `describe` returns only a SHA | S0 runs `fetch origin --tags`; S1 halts if `describe` is not `v2.3.0` | Re-fetch, re-run S2 |
| R4 | `check-setup-assert.sh` fails after a correct install | `ASSERT\|submodule\|status\|FAIL` | Expected until the gitlink is committed (measured) — sequencing, not a defect | Commit S7, re-run |
| R5 | `check-doctor.sh` exits 1 on `version STALE(+5)` | doctor run | Accepted by D1 and recorded; the 5 commits are docs-only release records (`diff --stat` = 2 files, +26) | Pin `9f68bc2` instead (§8 O1) |
| R6 | The 9 dirty paths make the post-install diff unreadable | S4 diff scope vs baseline | Baseline captured in S0; installer paths are disjoint from every dirty path (measured) | Discard the diff, keep the dirt |
| R7 | S5 edits documents currently under review | Review of S5's diff | S5 is separable and clearly labelled; the reviewer is told | Drop S5; record the red |
| R8 | Lint stays red on vendored engine files | `npm run lint` | S6 | Drop S6; record the red |
| R9 | Another session keeps using the old directives | Agent behaviour after upgrade | S9 runs `pk:sync` | Re-inject with the installer |
| R10 | The engine's 124k-line diff is assumed reviewed | — | It is not: this plan reviews the **install surface**, not upstream source. The `benchmarks/` tree alone is 1,238 files and is not install behaviour | — |
| R11 | The 3A repoint passes under the installed validator but fails after the engine move, because v2.3.0 widens the shared projection contract from 4 pairs to 10 (adds `Task ID`, `Next Action`, `Ceremony Level`, `Specification`, `Execution Scope`, `Start Time`, and reclassifies `Owner / Current Actor` to compare against the record's `Owner / Actor`, issue #669/#671) | S8 runs the **post-upgrade** validator, not the pre-upgrade one; a `STATE_PROJECTION_MISMATCH` row after the move is this risk materializing | S3 item 5 populates all 10 fields before the engine commit; the Task Record's `Owner / Actor` is set to the same value as its `Current Actor` so both validators agree | Re-run the installed validator if the engine is rolled back; the 4-pair contract is strictly weaker |

**Rollback is total and cheap.** No schema, no runtime, no data, no secrets. Reset the branch to the
S0 baseline (the `git stash create` ref is available if the dirty tree was disturbed) and
`git -C .promptkit checkout 0cfa093`. The installer also keeps its own snapshot/rollback trap.

## 8. Open decisions for the owner

- **O1 — Pin the tag or `origin/main`?** This plan pins `v2.3.0` (`52adbe1`) and accepts
  `version STALE(+5)` (D1). The alternative pins `9f68bc2` (`v2.3.0-5`), which makes the doctor
  version row green at the cost of pinning five unreleased docs-only commits. Recommendation: the tag.
- **O2 — Run S5 (validator repair) in this change?** Recommended, because it is the only thing
  between this repository and a green governance gate, and the fix is proven. It edits two records
  that are currently under review.
- **O3 — Run S6 (lint ignore) in this change?** Recommended: one line, project-owned file, proven to
  turn `npm run lint` green.
- **O4 — Commit the queued API-suite work first?** Not required by this plan (D4), but the tree stays
  dirty until it is resolved, and a clean tree makes every future governance diff easier to read.

## 9. Follow-ups this plan does not do

- **F-1 — PromptKit Governance CI.** The prior migration's C6, still open. Needs its own workflow with
  explicit `paths` because `test.yml` ignores `docs/**` and `**/*.md`.
- **F-2 — Implementation of the API-suite review findings**
  (`docs/reviews/2026-11-19-api-suite-shared-server.md`, verdict Changes Requested).
- **F-3 — The upstream `benchmarks/` tree** (1,238 of the 1,424 changed files) was not read and is not
  part of an install. If it ever matters, it deserves its own review.
- **F-4 — Legacy `docs/tasks/` records carrying `TASK-` anchors** were not converted and should not
  be (prior migration D3).

## 10. Provenance

Every number above was produced in this planning session. Commands run:

`git submodule status`, `git -C .promptkit rev-parse/describe/log/status/fetch/cat-file/for-each-ref`,
`git submodule update --remote --merge .promptkit` (probe, in a scratch copy only),
`git diff --stat 0cfa093..v2.3.0`, `git diff --stat v2.3.0..origin/main`,
`ls /tmp/pk-latest/{workflows,protocols,templates}/*.md | wc -l`, `git status --porcelain`,
`git stash create`, `find .promptkit -name '*.ts' -o -name '*.tsx'`,
`awk '/<!-- PROMPTKIT_START -->/,/<!-- PROMPTKIT_END -->/' <file> | md5sum` × 5,
`bash .promptkit/init.sh` (scratch copy `/tmp/pk-dry`, submodule at `v2.3.0`),
`bash .promptkit/scripts/check-doctor.sh .`, `bash .promptkit/scripts/validate-references.sh` (installed
engine, no flag) and `bash /tmp/pk-latest/scripts/validate-references.sh --strict .promptkit` (latest engine),
`bash .promptkit/scripts/validate-execution-control.sh --root .`,
`bash .promptkit/scripts/check-setup-assert.sh . .promptkit .promptkit`,
`node node_modules/eslint/bin/eslint.js --max-warnings=0 .` (with and without a probe config that
ignores `.promptkit/**`), `npm run typecheck`, `node --version`, `npm --version`.

**Not measured, and not claimed**: the engine's 124k-line source diff; the behaviour of the new
directives inside another agent's session; the full `npm test` suite (out of scope — the engine ships
0 TypeScript files); any CI run of a governance workflow (none exists).

**Execution gate**: this plan authorizes nothing. It changes no file and starts no implementation.
The canonical Task Record now exists at
`docs/tasks/2026-11-19-promptkit-v2-3-upgrade.md` (`Execution State: ready`, `To Do`); it is the
authority for execution state and this document remains its planning input. `pk:grill` owns the
design challenge. Nothing above may be executed before the owner ratifies D1–D7 and decides O1–O4.
