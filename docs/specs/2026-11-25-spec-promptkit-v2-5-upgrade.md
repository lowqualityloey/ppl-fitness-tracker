# Spec: PromptKit OS Upgrade — v2.4.0 (13006a6) → v2.5.0 (a8c5994)

<a id="PLAN-promptkit-v2-5-upgrade"></a>

- **Status**: Executed 2026-11-25. S0-S8 ran under owner ratification (the owner authorized the
  recommended route, which covers D1-D6 and O1-O3). Commits: `50bb6ff` (engine move, the five re-stamped
  host directives and `PROMPTKIT.md`), and a second docs-only commit carrying this Planning Record, the
  Task Record, the section 3A repoint and the `docs/STATE.md` session row (a commit cannot cite its own
  SHA). This document stays the planning input; `docs/tasks/2026-11-25-promptkit-v2-5-upgrade.md`
  remains the authority for execution state.
- **Date**: 2026-11-25
- **Ceremony**: Level 2 (Controlled) — Configuration Work, not Code Work. The canonical Task Record is
  `docs/tasks/2026-11-25-promptkit-v2-5-upgrade.md`; this spec supplies its planning inputs and creates
  no execution state.
- **Supersedes**: nothing. Extends `docs/specs/2026-11-22-spec-promptkit-v2-4-upgrade.md` (the
  `v2.3.0 → v2.4.0` move), whose D1-D7 remain the governing precedent where this spec is silent.
- **Target pin**: `a8c599435550c0887bd4aadb76e636c222ccac9f` — the peeled commit of annotated tag
  `v2.5.0` (`183408cee267ad39d8574e8142a22737dd0f3c88`) in
  `https://github.com/lowqualityloey/promptkit-os`.
- **Scope**: governance install only. No application source, schema, auth, API, database, runtime,
  release, tag, or deployment action.

---

## 1. Outcome

The repository moves its governance engine from the `v2.4.0` release to the `v2.5.0` release, and the
five host directives and `PROMPTKIT.md` name that release rather than the previous one. Nothing the
application does changes, because the engine ships no executable application code that this repository
runs.

When this plan is done:

1. `.promptkit` sits at `a8c5994` and `git describe --tags` says `v2.5.0`, so the stamp on every
   host directive names a real release rather than a commit that merely precedes one.
2. All five host directives carry `Engine: v2.5.0 (a8c5994)`, and `PROMPTKIT.md` records the matching
   directive-block md5 (`7ebe005d257f7d54596bb39c0ffd4ae4`) so a reader can tell an edited block from an
   injected one.
3. `pk:doctor` reports the version row as `STALE(+9)` and that number is written down as an accepted
   cost — the release pin is nine commits behind upstream `origin/main`, which is the price of pinning a
   release instead of a branch head. It improves on the pre-upgrade `STALE(+53)` without becoming green.
4. `validate-references.sh --strict`, `validate-execution-control.sh`, `check-setup-assert.sh` and
   `npm run typecheck` all exit 0, and `npm run lint` exits 0 over the repository tree once the nested
   agent worktrees under `.agents/` are excluded — the scope of that claim is stated, not assumed.
5. The work lands as two commits whose file sets are exactly the ones this spec names, so a later reader
   can see that a governance move touched governance files and nothing else.

## 2. Explicit non-goals

- **Not an application change.** No file under `src/`, `app/`, `lib/`, `tests/`, `supabase/`, or
  this repository's `.github/workflows/` is edited. The engine's 494-file delta is entirely inside
  `.promptkit`, which is a submodule: it appears in the project tree as one gitlink.
- **Not an upstream source review.** `v2.4.0..v2.5.0` is 494 files / 18941 insertions / 82 deletions
  over 44 commits, 452 of them documentation under `docs/` (440 under `docs/internal/`). This plan
  reviews the *install surface* — what the installer writes into this repository — not the engine's
  internals. The two behavioural files that reach us are read and quoted in section 3.1, and that is the
  limit of the claim.
- **Not a fix for the nine trailing commits.** Pinning `origin/main` (`4585201`, `v2.5.0-9`) would
  make the doctor's version row green. It is rejected for the reason the `v2.4.0` move named: turning a
  row green by weakening the definition of what the row measures is not progress.
- **Not the host-conformance programme.** The engine's `docs/internal/host-conformance/` bundle and its
  behavioural-eval harness are engine documentation; nothing in this repository runs them, and no claim is
  made about their results.
- **Not a CI change.** This repository's governance workflow runs exactly three validators and this plan
  changes none of them; the engine's own `.github/workflows/ci.yml` is a submodule file.

## 3. Decisions

| # | Decision | Value | Why |
| :--- | :--- | :--- | :--- |
| D1 | Pin the release tag or the branch head? | Pin the **peeled commit** of tag `v2.5.0`: `a8c599435550c0887bd4aadb76e636c222ccac9f`. Accept `version STALE(+9)`. | The tag is annotated, so `rev-parse v2.5.0` returns the tag object `183408c`, not a commit; `rev-parse v2.5.0^{}` returns `a8c5994` (measured). Pinning `origin/main` = `4585201` (`v2.5.0-9`) would flip the doctor row to `OK` by pinning nine unreleased commits. **Accepted cost**: `check-doctor.sh` still exits 1, now as `STALE(+9)` instead of `STALE(+53)`. This is an improvement in the number and no change in the verdict. |
| D2 | How to run the installer? | `PROMPTKIT_NO_INTERACTIVE=1 bash .promptkit/init.sh`, flagless. | Keeps `profile: turbo` and `tracking: github` (both already set in `PROMPTKIT.md:4`), runs the real preflight, needs no `--turbo`/`--experimental` flags. Same call as the `v2.4.0` move D2. |
| D3 | How to move the submodule? | Explicit `git -C .promptkit checkout a8c5994`, then `git add .promptkit`. | `git submodule update --remote --merge` lands on upstream HEAD and cannot express a pin. Same call as the `v2.4.0` move D3. |
| D4 | What to do with the one untracked path? | Leave it untracked; never stage it; name it in the S0 baseline. | `git status --porcelain` is one row: `?? docs/reviews/2026-11-22-promptkit-v2-sync-branch.md`. It is a pre-existing review artifact owned by a different unit of work. Because commit 2 is a docs-only commit the risk is real: a `git add docs` would sweep it in, so both commits stage explicit path lists and never a directory. |
| D5 | Which claims does the installer not maintain? | Three, all hand-edited in S4: `PROMPTKIT.md:8` (engine prose: SHA and tag), `PROMPTKIT.md:10` (directive-block md5), and `PROMPTKIT.md:11-14` (the "What 2.5.0 adds" bullet). | The installer owns exactly one line per host directive (the `Engine:` stamp) and exactly one line in `docs/STATE.md` (`Engine Version`, written at S2). Everything else that mentions the engine is prose no script rewrites, so it goes stale silently unless a human edits it. The `docs/STATE.md` `Last Updated` chain and section 8 row are hand-written too, but they are this plan own bookkeeping rather than installer-maintained claims. |
| D6 | Is a section 3A repoint required? | Yes — and the Task Record must exist before section 3A names it. | `validate-execution-control.sh` compares the `docs/STATE.md` section 3A projection against the canonical Task Record; a projection that names an unknown Task ID fails `STATE_PROJECTION_MISMATCH`. So spec, record, and projection land in one commit. **Measured**: the validator is byte-identical between `v2.4.0` and `v2.5.0` (empty numstat), so the 10-pair projection contract does not widen under us. The record count does move: 9 records before this work, 10 after it. |
| D7 | Does the lint step need repeating? | No new ignore is required, but the claim must be scoped. | `.promptkit/**` is already in the `globalIgnores` of `eslint.config.mjs` (`eslint.config.mjs:97`), so the engine is invisible to lint even though `v2.5.0` now ships 5 `.ts` files (all fixtures under `scripts/tests/fixtures/ce-capture/`). The `v2.4.0` assertion that "the engine ships 0 TypeScript files" is **false at `v2.5.0`** and is not repeated. Separately, a bare `npm run lint` is red on this host for a reason unrelated to the upgrade (nested agent worktrees under `.agents/`), so the acceptance criterion states the scope rather than claiming a bare green. |

### 3.1 The behavioural delta that reaches this repository

`v2.5.0` changes two of the scripts this repository actually executes: `init.sh` (+19/−2, with
`init.ps1` at +33/−3) and the gate this repository runs on every governance change,
`scripts/check-doctor.sh` (+10/−1, with `check-doctor.ps1` at +7/−1). Both come from one upstream
issue (#764): the `gemini` host id no longer targets `GEMINI.md`.

The installer change is in `host_file()`:

```
-        gemini) echo "GEMINI.md" ;;
+        # gemini shares AGENTS.md: agy discovers both AGENTS.md and GEMINI.md and
+        # dedupes by resolved path, so writing both injects the directive twice
+        # (docs/HOST-CONFORMANCE.md section 4, issue #764).
+        gemini) echo "AGENTS.md" ;;
```

`AGENT_FILES` loses `GEMINI.md` as an injection target, the installed-host re-detection loop now
skips `gemini` (an `AGENTS.md`-only install would otherwise re-detect as `gemini` rather than the
universal `agents` target), and `init.sh` gains a warning when a pre-existing `GEMINI.md` still
carries a `PROMPTKIT_START` block: it is no longer refreshed, stays stale, and doubles the static
directive cost while it is there.

The doctor change is in `host_relpath()` plus a new dedupe loop:

```
+        # gemini resolves to AGENTS.md (issue #764): agy discovers both files and
+        # dedupes by resolved path, so the installer writes only AGENTS.md.
+        gemini) printf 'AGENTS.md' ;;
```

```
+seen_rels=" "
 for id in $HOST_IDS; do
     rel="$(host_relpath "$id")"
     [[ -n "$rel" ]] || continue
+    # Several host ids can resolve to the same file (gemini -> AGENTS.md, issue
+    # #764). Report each target file once so the row list stays one row per file.
+    case "$seen_rels" in
+        *" $rel "*) continue ;;
+    esac
+    seen_rels="$seen_rels$rel "
```

The consequence is narrow and must be stated precisely, because it is easy to over-claim: **neither change
alters anything this repository sees, and that is a measured result, not a prediction.**

- `GEMINI.md` does not exist here (`ls GEMINI.md` printed `No such file or directory`; `git ls-files`
  has no `GEMINI*` path), so the installer rewrites the same five hosts it always did. Nothing loses a
  stamp and no new file is created.
- The doctor dedupe only suppresses a *duplicate* target file. This repository installs `agents`,
  `claude`, `opencode`, `cline` and `copilot`, which resolve to five distinct paths, so the dedupe
  removes no row here. The row set measures five `OK` host rows plus four `SKIP(not installed)` rows
  (`.cursorrules`, `.windsurfrules`, `.traerules`, `CONVENTIONS.md`) — unchanged in shape from
  `v2.4.0`.
- The directive block stays byte-identical except the `Engine:` stamp. Measured by comparing the working
  `AGENTS.md` block against `8eee30b:AGENTS.md` with the `Engine:` line normalised to a fixed token:
  the diff prints nothing.

No workflow and no template changed between the two tags (`git diff --name-only v2.4.0 v2.5.0 --
workflows/ templates/` is empty), and the counts are identical at both tags: 26 workflows, 9 protocols,
30 template entries (29 `.md` plus `terminal-banner.txt`). The other protocol change,
`protocols/context-economy.md` (+22/−1), replaces an unvalidated claim about the discovery route with a
six-cell measurement and an explicit `n=1` limit; it is advisory text with no consumer contract here.

## 4. Measured baseline

Every value below was produced in this session. The "at S0" column is the pre-execution state on
`8eee30b`; the "after commit 1" column is `50bb6ff`, the state the second commit is built on.

| Fact | At S0 (`8eee30b`) | After commit 1 (`50bb6ff`) | Command |
| :--- | :--- | :--- | :--- |
| Project HEAD | `8eee30b3ac097bb55d857a81deb82af8fe2a001c` | `50bb6ff82dbea0f445856952156e9e1e28e968b0` | `git rev-parse HEAD` |
| Installed engine HEAD | `13006a6e3fe955d220ee7a5d5518d4bd6b7e1652` | `a8c599435550c0887bd4aadb76e636c222ccac9f` | `git -C .promptkit rev-parse HEAD` |
| Installed engine describe | `v2.4.0` | `v2.5.0` | `git -C .promptkit describe --tags --match 'v[0-9]*'` |
| Commits behind upstream | 53 | 9 | `git -C .promptkit rev-list --count HEAD..refs/remotes/origin/main` |
| Upstream ref | — | `4585201d04e8fc88afe990f1ffd8c7edec1f5aac` | `git -C .promptkit rev-parse refs/remotes/origin/main` |
| `v2.5.0` tag object | `183408cee267ad39d8574e8142a22737dd0f3c88` (annotated) | same | `git -C .promptkit rev-parse v2.5.0` |
| `v2.5.0` peeled commit | `a8c599435550c0887bd4aadb76e636c222ccac9f` | same | `git -C .promptkit rev-parse v2.5.0^{}` |
| Commits the pin leaves behind | — | 9 | `git -C .promptkit rev-list --count v2.5.0^{}..refs/remotes/origin/main` |
| Release delta | — | 494 files, +18941/−82 | `git -C .promptkit diff --shortstat v2.4.0 v2.5.0` |
| Release commits | — | 44 | `git -C .promptkit rev-list --count v2.4.0..v2.5.0` |
| Engine TypeScript files | 0 | 5 (all fixtures) | `git -C .promptkit ls-tree -r --name-only v2.5.0 \| grep -c ts$` |
| Directive-block md5 | `98425dbeb277c71f405f5e9aba999a7f` | `7ebe005d257f7d54596bb39c0ffd4ae4` (all five agree) | `awk '/PROMPTKIT_START/,/PROMPTKIT_END/' <file> \| md5sum` × 5 |
| `docs/STATE.md` engine row | `:19 - **Engine Version**: v2.4.0 @ 13006a6` | `:19 - **Engine Version**: v2.5.0 @ a8c5994` | `grep -n 'Engine Version' docs/STATE.md` |
| `docs/STATE.md` size | 316 lines | 316 lines | `wc -l docs/STATE.md` |
| Workflow / protocol / template counts | 26 / 9 / 30 at `v2.4.0` | 26 / 9 / 30 at `v2.5.0` | `git -C .promptkit ls-tree -r --name-only <tag> -- <dir> \| wc -l` |
| Changed gate/installer scripts | — | `init.sh` +19/−2, `init.ps1` +33/−3, `scripts/check-doctor.sh` +10/−1, `scripts/check-doctor.ps1` +7/−1 | `git -C .promptkit diff --numstat v2.4.0 v2.5.0 -- <paths>` |
| `--strict` still present in `v2.5.0` | 6 occurrences in `scripts/validate-references.sh` | same | `git -C .promptkit show v2.5.0:scripts/validate-references.sh \| grep -c strict` |
| This repository's four governance scripts | unchanged by `v2.5.0` | unchanged | `git -C .promptkit diff --numstat v2.4.0 v2.5.0 -- scripts/validate-execution-control.sh scripts/validate-references.sh scripts/check-setup-assert.sh scripts/validate-ci-triage.sh` |

Baseline gates at `8eee30b`, all run in this session: `validate-references.sh --strict` exit 0;
`validate-execution-control.sh --root .` exit 0 (`VALID|RECORDS=9|ROOT=.`);
`check-setup-assert.sh . .promptkit .promptkit` exit 0 (`ASSERT|submodule|status|OK`);
`validate-ci-triage.sh` `FAILED|ERRORS=60|RECORDS=3`; `check-doctor.sh` **exit 1** with exactly one
non-OK row — `version	STALE(+53)	engine v2.4.0 is 53 commit(s) behind refs/remotes/origin/main`.

The engine's five TypeScript files are fixtures, not build inputs: the `tsc` program contains no
`.promptkit` file (measured), and `eslint.config.mjs:97` still ignores `.promptkit/**`. So neither
tool observes the upgrade, and AC-14 is written as a no-collateral-damage claim rather than coverage.

## 4.1 Proof of the install surface

This move did not use a sandbox dry-run; the install happened in place and its footprint was measured
before anything was staged. That is the stronger evidence, and it is what is recorded here.

**The one sequencing trap, observed as predicted:** `init.sh` exited 1 at S2 with
`PREFLIGHT|NO_FINDINGS|FIXED_SCOPE_ONLY` followed by `ASSERT|submodule|status|FAIL`. The installer
writes first and asserts second, so at that moment the gitlink in the index still recorded `13006a6`.
This is the R4 failure mode of the `v2.4.0` spec, not a submodule fault:
`ASSERT|submodule|gitmodules|FAIL` would have meant `.gitmodules` does not map `.promptkit`, and that
line never appeared.

Footprint outside the kit — **exactly six files, 1+/1− each**, plus the gitlink:

| File | Delta | The single changed line |
| :--- | :--- | :--- |
| `AGENTS.md` | 1+/1− | the `Engine:` stamp |
| `CLAUDE.md` | 1+/1− | the `Engine:` stamp |
| `.github/copilot-instructions.md` | 1+/1− | the `Engine:` stamp |
| `.clinerules/promptkit.md` | 1+/1− | the `Engine:` stamp |
| `.opencode/rules.md` | 1+/1− | the `Engine:` stamp |
| `docs/STATE.md` | 1+/1− | `:19 - **Engine Version**: v2.4.0 @ 13006a6` becomes `v2.5.0 @ a8c5994` |

The stamp delta, identical in all five hosts:

```
-Engine: v2.4.0 (13006a6) — stamped at install time; run pk:sync to check for drift.
+Engine: v2.5.0 (a8c5994) — stamped at install time; run pk:sync to check for drift.
```

The S3 diff-scope gate read **seven** `M` rows — the five host directives, `docs/STATE.md`, and
`.promptkit` — plus the one pre-existing `??` review path. Nothing else appeared, which is what the
"zero new paths" claim rests on: the installer template-creation branch did not fire, because
`.github/pull_request_template.md` and `.github/ISSUE_TEMPLATE/task.md` already exist here.

The directive-block md5 was re-measured after the install rather than carried over: all five hosts hash to
`7ebe005d257f7d54596bb39c0ffd4ae4`, and that value was written into `PROMPTKIT.md:10`. Nothing in the
kit *reads* that number — it is a human cross-check — so a wrong value is a documentation defect, not a
gate failure.

`check-setup-assert.sh` read `FAIL` at S2 and flipped to `ASSERT|submodule|status|OK` once commit 1
committed the gitlink, which is the sequencing the `v2.4.0` move also measured.
## 5. Steps

### S0 — Baseline and safety anchor

```
    git rev-parse HEAD
    git status --porcelain --untracked-files=all
    git -C .promptkit rev-parse HEAD
    git -C .promptkit describe --tags --match v[0-9]*
    git -C .promptkit fetch origin --tags
    git stash create
```

Expect HEAD `8eee30b`, one untracked review path, engine `13006a6` / `v2.4.0`. `git stash create`
printed **empty**, because there were no tracked modifications — that is the correct answer, not a
failure, and it means the rollback anchor is `8eee30b` itself. **Halt if** `describe` is not `v2.4.0`
— the baseline is not what this spec measured.

### S1 — Check out the pinned release commit

```
    git -C .promptkit checkout a8c599435550c0887bd4aadb76e636c222ccac9f
    git -C .promptkit describe --tags --match v[0-9]*
```

Expect `v2.5.0`. **Halt if** `describe` returns only a bare SHA — the tag is missing, and a stamp
built from it would read `v2.5.0` only by accident of history. Re-run `fetch origin --tags` and retry.
After this the submodule status carries a leading `+` until the gitlink is staged; that is the same
pre-stage state the `v2.4.0` move recorded.

### S2 — Run the installer

```
    PROMPTKIT_NO_INTERACTIVE=1 bash .promptkit/init.sh
```

Expect the two `PREFLIGHT|` lines, five `Updated PromptKit OS directives in:` lines naming
`AGENTS.md, CLAUDE.md, .github/copilot-instructions.md, .clinerules/promptkit.md, .opencode/rules.md
(all profile: turbo)`, and `ASSERT|submodule|status|FAIL` while the index still names `13006a6`.

**The sequencing trap, expected and not a defect** (section 4.1): the exit code is 1 at this point. It is
`ASSERT|submodule|status|FAIL`, and it goes `OK` after S7 commits the gitlink. **Halt if**
`ASSERT|submodule|gitmodules|FAIL` appears instead: that means `.gitmodules` does not map
`.promptkit`, which is a real environment fault.

The installer itself rewrote `docs/STATE.md:19` to `v2.5.0 @ a8c5994`. Do not edit that line by hand —
the installer owns it.

### S3 — Verify the footprint

```
    git status --porcelain --untracked-files=all
    git diff --stat
    git diff -- AGENTS.md
```

Expect exactly seven modified paths — the five host directives, `docs/STATE.md`, and `.promptkit` —
plus the one pre-existing untracked review path. Each host file is `1+/1−` and its only hunk is the
`Engine:` line. **Halt if** any other path appears, or if a host diff is larger than one line: a second
hunk in a directive would mean the block was re-rendered rather than re-stamped, which invalidates AC-5.

### S4 — Repair the three hand-maintained claims

1. **`PROMPTKIT.md:8`** — the engine prose. `submodule @ 13006a6 = **v2.4.0**` becomes
   `submodule @ a8c5994 = **v2.5.0**`.
2. **`PROMPTKIT.md:10`** — the directive-block md5. `98425dbeb277c71f405f5e9aba999a7f` becomes
   `7ebe005d257f7d54596bb39c0ffd4ae4`. Verify against the block actually on disk before writing it.
3. **`PROMPTKIT.md:11-14`** — add the "What 2.5.0 adds" bullet. The counts (26 workflows, 9 protocols,
   30 template entries) are unchanged in `v2.5.0`, so the bullet names what actually moved: the
   `gemini` host id resolves to `AGENTS.md`, `GEMINI.md` left the target list and the
   pre-existing-config scan, `check-doctor` reports one row per target file, the conformance and capture
   scripts are engine-side and are not run here, the drift gap narrows from `+53` to `+9` and stays red
   by decision, and the prose under `protocols/` is advisory. Do not claim a new workflow, protocol, or
   template — there is none.

Do **not** touch `docs/STATE.md:19` — the installer owns that row and already wrote it in S2.

### S5 — Create the Task Record and project it in section 3A

Create `docs/tasks/2026-11-25-promptkit-v2-5-upgrade.md` from the execution Task Record template, with
this spec and its `PLAN` anchor as the link target. Then repoint section 3A at it.

Four measured constraints:

- The record link labels must not carry backticks; the validator link parser reads the label text
  literally.
- The spec and the record must land together. A record without its spec raises
  `INVALID_LINK|...|Missing PLAN link target or anchor`.
- Both artifact paths must appear under the record `In Scope`, because `SCOPE_CHANGE_MISSING` reads only
  the first backticked path per `Changed Files` bullet.
- The section 3A block must carry all ten compared pairs byte-identically, and the projection must drop
  fields that describe a *different* task. The previous projection carried `Historical Branch`,
  `Historical Revision`, `Current D7 Branch` and `Current D7 Revision` for the merged D7 typed-rows
  work; those four describe `TASK-drizzle-rls-failures` and are removed rather than rewritten, because
  carrying a stale branch name beside a new Task ID is exactly the kind of projection that reads as
  reconciled and is not.

### S6 — Gate sweep, all of it, this turn

```
    bash .promptkit/scripts/validate-references.sh --strict                  # expect exit 0
    bash .promptkit/scripts/validate-execution-control.sh --root .           # expect VALID|RECORDS=10
    bash .promptkit/scripts/check-setup-assert.sh . .promptkit .promptkit    # expect exit 0 after S7
    bash .promptkit/scripts/validate-ci-triage.sh                            # expect ERRORS=60
    bash .promptkit/scripts/check-doctor.sh .                                # expect exit 1, STALE(+9)
    npm run typecheck                                                        # expect exit 0
    npm run lint                                                             # expect exit 1 here; see below
```

Run this **with the `v2.5.0` scripts**, not the ones measured at S0 — the doctor is a script that
changed, and running the old one would report the old verdict. `npm test` is not a gate here: neither
`tsc` nor Vitest can observe the change, and the suite current state is out of scope and is not claimed.

`npm run lint` is red on this host for a reason this task did not cause, and the acceptance criterion
says so instead of hiding it: the run reports 28761 problems (1890 errors, 26871 warnings) across 347
files, **every one of them under `.agents/worktrees/dsh-a8234ecc-a9ee`**, a nested git worktree at
`f6e3ee7` that `.gitignore` does not cover. Zero flagged files sit outside `.agents/`, and no
`.promptkit` file is among them. The scoped run proves it:
`npx eslint . --ignore-pattern .agents/** --ignore-pattern .kilo/**` exits 0. That scoped exit 0 is the
evidence AC-14 records; a bare green is not claimed.

### S6b — The other two gates this repository runs

`validate-ci-triage.sh` keeps its `ERRORS=60` baseline over 3 records, unchanged by this move: this
task adds no triage record and edits no triage evidence, so a change in that number would mean the move
touched something it does not own. `check-doctor.sh` exits 1 and its version row reads `STALE(+9)` —
the accepted cost of D1, recorded verbatim in S8.

### S7 — Commits

```
    git add .promptkit AGENTS.md CLAUDE.md .github/copilot-instructions.md \
            .clinerules/promptkit.md .opencode/rules.md PROMPTKIT.md
    git commit -m "docs(state): pin the governance engine at v2.5.0 (a8c5994)"

    git add docs/STATE.md docs/specs/2026-11-25-spec-promptkit-v2-5-upgrade.md \
            docs/tasks/2026-11-25-promptkit-v2-5-upgrade.md
    git commit -m "docs(state): record the v2.5.0 upgrade and re-project section 3A"
```

Commit 1 carries the gitlink in the same commit as the five directives and `PROMPTKIT.md`, because
`check-setup-assert.sh` compares the worktree HEAD against the *recorded* gitlink and stays `FAIL`
until they are committed together. Commit 2 carries only the state tracker and the two planning artifacts.

**Stage explicit paths, never a directory.** `git add docs` would sweep in the untracked review report
named by D4 — the one staging mistake this change is actually exposed to.

### S8 — Read the doctor version row rather than asserting it

`check-doctor.sh` exits 1 and the version row reads `STALE(+9)`. That is the accepted cost of D1.
Record the row verbatim in the Task Record evidence section. **Do not** "fix" it by moving the pin; **do
not** report the gate as green. Every other row must be `OK` or an explained `SKIP` — in particular
`submodule OK` and `docs-drift OK`, the latter because the projection now agrees with the canonical
Task Record.

### S9 — Hot-reload

Run `pk:sync` in the next session so the agent reloads the updated rules from disk. The `v2.5.0`
behavioural text (the `gemini` target rule and the one-row-per-file doctor rule) is gate and installer
behaviour, which takes effect on the next run of those scripts, not on a session reading it.

## 6. Acceptance criteria

| ID | Criterion | Evidence |
| :--- | :--- | :--- |
| AC-1 | `.promptkit` is at `a8c5994` and `describe --tags` returns `v2.5.0` | `git -C .promptkit rev-parse HEAD`, `describe` |
| AC-2 | `.gitmodules` maps `.promptkit` to `promptkit-os`, and `git submodule status` has no leading `+` or `-` | `cat .gitmodules`, `git submodule status` |
| AC-3 | All five host directives carry `Engine: v2.5.0 (a8c5994)` | `grep -c` across the five files |
| AC-4 | The directive-block md5 is `7ebe005d257f7d54596bb39c0ffd4ae4` in all five hosts and matches `PROMPTKIT.md:10` | `awk ... \| md5sum` x 5, then `grep` |
| AC-5 | The `nextjs-agent-rules` block in `AGENTS.md` is byte-identical to `HEAD`, and each host diff is the one-line `Engine:` stamp | `git diff -- AGENTS.md`, `git diff --stat` |
| AC-6 | `PROMPTKIT.md` keeps exactly one `Profile: turbo` and one `tracking: github`, and its `Engine:` prose names `a8c5994` / `v2.5.0` | `grep -c`, `grep -n` |
| AC-7 | `docs/STATE.md` `Engine Version` reads `v2.5.0 @ a8c5994`; the section 3A projection names `TASK-promptkit-v2-5-upgrade`; section 8 carries a 2026-11-25 upgrade row | `grep -n` on the three anchors |
| AC-8 | The installer own footprint is exactly six files, `1+/1-` each, and zero new paths | S3 `git status` / `git diff --stat` |
| AC-9 | Commit 1 carries the gitlink plus the five directives plus `PROMPTKIT.md`; commit 2 carries `docs/STATE.md` plus the spec plus the record, and neither carries the untracked review path | `git show --stat` on both |
| AC-10 | `validate-references.sh --strict` exits 0 | script run |
| AC-11 | `validate-execution-control.sh --root .` exits 0 with `VALID` and zero `STATE_` rows | script run |
| AC-12 | `check-doctor.sh` reports every row `OK`/`SKIP` except `version STALE(+9)`, whose cause and count are recorded | doctor run + record |
| AC-13 | `check-setup-assert.sh` exits 0 after the gitlink commit | script run |
| AC-14 | `npm run typecheck` exits 0, and `npm run lint` exits 0 over the repository tree excluding the nested agent worktrees, where the only flagged files sit | both scripts, unscoped and scoped |
| AC-15 | No application source, test, schema, or CI runtime file changed | `git show --stat` scope check |

## 7. Risks, failure modes, and rollback

| # | Risk | Detection | Mitigation | Rollback |
| :--- | :--- | :--- | :--- | :--- |
| R1 | Installer writes a file outside the expected set | S3 diff scope | Do not stage; inspect the unexpected hunk first | `git checkout -- .`; `git -C .promptkit checkout 13006a6` |
| R2 | The tag object is checked out instead of the commit | `git -C .promptkit describe` reports nothing or a bare SHA | D1 pins the peeled commit `a8c5994`; S1 halts on a bare SHA | Re-checkout `a8c5994` |
| R3 | The documented `--remote --merge` recipe is used and lands on `4585201` | `describe` returns a nine-commit distance | D3 forbids that recipe | `git -C .promptkit checkout a8c5994` |
| R4 | `check-setup-assert.sh` fails after a correct install | `ASSERT\|submodule\|status\|FAIL` | Expected until the gitlink is committed - sequencing, not a defect (observed, section 4.1) | Commit S7, re-run |
| R5 | The doctor stays red and is reported as green | `check-doctor.sh` exit code | AC-12 requires the row be recorded verbatim; S8 forbids claiming green | - |
| R6 | The section 3A repoint names a Task ID the validator cannot find | `STATE_PROJECTION_MISMATCH` | S5 lands spec + record + projection in one commit (D6) | Re-run the validator; the red names the missing ID |
| R7 | Stale D7 fields are carried into a projection that now names a different task | `docs-drift` row; manual read of section 3A | S5 removes the four D7 fields instead of rewriting them | Re-edit section 3A |
| R8 | A docs-only commit sweeps in the untracked review report | `git show --stat` on commit 2 | D4 and S7 stage explicit paths only | `git reset` and re-stage |
| R9 | The engine 18941-line diff is assumed reviewed | - | It is not: this plan reviews the **install surface**. Section 3.1 quotes the two behavioural files that reach this repository | - |
| R10 | The `npm run lint` red is attributed to the upgrade | The flagged path list | Every flagged file sits under `.agents/worktrees/`; AC-14 states the scope and records the scoped exit 0 | - |

**Rollback is total and cheap.** No schema, no runtime, no data, no secrets, no CI. Reset the branch to
`8eee30b` and run `git -C .promptkit checkout 13006a6`; the working tree had no tracked modifications
at S0, so nothing needs stashing.

## 8. Open decisions for the owner

- **O1 — Pin the tag or `origin/main`?** This plan pins `v2.5.0` (`a8c5994`) and accepts
  `STALE(+9)` (D1). The alternative pins `4585201` (`v2.5.0-9`), which turns the doctor version row
  green at the cost of pinning nine unreleased commits. Recommendation: **the tag**. Ratified.
- **O2 — Close the Task Record in this change, or leave it at `awaiting_review` for a separate review?**
  Recommendation: close it, because the gates (AC-10 to AC-14) are the review and the owner authorized
  S0-S8 up front. Ratified.
- **O3 — Take the queued review follow-ups before or after this move?** Recommendation: **after**. They
  touch test and `docs/STATE.md` prose that this move also rewrites. Ratified.

## 9. Follow-ups this plan does not do

- **F-1 — The `docs/reviews/2026-11-22-promptkit-v2-sync-branch.md` evidence defects.** Still untracked
  and still unaddressed; this move neither stages nor edits that report (D4).
- **F-2 — The nested `.agents/` and `.kilo/` worktrees are invisible to `.gitignore`.**
  **Addressed 2026-11-25 as Level 1 work, inline.** `eslint.config.mjs` now ignores `**/.agents/**` and
  `**/.kilo/**`, and a bare `npm run lint` goes from exit 1, `28761 problems (1890 errors, 26871
  warnings)` over 347 files, to exit 0 with no output, the linted set falling 347 to 246 with all 101
  dropped files under a nested worktree. `.gitignore` is deliberately untouched: the ignore that matters
  to the toolchain is the linter's, and the nested checkouts are already invisible to `git status`
  through their own untracked `.gitignore` (`.kilo/` additionally via `.git/info/exclude`). Removing
  the worktrees stays the owner's call. Recorded in `docs/STATE.md` section 8.
- **F-3 — `npm test` state on this tree.** **Measured 2026-11-25, and the earlier text was wrong for
  this host.** The bullet previously read "not re-measured, not claimed. The last recorded state has
  pre-existing failures that predate this move"; both lanes were then run to completion on `72a1946`
  and neither fails. `npm test` exits **0** with `Test Files 70 passed (70)` / `Tests 695 passed (695)`
  in 47.33 s, and `npm run test:api` exits **0** with `Test Files 14 passed (14)` / `Tests 84 passed (84)`
  in 125.82 s. No test was skipped in either lane, so the counts are executions, not a green achieved by
  skipping. The `npm test` script excludes `tests/integration/api/**` by design, which is exactly why the
  second lane is quoted beside it rather than folded into the first. **Not claimed**: `npm run test:e2e`
  was not run, and neither lane is production evidence — `test:api` boots `next dev` against the local
  stack. The earlier "pre-existing failures" sentence described a state this host no longer has.
- **F-4 — The nine upstream commits after `v2.5.0`.** Not reviewed, not pinned. Every future pin decision
  re-opens the same `STALE(+n)` question, and the answer needs an owner call, not a green row.
- **F-5 — Engine-side conformance and capture scripts.** `v2.5.0` adds `capture-host-session` and
  `render-capture-transcript` plus a behavioural-eval runner. Nothing in this repository invokes them;
  if the host-conformance programme becomes relevant here, that is separate work with its own record.

## 10. Provenance

Every number above was produced in this session. Commands run:

`git rev-parse HEAD`, `git status --porcelain --untracked-files=all`, `git submodule status`,
`git -C .promptkit rev-parse HEAD`, `git -C .promptkit describe --tags --match v[0-9]*`,
`git -C .promptkit rev-parse v2.4.0 v2.4.0^{} v2.5.0 v2.5.0^{}`,
`git -C .promptkit rev-list --count HEAD..refs/remotes/origin/main`,
`git -C .promptkit rev-list --count v2.4.0..v2.5.0`, `git -C .promptkit rev-parse
refs/remotes/origin/main`, `git -C .promptkit diff --shortstat v2.4.0 v2.5.0`, `git -C .promptkit diff
--numstat v2.4.0 v2.5.0 -- scripts/ init.sh init.ps1 protocols/`, `git -C .promptkit diff --name-only
v2.4.0 v2.5.0 -- workflows/ templates/`, `git -C .promptkit diff -U2 v2.4.0 v2.5.0 -- init.sh`,
`git -C .promptkit diff -U3 v2.4.0 v2.5.0 -- scripts/check-doctor.sh`, `git -C .promptkit ls-tree -r
--name-only v2.5.0`, `git -C .promptkit show v2.5.0:scripts/validate-references.sh | grep -c strict`,
`awk PROMPTKIT_START..PROMPTKIT_END` over each host `| md5sum` x 5, `grep -n Engine Version
docs/STATE.md`, `wc -l docs/STATE.md`, `ls GEMINI.md`, `git ls-files`, `grep -n promptkit
eslint.config.mjs`, `bash .promptkit/scripts/validate-references.sh --strict`, `bash
.promptkit/scripts/validate-execution-control.sh --root .`, `bash .promptkit/scripts/check-setup-assert.sh .
.promptkit .promptkit`, `bash .promptkit/scripts/validate-ci-triage.sh`, `bash
.promptkit/scripts/check-doctor.sh .`, `npm run typecheck`, `npm run lint`, `npx eslint .
--ignore-pattern .agents/** --ignore-pattern .kilo/**`, `git worktree list`, `npm test`, `npm run test:api`.

**Not measured, and not claimed**: the engine 18941-line source diff; the behaviour of the new engine
scripts inside another host session; `npm run test:e2e`; whether `npm test` reads the same on a host
that does not carry a seeded local stack, since parts of the suite touch one; any CI run of the engine
own workflows; whether `origin/main`'s nine trailing commits are safe to pin; whether removing
`GEMINI.md` from the target list changes any other consumer, since this repository has no such file.

**Execution gate**: this plan authorized nothing by itself. The owner ratified D1-D6 and O1-O3 before S0,
and the two commits record the result.

