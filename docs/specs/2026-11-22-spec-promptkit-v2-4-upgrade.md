# Spec: PromptKit OS Upgrade — v2.3.0 (52adbe1) → v2.4.0 (13006a6)

<a id="PLAN-promptkit-v2-4-upgrade"></a>

- **Status**: Planned — awaiting owner ratification. This plan authorizes no execution by itself.
- **Date**: 2026-11-22
- **Ceremony**: Level 2 (Controlled) — Configuration Work, not Code Work. The canonical Task Record is
  `docs/tasks/2026-11-22-promptkit-v2-4-upgrade.md`; this spec supplies its planning inputs and creates
  no execution state.
- **Supersedes**: nothing. Extends `docs/specs/2026-11-19-spec-promptkit-v2-3-upgrade.md` (the
  `v2.0.0-71 → v2.3.0` move), whose D1–D7 remain the governing precedent where this spec is silent.
- **Target pin**: `13006a6e3fe955d220ee7a5d5518d4bd6b7e1652` — the peeled commit of annotated tag
  `v2.4.0` (`53daf435544887b522fef5242fbc72372b633536`) in `https://github.com/lowqualityloey/promptkit-os`.
- **Scope**: governance install only. No application source, schema, auth, API, database, runtime,
  release, tag, or deployment action.

---

## 1. Outcome

The repository moves its governance engine from the `v2.3.0` release to the `v2.4.0` release, and the
engine-drift report stops lying about a strictly-ahead engine. Nothing the application does changes,
because the engine ships no executable application code.

When this plan is done:

1. `.promptkit` sits at `13006a6` and `git describe --tags` says `v2.4.0`, so the stamp on every host
   directive names a real release rather than a commit that merely precedes one.
2. All five host directives carry `Engine: v2.4.0 (13006a6)`, and `PROMPTKIT.md` records the matching
   directive-block md5 so a reader can tell an edited block from an injected one.
3. `pk:doctor` reports the version row as `STALE(+12)` and that number is written down as an accepted
   cost — the release pin is twelve commits behind upstream `origin/main`, which is the price of pinning
   a release instead of a branch head.
4. `validate-references.sh --strict`, `validate-execution-control.sh`, `check-setup-assert.sh`,
   `npm run typecheck` and `npm run lint` all exit 0 against the new engine.
5. The work lands as commits whose file sets are exactly the ones this spec names, so a later reader can
   see that a governance move touched governance files and nothing else.

## 2. Explicit non-goals

- **Not an application change.** No file under `src/`, `app/`, `lib/`, `tests/`, `supabase/`, or
  `.github/workflows/` is edited. The engine's 39-file delta is entirely inside `.promptkit`, which is
  a submodule: it appears in the project tree as one gitlink.
- **Not an upstream source review.** `v2.3.0..v2.4.0` is 39 files / 1806 insertions, and this plan
  reviews the *install surface* — what the installer writes into this repository — not the engine's
  internals. The one behavioural delta that reaches us is read and quoted in §3, and that is the limit
  of the claim.
- **Not a fix for the twelve trailing commits.** Pinning `origin/main` (`43cb101`, `v2.4.0-12`) would
  make the doctor's version row green. It is rejected for the reason the 2026-11-19 API-suite review
  named: turning a row green by weakening the definition of what the row measures is not progress.
- **Not the review follow-ups.** The evidence defects in the branch review (AC-11 scoping, AC-13
  counts, `docs/STATE.md` §3A), the `docs/STATE.md` reconciliation against `origin/main`, and the
  `fixtures.ts` anon-key fix are separate work with their own records (F-2, F-3, F-4).
- **Not a CI change.** No governance workflow exists (F-1) and this plan does not create one.

## 3. Decisions

| # | Decision | Value | Why |
| :--- | :--- | :--- | :--- |
| D1 | Pin the release tag or the branch head? | Pin the **peeled commit** of tag `v2.4.0`: `13006a6e3fe955d220ee7a5d5518d4bd6b7e1652`. Accept `version STALE(+12)`. | The tag is annotated, so `rev-parse v2.4.0` returns the tag object `53daf43`, not a commit; `rev-parse 'v2.4.0^{}'` returns `13006a6` (measured). Pinning `origin/main` = `43cb101` (`v2.4.0-12`) would flip the doctor row to `OK` by pinning twelve unreleased commits. **Accepted cost**: `check-doctor.sh` still exits 1, now as `STALE(+12)` instead of `STALE(+36)`. This is an improvement in the number and no change in the verdict. |
| D2 | How to run the installer? | `PROMPTKIT_NO_INTERACTIVE=1 bash .promptkit/init.sh`, flagless. | Keeps `profile: turbo` and `tracking: github` (both already set in `PROMPTKIT.md:4`), runs the real preflight, needs no `--turbo`/`--experimental` flags. Measured exit 0 in a sandbox that mirrors this repository's host files (§4.1). |
| D3 | How to move the submodule? | Explicit `git -C .promptkit checkout 13006a6`, then `git add .promptkit`. | `git submodule update --remote --merge` lands on upstream HEAD and cannot express a pin; `QUICKSTART.md:76-82` still documents that recipe and it is wrong for this purpose. This is the same call the v2.3.0 move made (its D3). |
| D4 | What to do with the one untracked path? | Leave it untracked; record it in the S0 baseline; stage nothing outside the path list in §5 S7. | `git status --porcelain` is one row: `?? docs/reviews/2026-11-22-promptkit-v2-sync-branch.md`. Unlike the v2.3.0 move (11 dirty paths, a `git stash create` safety ref), there is nothing to protect here: the installer never writes or deletes an untracked path (measured — the sandbox run produced **zero** new or modified untracked paths, §4.1). A `git stash create` ref is still taken in S0 so a rollback has a named anchor, and it touches neither the index nor the worktree. |
| D5 | Which claims does the installer not maintain? | Four, all hand-edited in S4: `PROMPTKIT.md:8` (engine prose: SHA and tag), `PROMPTKIT.md:10` (directive-block md5), `PROMPTKIT.md:11-14` (the "What v2 changes" bullet), and `docs/STATE.md:263` + §8 row (Last Updated prose and session log). | The installer owns exactly one line per host directive (the `Engine:` stamp) and exactly one line in `docs/STATE.md` (`Engine Version`, `init.sh:1300-1310`). Everything else that mentions the engine is prose that no script rewrites, so it goes stale silently unless a human edits it. The prior move learned this the hard way (its D5). |
| D6 | Is a §3A repoint required? | Yes — and the Task Record must exist before §3A names it. | `validate-execution-control.sh` compares `docs/STATE.md`'s §3A projection against the canonical Task Record; a projection that names an unknown Task ID fails `STATE_PROJECTION_MISMATCH` (measured in the sandbox, §4.1). So spec, record, and projection land in one commit. **Good news the prior move did not have**: `validate-execution-control.sh` is byte-identical between `v2.3.0` and `v2.4.0` (empty numstat), so the 10-pair projection contract does not widen under us and there is no R11-equivalent trap. |
| D7 | Does the lint step need repeating? | No new step. `.promptkit/**` is already in `eslint.config.mjs`'s `globalIgnores`. | The prior move's S6 added it. `v2.4.0` ships no `.ts`/`.tsx` file (measured: `find .promptkit -name '*.ts' -o -name '*.tsx' | wc -l` = 0), so lint can neither see nor be broken by this engine. `npm run lint` is still run in S6 as a regression check, not as a repair. |

### 3.1 The one behavioural delta that reaches this repository

`v2.4.0` changes one gate script that this repository runs: `scripts/check-doctor.sh` (+22/−5) and its
PowerShell twin (+21/−2). The change is in `check_version()`: after the existing
`git merge-base --is-ancestor HEAD "$upstream"` probe returns non-zero, the script now probes the
**reverse** direction before concluding `DIVERGED`:

```
rev=0
git -C "$engine_dir" -c core.fsmonitor=false merge-base --is-ancestor "$upstream" HEAD >/dev/null 2>&1 || rev=$?
if [[ "$rev" -eq 0 ]]; then
    emit 'version' 'OK' "engine $stamp_ver ($stamp_sha) current" '-'
    return 0
fi
if [[ "$rev" -ne 1 ]]; then
    emit 'version' 'SKIP(shallow-or-offline)' "merge-base returned unexpected status $rev" 'Resolve the upstream ref and re-run'
    return 0
fi
```

The consequence is narrow and must be stated precisely, because it is easy to over-claim: **this fixes
`DIVERGED` for an engine that is strictly ahead of upstream. It does not touch `STALE(+n)`, which is
the `behind` branch.** Our engine is behind, not ahead, so the row stays red after the upgrade. The
upstream CHANGELOG entry (#743) reads as though the doctor gets quieter; for this repository it gets
quieter by twelve commits, which is a smaller red, not a green.

The three other changed workflow files are advisory text with no consumer contract:
`workflows/api.md` (+1/−1, a recipe link), `workflows/ship.md` (+1/−0, a recipe link),
`workflows/sync.md` (+4/−4, the six-state drift table rewritten to bidirectional ancestry),
`workflows/doctor.md` (+1/−1, forbids re-deriving the comparison). No file under `protocols/` or
`templates/` changes, and the workflow/protocol/template counts are identical (26 / 9 / 30).

## 4. Measured baseline

Every value below was produced in this planning session.

| Fact | Value | Command |
| :--- | :--- | :--- |
| Project HEAD | `f0b413e2d5bdf44b0d8333700348143b3db25093` | `git rev-parse HEAD` |
| Installed engine HEAD | `52adbe16c0ff2aea0d538e10c3225c2f3e40e315` | `git -C .promptkit rev-parse HEAD` |
| Installed engine describe | `v2.3.0` | `git -C .promptkit describe --tags --match 'v[0-9]*'` |
| Working tree | 1 path, untracked: `?? docs/reviews/2026-11-22-promptkit-v2-sync-branch.md` | `git status --porcelain` |
| Commits behind upstream | 36 | `git -C .promptkit rev-list --count HEAD..refs/remotes/origin/main` |
| Upstream ref | `43cb1018fa518244b9e03d3d3a30861838dbcca4` | `git -C .promptkit rev-parse refs/remotes/origin/main` |
| `v2.4.0` tag object | `53daf435544887b522fef5242fbc72372b633536` (annotated) | `git -C .promptkit rev-parse v2.4.0` |
| `v2.4.0` peeled commit | `13006a6e3fe955d220ee7a5d5518d4bd6b7e1652` | `git -C .promptkit rev-parse 'v2.4.0^{}'` |
| Commits the pin leaves behind | 12 | `git -C .promptkit rev-list --count 'v2.4.0^{}'..refs/remotes/origin/main` |
| Release delta | 39 files, +1806/−51 (13 added, 26 modified, 0 deleted) | `git -C .promptkit diff --shortstat v2.3.0..v2.4.0` |
| Release commits | 24 | `git -C .promptkit rev-list --count v2.3.0..v2.4.0` |
| Engine TypeScript files | 0 | `find .promptkit -name '*.ts' -o -name '*.tsx' | wc -l` |
| Current directive-block md5 | `b28a1cd8d852eaf0de91979996c3904f` (all five hosts agree) | `awk '/PROMPTKIT_START/,/PROMPTKIT_END/' <file> | md5sum` × 5 |
| Current `docs/STATE.md` engine row | `:264 - **Engine Version**: v2.3.0 @ 52adbe1` | `grep -n 'Engine Version' docs/STATE.md` |
| `docs/STATE.md` size | 1601 lines | `wc -l docs/STATE.md` |
| Workflow / protocol / template counts | 26 / 9 / 30 at `v2.3.0`, 26 / 9 / 30 at `v2.4.0` | `git -C .promptkit ls-tree -r --name-only <tag> -- <dir> | wc -l` |
| Changed gate/installer scripts | `scripts/check-doctor.sh` +22/−5, `scripts/check-doctor.ps1` +21/−2. All other gate scripts, `init.sh`, `init.ps1` and both directive templates: unchanged | `git -C .promptkit diff --numstat v2.3.0..v2.4.0 -- <paths>` |
| `--strict` still present in `v2.4.0` | 6 occurrences in `scripts/validate-references.sh` | `git -C .promptkit show v2.4.0:scripts/validate-references.sh | grep -c strict` |

Baseline gates at `f0b413e`, all run this session: `npm run typecheck` exit 0; `npm run lint` exit 0;
`validate-references.sh --strict` exit 0; `validate-execution-control.sh` exit 0
(`VALID|RECORDS=6|ROOT=.`); `check-doctor.sh` **exit 1** with exactly one non-OK row —
`version	STALE(+36)	engine v2.3.0 is 36 commit(s) behind refs/remotes/origin/main`.

## 4.1 Dry-run proof of the install surface

The installer was run twice in throwaway sandboxes under `/tmp`, both mirroring this repository's host
files, `PROMPTKIT.md`, `docs/STATE.md`, and the `.github` templates.

**The failed run teaches the trap.** `/tmp/pk24-dry2` created `.promptkit` with `git clone` inside a
`git init` repository, without registering it in `.gitmodules`. The installer rewrote all six files and
*then* exited 1:

```
ASSERT|submodule|gitmodules|FAIL
ASSERT|submodule|remedy|A gitlink is staged for .promptkit but .gitmodules does not register that path; ...
```

So an `ASSERT|submodule|...|FAIL` after a correct install is an environment artefact of how the engine
was placed, not a prediction of the real upgrade. This repository has a real `.gitmodules` mapping
`.promptkit` → `https://github.com/lowqualityloey/promptkit-os`.

**The authoritative run.** `/tmp/pk24-dry3` used `git submodule add --force` with the real
`.gitmodules`, engine at `13006a6` (`describe` = `v2.4.0`). Result: `installer_exit=0`,
`PREFLIGHT|SCOPE|20 fixed paths; 65536 bytes per file; no recursive scan or credential validation`,
`PREFLIGHT|NO_FINDINGS|FIXED_SCOPE_ONLY`, and `ASSERT|submodule|status|OK`.

Footprint outside the kit — **exactly 6 files, 6 insertions / 6 deletions**, one line each:

| File | Δ | The single changed line |
| :--- | :--- | :--- |
| `AGENTS.md` | 1+/1− | the `Engine:` stamp |
| `CLAUDE.md` | 1+/1− | the `Engine:` stamp |
| `.github/copilot-instructions.md` | 1+/1− | the `Engine:` stamp |
| `.clinerules/promptkit.md` | 1+/1− | the `Engine:` stamp |
| `.opencode/rules.md` | 1+/1− | the `Engine:` stamp |
| `docs/STATE.md` | 1+/1− | `:264` `- **Engine Version**: v2.3.0 @ 52adbe1` → `v2.4.0 @ 13006a6` |

The stamp delta, identical in all five hosts:

```
-Engine: v2.3.0 (52adbe1) — stamped at install time; run `pk:sync` to check for drift.
+Engine: v2.4.0 (13006a6) — stamped at install time; run `pk:sync` to check for drift.
```

**Zero untracked or created paths** — `git status --porcelain --untracked-files=all` shows only the six
`M` rows. This repository already carries `.github/pull_request_template.md` (4301 B) and
`.github/ISSUE_TEMPLATE/task.md` (3182 B), so the installer's template-creation branch does not fire;
the sandbox was given both files plus an appended `<!-- LOCAL EDIT -->` marker and the installer left
the marker intact (`grep -c` = 1), proving it does not rewrite an existing template.

**Predicted post-install md5 confirmed in the sandbox**: after the install, all five hosts hash to
`98425dbeb277c71f405f5e9aba999a7f`. Nothing in the kit *reads* that number — it is a human cross-check
recorded at `PROMPTKIT.md:10` — so a wrong value is a documentation defect, not a gate failure.

**Gates inside the sandbox after the install**: `validate-references.sh --strict` exit 0;
`check-setup-assert.sh` exit 0 with no `FAIL` rows. `validate-execution-control.sh` exited 1 with
`STATE_PROJECTION_MISMATCH|TASK-api-suite-hardening|docs/STATE.md|STATE projection references unknown
Task ID` — a sandbox artefact (the copied `docs/STATE.md` projects a record that was never copied in),
and the reason D6 exists. The sandbox's `check-doctor.sh` reported `version OK` — also an artefact: the
doctor inspects the engine directory **its script lives in** (`check-doctor.sh:31`,
`engine_root="$(builtin cd -- "$script_dir/.." && pwd -P)"`), and a fresh clone has a different
`origin/main` than this submodule. It is not a prediction.

## 5. Steps

### S0 — Baseline and safety anchor

```
    git rev-parse HEAD
    git status --porcelain
    git -C .promptkit rev-parse HEAD
    git -C .promptkit describe --tags --match 'v[0-9]*'
    git -C .promptkit fetch origin --tags
    git stash create
```

Expect HEAD `f0b413e`, one untracked review path, engine `52adbe1` / `v2.3.0`. Record the
`git stash create` SHA as the rollback anchor; it creates a dangling commit and touches neither the
index nor the worktree. **Halt if** `describe` is not `v2.3.0` — the baseline is not what this spec
measured.

### S1 — Check out the pinned release commit

```
    git -C .promptkit checkout 13006a6e3fe955d220ee7a5d5518d4bd6b7e1652
    git -C .promptkit describe --tags --match 'v[0-9]*'
```

Expect `v2.4.0`. **Halt if** `describe` returns only a bare SHA — the tag is missing, and a stamp built
from it would read `v2.4.0` only by accident of history. Re-run `fetch origin --tags` and retry.

### S2 — Run the installer

```
    PROMPTKIT_NO_INTERACTIVE=1 bash .promptkit/init.sh
```

Expect exit 0, the two `PREFLIGHT|` lines, five `Updated PromptKit OS directives in:` lines naming
`AGENTS.md, CLAUDE.md, .github/copilot-instructions.md, .clinerules/promptkit.md, .opencode/rules.md
(all profile: turbo)`, and `ASSERT|submodule|status|OK`.

**The one sequencing trap, expected and not a defect:** if `ASSERT|submodule|status|FAIL` appears here,
it is because the gitlink in the index no longer matches the submodule worktree — the installer writes
first and asserts second. It goes `OK` after S7 commits the gitlink. **Halt if**
`ASSERT|submodule|gitmodules|FAIL` appears: that means `.gitmodules` does not map `.promptkit`, which
is a real environment fault (the `/tmp/pk24-dry2` failure mode).

### S3 — Verify the footprint

```
    git status --porcelain --untracked-files=all
    git diff --stat
    git diff -- AGENTS.md
```

Expect exactly seven modified paths: the five host directives, `docs/STATE.md`, and `.promptkit` (the
gitlink). Each host file is `1+/1−`. **Halt if** any other path appears — inspect that hunk before
staging anything; the sandbox says there should be none.

### S4 — Repair the four hand-maintained claims

1. **`PROMPTKIT.md:8`** — the engine prose. `submodule @ \`52adbe1\` = **v2.3.0**` becomes
   `submodule @ \`13006a6\` = **v2.4.0**`.
2. **`PROMPTKIT.md:10`** — the directive-block md5. `b28a1cd8d852eaf0de91979996c3904f` becomes
   `98425dbeb277c71f405f5e9aba999a7f`. Verify against the block actually on disk before writing:
   `awk '/<!-- PROMPTKIT_START -->/,/<!-- PROMPTKIT_END -->/' AGENTS.md | md5sum`.
3. **`PROMPTKIT.md:11-14`** — the "What v2 changes" bullet. The counts (26 workflows, 9 protocols) are
   unchanged in `v2.4.0`, so append one clause naming what actually moved: the drift table's
   six states now distinguish a strictly-ahead engine from a diverged one, and `pk:doctor` implements
   the bidirectional ancestry test. Do not claim a new workflow, protocol, or template — there is none.
4. **`docs/STATE.md:263` and §8** — prepend the new milestone to the `Last Updated` chain
   (`2026-11-22 (**PromptKit OS v2.4.0 upgrade — ...**). Earlier: 2026-11-19 (...)`), and add one §8 row
   in the established shape: `| 2026-11-22 | Agent (DeepSeek Harness / lead) | PromptKit OS v2.4.0
   upgrade | Engine pinned to \`v2.4.0\` (\`13006a6\`), five host directives re-injected ... |`.

Do **not** touch `docs/STATE.md:264` — the installer owns that row and already wrote it in S2.

### S5 — Create the Task Record and project it in §3A

Run `pk:tasks` to create `docs/tasks/2026-11-22-promptkit-v2-4-upgrade.md` from
`.promptkit/templates/execution-task-record-template.md`, with this spec and its anchor as the `PLAN`
link target. Then repoint §3A at it: `Execution State`, `Active Task Pointer`, `Current Revision`,
`Next Action`, `Ceremony Level`, `Specification`, `Execution Scope`, `Start Time`, and the record's
`Owner / Actor` set equal to its `Current Actor`.

Three measured constraints from the prior move that still apply:

- The record's link labels must not carry backticks; the validator's link parser reads the label text
  literally and `FAILED|ERRORS=3` collapses to `VALID` once the backticks are stripped.
- The spec and the record must land together. A record without its spec raises
  `INVALID_LINK|...|Missing PLAN link target or anchor`.
- Both artifact paths must appear under the record's `In Scope`, because
  `SCOPE_CHANGE_MISSING` reads only the first backticked path per `Changed Files` bullet.

### S6 — Gate sweep, all of it, this turn

```
    bash .promptkit/scripts/validate-references.sh --strict                  # expect exit 0
    bash .promptkit/scripts/validate-execution-control.sh --root .           # expect VALID
    bash .promptkit/scripts/check-setup-assert.sh . .promptkit .promptkit    # expect exit 0 after S7
    bash .promptkit/scripts/check-doctor.sh .                                # expect exit 1, STALE(+12)
    npm run typecheck                                                        # expect exit 0
    npm run lint                                                             # expect exit 0
```

Run this **with the v2.4.0 scripts**, not the ones measured at S0 — the doctor is the script that
changed, and running the old one would report the old verdict. `npm test` is not a gate here: the
engine ships 0 TypeScript files, so neither `tsc` nor Vitest can observe the change, and the suite's
current state is out of scope and is not claimed.

### S7 — Commits

```
    git add .promptkit AGENTS.md CLAUDE.md .github/copilot-instructions.md \
            .clinerules/promptkit.md .opencode/rules.md PROMPTKIT.md
    git commit -m "chore(promptkit) upgrade engine to v2.4.0 (13006a6)"

    git add docs/STATE.md docs/specs/2026-11-22-spec-promptkit-v2-4-upgrade.md \
            docs/tasks/2026-11-22-promptkit-v2-4-upgrade.md
    git commit -m "docs(promptkit) plan and project the v2.4.0 upgrade"
```

Commit 1 carries the gitlink in the same commit as the five directives and `PROMPTKIT.md`, because
`check-setup-assert.sh` compares the worktree HEAD against the *recorded* gitlink and stays `FAIL` until
they are committed together. Commit 2 carries only the state tracker and the two planning artifacts.
Stage nothing from the queued review follow-ups (F-2/F-3/F-4); the untracked review report stays
untracked.

If the Task Record is closed to `awaiting_review` and then `completed` (the v2.3.0 precedent used two
further commits for this), each close reconciles §3A in the same pass — the validator compares the
record's state against the projection, so a close that forgets §3A raises
`STATE_PROJECTION_MISMATCH` and `REVISION_MISMATCH` together.

### S8 — Read the doctor's version row rather than asserting it

`check-doctor.sh` exits 1 and the version row reads `STALE(+12)`. That is the accepted cost of D1.
Record the row verbatim in the Task Record's evidence section. **Do not** "fix" it by moving the pin;
**do not** report the gate as green. Every other row must be `OK` or an explained `SKIP` — in
particular `submodule OK` and `docs-drift OK`.

### S9 — Hot-reload

Run `pk:sync` in the next session so the agent reloads the updated rules from disk. `v2.4.0`'s
behavioural text (the bidirectional ancestry rule in `workflows/sync.md` and `workflows/doctor.md`) is
directive prose; it takes effect only when a session reads it.

## 6. Acceptance criteria

| ID | Criterion | Evidence |
| :--- | :--- | :--- |
| AC-1 | `.promptkit` is at `13006a6` and `git describe --tags --match 'v[0-9]*'` returns `v2.4.0` | `git -C .promptkit rev-parse HEAD`, `describe` |
| AC-2 | `.gitmodules` maps `.promptkit` to `promptkit-os`, and `git submodule status` has no leading `+` or `-` | `cat .gitmodules`, `git submodule status` |
| AC-3 | All five host directives carry `Engine: v2.4.0 (13006a6)` | `grep -c` across the five files |
| AC-4 | The directive-block md5 is `98425dbeb277c71f405f5e9aba999a7f` in all five hosts and matches `PROMPTKIT.md:10` | `awk … | md5sum` × 5, then `grep` |
| AC-5 | The `nextjs-agent-rules` block in `AGENTS.md` is byte-identical to `HEAD` | `git diff -- AGENTS.md` shows only the engine-stamp hunk |
| AC-6 | `PROMPTKIT.md` keeps exactly one `Profile: turbo` and one `tracking: github`, and its `Engine:` prose names `13006a6` / `v2.4.0` | `grep -c`, `grep -n` |
| AC-7 | `docs/STATE.md` `Engine Version` reads `v2.4.0 @ 13006a6`; `Last Updated` names the v2.4.0 upgrade; §8 carries a 2026-11-22 row | `grep -n` on the three anchors |
| AC-8 | The installer's own footprint is exactly six files, `1+/1−` each, and zero new paths | S3 `git status` / `git diff --stat` |
| AC-9 | Commit 1 carries the gitlink plus the five directives plus `PROMPTKIT.md`; commit 2 carries `docs/STATE.md` plus the spec plus the record | `git show --stat` on both |
| AC-10 | `validate-references.sh --strict` exits 0 | script run |
| AC-11 | `validate-execution-control.sh --root .` exits 0 with `VALID` and zero `STATE_` rows | script run |
| AC-12 | `check-doctor.sh` reports every row `OK`/`SKIP` except `version STALE(+12)`, whose cause and count are recorded | doctor run + record |
| AC-13 | `check-setup-assert.sh` exits 0 after the gitlink commit | script run |
| AC-14 | `npm run typecheck` exits 0 and `npm run lint` exits 0 | both scripts |
| AC-15 | No application source, test, schema, or CI runtime file changed | `git show --stat` scope check |

## 7. Risks, failure modes, and rollback

| # | Risk | Detection | Mitigation | Rollback |
| :--- | :--- | :--- | :--- | :--- |
| R1 | Installer writes a file outside the expected set | S3 diff scope | Do not stage; inspect the unexpected hunk first | `git checkout -- .`; `git -C .promptkit checkout 52adbe1` |
| R2 | The tag object is checked out instead of the commit | `git -C .promptkit describe` reports nothing or a bare SHA | D1 pins the peeled commit `13006a6`; S1 halts on a bare SHA | Re-checkout `13006a6` |
| R3 | The documented `--remote --merge` recipe is used and lands on `43cb101` | `describe` returns `v2.4.0-12-g43cb101` | D3 forbids that recipe | `git -C .promptkit checkout 13006a6` |
| R4 | `check-setup-assert.sh` fails after a correct install | `ASSERT\|submodule\|status\|FAIL` | Expected until the gitlink is committed — sequencing, not a defect | Commit S7, re-run |
| R5 | The doctor stays red and is reported as green | `check-doctor.sh` exit code | AC-12 requires the row be recorded verbatim; S8 forbids claiming green | — |
| R6 | The §3A repoint names a Task ID the validator cannot find | `STATE_PROJECTION_MISMATCH` | S5 lands spec + record + projection in one commit (D6) | Re-run the validator; the red names the missing ID |
| R7 | The engine's 1806-line diff is assumed reviewed | — | It is not: this plan reviews the **install surface**. §3.1 quotes the only behavioural delta that reaches this repository | — |
| R8 | Another session keeps using the old directives | Agent behaviour after the upgrade | S9 runs `pk:sync` | Re-inject with the installer |
| R9 | The upgrade is conflated with the queued review follow-ups | Commit scope | AC-9 and AC-15 pin the file sets; the review report stays untracked (D4) | Drop the extra hunks, keep the engine move |

**Rollback is total and cheap.** No schema, no runtime, no data, no secrets, no CI. Reset the branch to
`f0b413e` and `git -C .promptkit checkout 52adbe1`; the S0 `git stash create` ref is available if the
worktree was disturbed. The installer also keeps its own snapshot/rollback trap.

## 8. Open decisions for the owner

- **O1 — Pin the tag or `origin/main`?** This plan pins `v2.4.0` (`13006a6`) and accepts
  `STALE(+12)` (D1). The alternative pins `43cb101` (`v2.4.0-12`), which turns the doctor's version
  row green at the cost of pinning twelve unreleased commits. Recommendation: **the tag**.
- **O2 — Close the Task Record in this change, or leave it at `awaiting_review` for a separate
  review?** The v2.3.0 precedent closed it in-change. Recommendation: close it, because the gates
  (AC-10 … AC-14) are the review.
- **O3 — Take the review follow-ups (F-2/F-3/F-4) before or after this move?** Recommendation:
  **after**. They touch test and `docs/STATE.md` prose that this move also rewrites, so doing them
  first would mean rebasing them onto a moving state tracker.

## 9. Follow-ups this plan does not do

- **F-1 — PromptKit Governance CI.** Still absent; `test.yml` ignores `docs/**` and `**/*.md`, so a
  governance-only commit runs no workflow at all.
- **F-2 — The branch review's evidence defects**: AC-11's working-tree-only evidence, AC-13's three
  disagreeing count sets, and `docs/STATE.md` §3A's falsified "cannot be re-measured today" claim
  (`docs/reviews/2026-11-22-promptkit-v2-sync-branch.md`, verdict Changes Requested).
- **F-3 — `docs/STATE.md` reconciliation with `origin/main`.** Main split the tracker (188 lines) from
  `docs/STATE-ARCHIVE.md` (2724 lines) in `378a5cc`; this branch instead deleted history in place.
  Adopting main's split **would delete §3A**, which `validate-execution-control.sh` compares against
  the Task Record, so the reconciliation must re-add the projection block on top of the split.
- **F-4 — The `fixtures.ts` anon-key fallback** and the missing anon-key check in
  `scripts/preflight.ts` (branch review F2/I-series).
- **F-5 — The six Drizzle/RLS failures** carried from `81fdd3c` need their own Task Record; they are
  environment-dependent and are neither caused nor fixed here.

## 10. Provenance

Every number above was produced in this planning session. Commands run:

`git rev-parse HEAD`, `git status --porcelain`, `git -C .promptkit rev-parse/describe/fetch/log/
rev-list/ls-tree/diff --numstat/diff --name-status/show`, `git -C .promptkit rev-parse 'v2.4.0^{}'`,
`git -C .promptkit rev-list --count v2.3.0..v2.4.0`,
`git -C .promptkit rev-list --count 'v2.4.0^{}'..refs/remotes/origin/main`,
`git -C .promptkit diff --shortstat v2.3.0..v2.4.0`,
`git -C .promptkit show v2.4.0:scripts/validate-references.sh | grep -c strict`,
`find .promptkit -name '*.ts' -o -name '*.tsx'`, `awk '/<!-- PROMPTKIT_START -->/,/<!-- PROMPTKIT_END -->/'
<file> | md5sum` × 5, `grep -n 'Engine Version' docs/STATE.md`, `wc -l docs/STATE.md`,
`git show origin/main:docs/STATE.md | wc -l`, `ls docs/WORKFLOW-MAP.md`,
`bash .promptkit/scripts/validate-references.sh --strict`,
`bash .promptkit/scripts/validate-execution-control.sh`,
`bash .promptkit/scripts/check-doctor.sh`, `npm run typecheck`, `npm run lint`,
and two sandboxed installer runs (`/tmp/pk24-dry2` failed by construction, `/tmp/pk24-dry3`
authoritative) each followed by `git status --porcelain --untracked-files=all`, `git diff --stat`,
`md5sum`, and the three validators.

**Not measured, and not claimed**: the engine's 1806-line source diff; the behaviour of the new
directives inside another agent's session; the full `npm test` suite (out of scope — the engine ships
0 TypeScript files); any CI run of a governance workflow (none exists); whether `origin/main`'s twelve
trailing commits are safe to pin.

**Execution gate**: this plan authorized nothing by itself. The owner ratifies D1–D7 and O1–O3, then
`pk:tasks` creates the Task Record and execution begins at S0.
