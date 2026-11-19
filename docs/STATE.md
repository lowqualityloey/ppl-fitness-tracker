# Project State & Living Execution Tracker

## 1. Executive Summary & Current Position

- **Project Name**: PPL Fitness Tracker
- **Current Milestone / Epic**: **M4: Hardening, Telemetry & Decommission — IN PROGRESS** (§7 item 22 is its start line). M3 is closed and stays described below. **(previously the live field named M3; it had not been moved since 2026-09-12T02:00Z)** Milestone #3 reads **open=0 / closed=19** (`gh api repos/lowqualityloey/ppl-fitness-tracker/milestones/3`, read 2026-09-12). M2 remains as it was: M2-00 → M2-06 merged (PRs #43–#47, #51, #53). All of M3's build slices merged 2026-09-11 — #57/#58 (PR #69), #59 (PR #71), #60 (PR #72), #61 (PR #74), #62 (PR #75), #63 (PR #79), #64 (PR #81), #65 (PR #83), #66 (PR #85). **#67 (M3-10, the verification gate) is MERGED as PR #86 (`8704c19`, 2026-09-11T19:23Z)**, and the milestone's last open issue, **#73 (`SessionStateSchema`), is MERGED as PR #87 (`2d5edfb`, 2026-09-12T02:00Z)**. M3's exit report and M4 handoff are `docs/releases/2026-09-12-m3-exit-report-and-m4-handoff.md`; the break-each-gate evidence is `docs/tests/2026-09-11-m3-verification-audit.md` (entries 9–19). **M4 is the next milestone** — §7 item 22 is its start line. **Wave 0 is under way:** #89 (M4-00) is merged — ADR-0006 records hand-authored migration authority, `0007` ships the auth→profiles cascade — and **#105 (M4-16) is merged as PR #116**, and **#105 (M4-16) is merged as PR #116**, the first of the seven ratified spec decisions to be executed rather than carried as a comment on an issue. Milestone #4 reads **open=28 / closed=3** (`gh api repos/lowqualityloey/ppl-fitness-tracker/milestones/4`, read 2026-09-12). Nothing is in flight; no PR is open.
- **Overall Status**: ACTIVE <!-- Options: ACTIVE | PAUSED | STABILIZING | RELEASE_CANDIDATE -->
- **Target Release**: v1.0.0, no date committed
- **Current Working Branch**: `chore/promptkit-v2-sync` (cut from `fix/drizzle-orm-cve` @ `81fdd3c`; that branch is one commit ahead of `main`). The dated notes below are historical, not competing current values.
- **Historical Branch Note — 2026-09-15 (M4-24 / #142), supersedes the field above for "where am I now"**:
  `feat/m4-24-csp-baseline`, cut from `origin/main` at PR #147's squash (`2ecb3eb`, read this turn), carrying the CSP
  baseline in three commits: the CI env fix, the policy with its two specs and this card's record, and this row.
  **Milestone #4 reads open=22 / closed=10** (`gh api repos/lowqualityloey/ppl-fitness-tracker/milestones/4`, read
  2026-09-15 — #94 has closed since the 23/9 reading above); `gh pr list --state open` is empty. Two things stay
  **unstaged and out of this PR on purpose**: the PromptKit engine pointer (`b3c5edf` → `ebfd67e`, v1.7.0) and the
  `AGENTS.md` directive block `init.sh` rewrote alongside it — a separate concern that owes its own `chore(promptkit)`
  commit. **Machine facts worth inheriting** (cost a detour, live nowhere in the repo): the browser battery needs
  `LD_LIBRARY_PATH=/tmp/pw-libs/extracted/usr/lib/x86_64-linux-gnu` on this box — Playwright's headless shell lacks
  `libnspr4`/`libnss3`/`libasound`, and the `page` fixture's `error while loading shared libraries` exit reads like a
  product failure when it is an unusable browser — and `lighthouse.spec.ts` cannot run here at all, because
  `chrome-launcher`'s WSL branch overwrites `TEMP` with a Windows profile path this user may not write (`EACCES`
  before any page loads). See §8's final row.
- **Historical Branch Note — 2026-09-15, post-#148 `pk:checkpoint` (supersedes the bullet above for
  "where am I now")**: no product branch is active. `origin/main` is `0fac817` — above `471c056`
  (M4-24/#142, PR **#148**, CI `test` **pass 13m48s**) and `0fac817` (M4-25/#149's card, PR **#150**, CI
  **pass 13m15s**); both issues closed, milestone #4 **open=21 / closed=12** (`gh api …/milestones/4`,
  read this turn). The only PR in flight is **#151** — `chore/promptkit-v1.7.0-sync` @ `b23d7dc`,
  **CI `test` pass 13m12s**, waiting on review — so this worktree still carries its `.promptkit` gitlink
  (`ebfd67e`, v1.7.0) as *intentionally unstaged* dirt until that PR merges; `AGENTS.md`'s v1.7.0 block
  lives on that branch, which is why a branch cut from `main` today still shows the pre-v1.7.0 directive.
  The two merged local branches were verified content-empty (`git diff <branch> origin/main -- <its
  files>` → **0 lines**) and pruned with `-D`, since a squash merge leaves topology behind content.
  **Next implementable is #95 (M4-06 Sentry)**: §9.3(1)'s ordering is discharged — `connect-src` already
  carries both ingest shapes, so #95 merges without editing one directive here, and narrows to the
  configured DSN origin *in its own PR*. It needs a Sentry project/DSN (or the same-origin tunnel
  decision) from the owner.
- **Historical Branch Note — 2026-09-15, after #95's implementation (supersedes the two bullets above for
  "where am I now")**: `feat/m4-06-sentry-error-sink`, cut from `origin/main` at `0fac817` and **rebased onto
  `e872f75`** when #151 (engine v1.7.0) and #152 (the post-#148 checkpoint) landed — the rebase conflicted in
  exactly the three anchors this file predicts (§1's branch bullet, §7's next item, §8's tail), and the
  resolution is append-only: their §7 item stays 25, this pass's became **26**.
  **`gh pr list --state open` this turn returns one row: #153** (M4-06), and **milestone #4 reads
  open=21 / closed=12** (`gh api …/milestones/4`, read this turn; #142 closed with #148, #149 with #150,
  #95 stays open until #153 merges). `AGENTS.md` on `main` is the v1.7.0 block now, so the lag this file kept
  noting — "a branch cut from main shows the pre-v1.7.0 directive" — is retired. The `.promptkit` gitlink is
  no longer dirty here either: the worktree's `ebfd67e` is what `main` records now.
  **Next implementable after #153: #101** (M4-12's remaining slice per the board's wave-1 tail) **or #149**
  (the Lighthouse bootstrap, small and self-contained) — #95's DSN question resolved as the same-origin tunnel
  the owner picked, so no Sentry credential is required by anything on the board.
- **Historical Branch Note — 2026-09-15, post-#153 `pk:checkpoint` (supersedes the three bullets above for
  "where am I now")**: no product branch is active. `origin/main` is **`01a9816`** — M4-06/#95, merged 03:27:26Z
  after CI `test` **passed in 13m54s** (0 failing steps). **#151** (engine v1.7.0) and **#152** (post-#148
  checkpoint) landed mid-pass, so this branch is rebased-free and `AGENTS.md`'s v1.7.0 block is what every new
  branch now inherits. **`gh api …/milestones/4` reads open=21 / closed=12 — and that is not the board's truth
  yet, because #95 is still open**: `Closes **#95**` in #153's body wrapped the reference in bold, GitHub's
  keyword parser saw no issue, and editing the body after the merge produced no link either
  (`closingIssuesReferences` still empty). The fix is a human close with the merge SHA quoted — §8's final row
  carries the wording. **Gates re-measured on merged `main` this turn:** typecheck 0 · lint 0 ·
  `npm run test` **58 files / 547 tests** · `next:build` clean with the route table all-`ƒ`.
  **Next implementable, no credential needed:** **#149** (make the Lighthouse gate runnable locally — small,
  self-contained, and it is the reason two sessions have now worked around the same wall) or **#101** (M4-12's
  remaining slice). **#16** stays the only owner-blocked card in the milestone.
- **Historical Branch Note — 2026-09-15, #149 (M4-25) implemented (supersedes the four bullets above for
  "where am I now")**: `test/m4-25-lighthouse-node-api`, cut from `origin/main` at **`2b7a77b`** (#154's
  checkpoint, which merged at 04:03:39Z). `tests/e2e/lighthouse.spec.ts` drives **Lighthouse's Node API over CDP
  against a Chromium the spec launches itself**, so the one gate this box could not run now runs:
  **4/4 with all four routes at 100**, measured here rather than inferred from CI. `lighthouse + csp + a11y`
  together: **15/15 in 1.3 min**. The card's contract is untouched — floors, `ENTRY_ALLOWLIST`, the
  `[measurement]` lines — and the gate was **watched red twice**: an injected set of four axe violations took
  `/sign-in` from 100 to **81** (red on the 90 floor; `aria-command-name, image-alt, label, link-name`), and
  withholding one session cookie made the `/history` audit report **100 on `/sign-in`**, which is the reason the
  file gained a `finalDisplayedUrl` assertion. See §5's rewritten Lighthouse bullet and the card's record.
  **Two board facts changed under this pass, both re-read from the API rather than inherited from §7 item 27:**
  **#95 was closed by the owner at 04:03:24Z**, so item 27's `open=21 / closed=12`-vs-`20/13` caveat is
  discharged; and **#149 had to be reopened** — it had been auto-closed *at filing* because PR #150's body (the
  docs-only PR that added the card) opened with `Closes #149`. `milestones/4` now reads **open=21 / closed=12**
  with that 21 listing #149 and no #95, i.e. the API is finally truthful about this milestone.
  **Machine facts, re-measured here and unchanged:** the browser battery still needs
  `LD_LIBRARY_PATH=/tmp/pw-libs/extracted/usr/lib/x86_64-linux-gnu`, and `PROMPTKIT.md` §3 named a path that does
  not exist (`/tmp/pwlibs/ext/…`) — corrected in this PR, since a documented workaround that points at nothing is
  how a machine fact gets rediscovered every session.
- **Historical Branch Note — 2026-09-15, post-#155 `pk:checkpoint` (supersedes the bullet above for
  "where am I now")**: no product branch is active. `origin/main` is **`5ac4c1c`** — M4-25/#149, merged 05:18:13Z
  via PR **#155**. Branch content verified empty (`git diff HEAD origin/main --stat` → empty) before pruning, so
  the local `test/m4-25-lighthouse-node-api` branch was deleted after the fast-forward; two remote tracking refs
  (`origin/test/m4-25-lighthouse-node-api`, `origin/docs/m4-25-lighthouse-card`) still exist and await the owner's
  prune ruling. **Milestone #4 reads open=20 / closed=13** (`gh api …/milestones/4`, read this turn) and
  `gh pr list --state open` is empty. `.promptkit` is `ebfd67e` (v1.7.0, via #151) with a clean worktree.
  **Next implementable: #101** (M4-12's remaining 50 rps slice); **#16** stays the only owner-blocked card.
- **Historical Branch Note — 2026-09-15, post-#156 `pk:checkpoint` (supersedes the bullet above for
  "where am I now")**: no product branch is active. `origin/main` is **`a543188`** — M4-12/#101, merged 10:24:19Z
  via PR **#156** (squash). Branch content verified empty (`git diff HEAD origin/main --stat` → empty) before
  pruning, so the local `test/m4-12-zwsp-name-gate` branch was deleted after the fast-forward.
  **#101 is CLOSED by the merge itself** — the PR body led with plain `Closes #101`, and the keyword parsed
  (contrast items 27/28: #95's bolded reference and #150's filing-time keyword). **Milestone #4 reads
  open=19 / closed=14** (`gh api …/milestones/4`, read this turn). `gh pr list --state open` is empty.
  `.promptkit` is `ebfd67e` (v1.7.0) with a clean worktree. **Next implementable: wave 2's #108 / #110 /
  #111 / #113 cluster**; **#16** stays the only owner-blocked card.
- **Historical Branch Note — 2026-09-15, post-#157 `pk:checkpoint` (supersedes the bullet above for
  "where am I now")**: no product branch is active. `origin/main` is **`3ef55ab`** — M4-19/#108, merged 11:14:42Z
  via PR **#157** (squash). Branch content verified empty before pruning, so the local
  `feat/m4-19-session-analytics` branch was deleted after the fast-forward. **#108 is CLOSED by the
  merge** (plain `Closes #108`, first line). **Milestone #4 reads open=18 / closed=15**
  (`gh api …/milestones/4`, read this turn); `gh pr list --state open` is empty. **#113 needs no work —
  it is the merged M4-kickoff planning PR, not an implementable card**, so wave 2's remaining work is
  **#110** (M4-21 export) and **#111** (M4-22 offline shell). **#16** stays the only owner-blocked card.
- **Historical Branch Note — 2026-09-16, post-#158 `pk:checkpoint` (supersedes the bullet above for
  "where am I now")**: no product branch is active. `origin/main` is **`b74b6aa`** — M4-21/#110, the
  versioned JSON export, merged 2026-09-15T13:42Z via PR **#158** (squash). Local `main` fast-forwarded,
  local branch deleted, remote ref already gone (`git ls-remote --heads` → 0). **#110 is CLOSED by the
  merge** (plain `Closes #110`; `closedAt 2026-09-15T13:42:04Z`). **Milestone #4 reads open=17 /
  closed=16** (`gh api …/milestones/4`, read this turn); `gh pr list --state open` is empty. The
  merge-commit CI tells the honest story: the first run (`34973217307`) went **RED on the new e2e** —
  the raw-download assertion read the `appSuccess` wrapper as the archive (`archive.version` → undefined),
  fixed in `51951e7` by asserting through the envelope, and run `34975082132` came back **exit 0 —
   e2e 76/76, unit 594/594, api 72/72**. Wave 2's remainder is **#111** alone; **#16** stays the only
   owner-blocked card.
- **Historical Branch Note — 2026-09-16, post-#159 `pk:checkpoint` (supersedes the bullet above for
  "where am I now")**: no product branch is active. `origin/main` is **`491fb1a`** — M4-22/#111, the
  hand-written service-worker offline shell, merged 2026-09-15T23:22:44Z via PR **#159** (squash).
  Local `main` fast-forwarded, branch pruned both ends (`git ls-remote --heads` → 0), tree clean.
  **#111 is CLOSED by the merge** (plain `Closes #111`, first line). **Wave 2 is complete — measured:**
  **Milestone #4 reads open=16 / closed=17** (`gh api …/milestones/4`, read this turn); `gh pr list
  --state open` is empty. Gates re-run on merged `main` this turn: typecheck 0 · lint 0 · unit
  **603/603** (63 files). CI's `test` job: **e2e 81/81 (7.1 m)** — the five new shell specs green in
  the production build, and both time-boxed `sla.spec.ts` margins held on CI hardware even after two
  local full-suite runs red them at 60 s+ contention (see §7 item 33). Also settled this session, and
  it belongs to the whole board now: **local e2e is no longer `libnspr4.so`-blocked** — the box runs
  the browser with `LD_LIBRARY_PATH=/tmp/pw-libs/extracted/usr/lib/x86_64-linux-gnu` and env sourced
  from `.env.local` (playwright's script passes no env file); item 32's "CI is this box's e2e venue"
  is history, kept only because it is dated.
- **Historical Branch Note — 2026-09-16, post-#160 `pk:checkpoint` (supersedes the bullet above for
  "where am I now")**: no product branch is active. `origin/main` is **`0121e9e`** — M4-20/#109, body
  measurements, merged 2026-09-16T01:14:30Z via PR **#160** (squash; `Closes #109`, issue closedAt
  01:14:31Z, API-read). Local `main` fast-forwarded, branch pruned both ends
  (`git ls-remote --heads` → 0), tree clean. **Milestone #4 reads open=15 / closed=18** (`gh api
  …/milestones/4`, read this turn); `gh pr list --state open` is empty; and **#95 is CLOSED on the
  board** — the owner's manual-close tail is discharged (verified this turn, not assumed).
  **Wave 3's head moved: #103's hard #109 gate is discharged** — F-1 proved legacy `userStats` had
  zero writers estate-wide and the replacement model shipped, so deleting the four legacy modules and
  five keys strands no data; the parity flip at `tests/e2e/legacy-parity.spec.ts:95` follows the card
  with its inversion-first rule intact. Pre-merge gates on branch head `767c9ca`: typecheck 0 · lint
  0 (`--max-warnings=0`) · unit **619/619** (64 files) · api **81/81** (13 files) · mutation exit 0 ·
  `next build` clean · `settings.spec.ts` e2e 8/8 (axe + save→reload→row round-trip). **CI was the
  arbiter as always: `test` pass, 14m51s** — the full 81-spec battery including both time-boxed
  `sla.spec.ts` margins on runner hardware. §1's "does not exist" paragraph loses its measurements
  entry. Harness note for the next session: `npx next build` **rewrites the tracked
  `public/sw.js` BUILD_VERSION stamp** — after any local build, `git checkout -- public/sw.js`
   before staging (done this pass; the change was discarded, not committed). §1 bullet + §7 item 34
   carry this sync. #16 stays the only owner-blocked card.
- **Historical Branch Note — 2026-09-16, post-#161 `pk:checkpoint` (supersedes the bullet above for
  "where am I now")**: no product branch is active. `origin/main` is **`6660172`** — M4-14/#103,
  the legacy decommission, merged 2026-09-16T03:26:59Z via PR **#161** (squash; the plain
  `Closes #103` line closed the issue, closedAt 03:27:00Z — API-read). Local branch pruned
  (`-d` is impossible after a squash — the patch lands as a new commit; #158-row convention),
  remote ref self-deleted on merge (`git ls-remote --heads` → 0, read this turn).
  **The vanilla-JS estate is gone from `main`**: 31 files, +225/−15 153, four commits — the
  inversion watched RED on flip, GREEN on deletion, RED again under a *tracked* resurrection,
  green after the revert, and the index-vs-worktree boundary is now written into the spec that
  enforces it. `tests/e2e/legacy-parity.spec.ts` is an absence guard: tracked estate-path census,
  five-key writer scan, and a phantom-`/sw.js` registration scan whose only allow-listed registrar
  is `src/components/shell-registration.tsx`. **Milestone #4 reads open=14 / closed=19**
  (API, this turn); no open PR.
  **The PR exposed one fact no card had ever named:** Vercel had no repo-side config, so its build
  command defaulted to `npm run build` — vite — and every branch until this one had been quietly
  "succeeding" by building the legacy app into an ignored `dist/`. This branch was the first where
  that could not be harmless. Fixed in-repo, not in the dashboard: `vercel.json` (commit `3f0be8c`)
  pins `framework: nextjs` + `npm run next:build`, so a future deletion card sees the deploy
  contract while grepping the repo. Re-run on the new head: **CI `test` PASS 15m56s · Vercel PASS**.
  Harness discipline held again: local `next:build` re-stamped the tracked `public/sw.js`
  BUILD_VERSION twice this session and both stamps were discarded, not committed.
  **Next implementable: #104 (M4-15)** — this merge hands it exactly its inputs: `dev`/`build`/
  `preview` fail at startup (recorded in §5 as the honest interim), `vite` is still a devDependency,
  and #104 must keep `npm run next:build` resolvable or edit `vercel.json` in the same commit —
  the pin is now greppable, which is the point. Then the epistemic tail: **#112** (ADR-0007,
  first-merge-wins slot race with #78) and **#91** (concurrent re-measure). #16 stays the only
  owner-blocked card. §1 bullet + §7 items 35–36 carry this sync.
- **Historical Branch Note — 2026-09-16, #104 (M4-15) implemented (supersedes every bullet above for
  "where am I now")**: `feat/m4-15-retire-legacy-build`, cut from `main` at #161's checkpoint (read
  `git log --oneline -1` at the cut, per §1's no-pinning rule). The rename commit: `dev`/`build`/`start`
  **are** the Next commands now (port decision: stay on 3001, recorded on the card), the Vite
  `dev`/`build`/`preview` and the transitional `next:*` aliases are gone with the `vite` devDependency,
  and `vercel.json` + `playwright.config.ts`'s webServer flipped **in the same commit** — no commit in
  this branch's history lets the deploy contract point at a dead name. The AC-2 guard is new and was
  watched RED before the rewire (`tests/unit/infra/legacy-build-scripts.test.ts`: 3 failed / 1 passed →
  4/4 green). Gates measured on this head: typecheck 0 · lint 0 · unit **623/623** (65 files) · api
  **81/81** · full e2e battery **81/81 in 4.2 m**, booted through the renamed webServer command, so the
  battery is itself AC-1 evidence; `npm ci` clean; `public/sw.js` re-stamps discarded before staging.
  **Post-merge, this turn**: PR **#162** merged it as `b7fb2e3` (squash, closedAt 04:31:30Z on the plain
  first-line `Closes #104`) with CI **`test` PASS 15m49s + Vercel PASS** — the first deploy that built
  through the flipped `buildCommand`, so the pin is proven on Vercel's runner, not just in prose. **Milestone
  #4 open=13 / closed=20** (API, this turn); no open PR; G-M4-3's "#104 after #103" is discharged and
  the decommission goal is complete. Branches pruned — remote ref self-deleted on #161 but **not** here,
  deleted by hand, so the lesson stands: measure with `git ls-remote`, never assume the setting.
  Next after this: the epistemic tail **#112** + **#91**; **#16** stays owner-blocked.
- **Historical Branch Note — 2026-09-16, #112 (M4-23) implemented, decision-only close (supersedes
  every bullet above for "where am I now")**: `feat/m4-23-realtime-decision`, cut from `main` after
  the #162 checkpoint (read `git log --oneline -1`, per the no-pinning rule). The owner's ruling —
  taken **before** any writing, as befits a privilege decision — is **accept the 4 s poll floor and
  monitor**: `docs/adrs/0007-realtime-declined-poll-floor-accepted.md` costs the Realtime RLS
  widening (first browser-readable application-table policy; zero `authenticated` policies today),
  names four revisit triggers, and enshrines the card's AC-2 ("tenancy precedes traffic") as a
  permanent precondition for any future implementation PR. M3 §8.3 cites the ADR; the M4 spec's
  "ADR pending" cell flipped to Decided; `sla.spec.ts` gained a comment pointer and **zero budget
  movement**; the AC-3 sweep ran before its edit and found the prose already honest. Renumbering
  note: the card body says `0006-…` — stale since #89 took that slot; the first-merge-wins race
  with **#78** resolved by this merge, so #78's ADR (if it ever wants one) is 0008. Written
  pre-merge — no PR number or CI claim here yet; the tail after this is **#91** alone.
  **Post-merge, this turn**: PR **#163** merged as `36f62a3` (squash, 05:05:49Z on the plain
  first-line `Closes #112`); **CI `test` PASS 16m43s + Vercel PASS** — the full battery rode the
  comment-only `sla.spec.ts` change, so "nothing runs differently" is runner-proven, not asserted.
  **Milestone #4 open=12 / closed=21** (API, this turn); no open PR. Remote ref did **not**
  self-delete a second consecutive time — the `git ls-remote` measurement is now a rule, not a
  one-off. Next implementable: **#91**; #16 stays the only owner-blocked card.
- **Historical Branch Note — 2026-09-17, post-slice-A `pk:checkpoint` (supersedes every bullet above for "where am I now")**: **M4-27 slice A is implemented, measured AND MERGED** — PR **#169** (head `a3ffb0c`) squash-merged into `main` as **`de68db5`** at 2026-09-16T10:40:45Z, checks `test` **SUCCESS** · Vercel **SUCCESS**, 6 files +256/−12. The earlier reading this session inherited ("3 commits ahead of `origin/main`, no PR") was a **stale remote-tracking ref**: after `git fetch`, `origin/main` is `de68db5` and `git rev-list --left-right --count origin/main...HEAD` reads **1 behind / 5 ahead** — three of those five are content duplicates of the squash (`f181221`, `cb592d3`, `a3ffb0c`), which is the squash-arithmetic rule this file states twice (measure content with `git diff`, never with counts). The **2 genuinely unique commits are the PromptKit v1.8.0 sync**, and they are on this branch, not `main`: `7a30ed2` (engine gitlink `ebfd67e` → `2340251`, directive block rewritten in `AGENTS.md` and the four new host copies) and `65f5151` (`PROMPTKIT.md` §0 engine row + `tracking: github`). They owe the v1.7.0 precedent's own `chore(promptkit)` PR (#151) — **and that branch must be re-cut from `origin/main` first**, or the PR carries duplicate slice-A history. Working tree clean at `65f5151`; `npm run lint` exit 0 was measured on the earlier of the two commits and nothing executable changed since. **Board, measured this turn: milestone #4 open=13 / closed=23**; `gh pr list --state open` empty; **#164 open (`state_reason=reopened`)**, **#167 open**, **#168 open**. **Slide A merged without closing its card: PR #169's `closingIssuesReferences` is `[]`**, so **#167 is open although its slice shipped** — the #95 / item-27 shape (a closing keyword the parser never saw; the card is not at fault, the PR body wording was). It needs a human close quoting `de68db5`, exactly as #95 received at 04:03:24Z. **Next implementable: slice B (#168 / M4-28)** — its hard order ("after #167, after the owner's ratification comment on #164") is satisfied, and its PR is the one that carries the closing keyword for #164.
- **Historical Branch Note — 2026-09-21, `pk:auto --until pr` run (supersedes every bullet above for
  "where am I now")**: **M4-28 slice B (#168) is implemented, measured and committed** as
  **`c24b3a9`** on `perf/m4-28-fan-out-batching`, cut from `origin/main` at **`72fa17f`**
  (`git switch -c … origin/main`; #170 had already landed the v1.8.0 engine sync and #171 the
  post-slice-A checkpoint, so the branch that carried this session's earlier work —
  `docs/m4-27-slice-a-checkpoint` — was a stale leftover whose one commit is content-identical to
  `0431eb5`, verified with `git diff 0431eb5 HEAD --stat` → empty). **What changed:** `syncStore()`
  now prefetches the batch's reservations (three statements) and the session's version partition
  plus set/task fallbacks (one read, write-through after each apply) and settles everything in one
  `flushTail()` — an exact `serverSeq` claim, a deduped bulk version upsert, a bulk change insert and
  a bulk `applied` stamp. **`SyncStore` is unchanged and `SyncEngine.apply` is untouched**, which is
  why the seven-branch decision evidence sits in the *prefetch*, not in the domain loop: the
  per-mutation classification order, the STALE_CONFLICT baseline and the replay/idempotency shapes
  are the same code that passed before. One real bug was caught mid-run and fixed before any commit:
  the set-fallback loop cached under the *slot* key (`exerciseId:setIndex`) instead of the cache key
  (`type|entityKey`), so every engine question missed and a stale write applied — red on
  `tests/integration/repository/workout-repository.test.ts`'s legacy-backfill case, which is exactly
  the control that exists for it. **Evidence (all re-measured this session, no inherited numbers):**
  typecheck 0 · lint 0 · `npm test` **65 files / 626 tests** · `npm run test:api` **13 files / 81
  tests** (preflight green) · `npm run test:e2e -- --workers=1` **81 passed in 5.7 m** on the second
  battery (the first red `sla.spec.ts:336`, G-M3-3 at `p95 5289 ms`, non-reproducible: solo re-runs
  gave 4510 / 4431 ms with medians identical to the red run's, and the next battery was 81/81) ·
  paired same-day driver legs and the solo control, tabulated in §5's G-M3-4 bullet and
  `docs/perf/2026-09-16-m4-91-batch-contention.md` §"M4-28 slice B". **Board, measured this turn:**
  milestone #4 **open=12 / closed=24** (`gh api …/milestones/4`), `#167` **CLOSED**
  (2026-09-16T12:07:41Z — the human close item 44 asked for), `#164` and `#168` still **open**, no
  PR open. Two environment facts that cost detours and belong to the next session: the
  `/tmp/pw-libs` + `LD_LIBRARY_PATH` workaround **is obsolete on this box** (`libnss3` / `libnspr4` /
  `libasound` are now system-wide in `/lib/x86_64-linux-gnu` — PROMPTKIT §3's paragraph is now stale,
  left unchanged as out-of-scope), and a backgrounded `npm run test:e2e` **does not survive the
  harness's shell exit** while its `next start` child does, so a leftover server then dies on EPIPE
  and every *navigating* test times out at 35 s while file-scanning tests pass — run the battery
  synchronously, and never read that signature as a product failure. **Not done here:** no §7 checklist
  item was added (the PR body carries the detail), and no 50 rps attempt (#90's unreachable ceiling).
- **Historical Branch Note — 2026-09-21, post-#172 `pk:checkpoint` (supersedes every bullet above for
  "where am I now")**: **M4-28 slice B (#168) is MERGED** — PR **#172** (head `ee8fbd7`) squash-merged into
  `main` as **`8ae6f8c`** at 2026-09-21T01:13:16Z, and the merge did what the two previous cards could not:
  **`Closes #164, closes #168` on the body's first line actually parsed**, so **#164 and #168 both read
  `CLOSED / COMPLETED`** (closedAt 01:13:17Z / 01:13:18Z, API-read) and the **#164 chain is closed
  end-to-end** — reopened card → spike #166 → slice A #169 → slice B #172. **#167 stays closed** from the
  human repair of 2026-09-16T12:07:41Z. The tree is **on `main` at `8ae6f8c`** with the feature branch
  **pruned** (`-D`, taken only *after* `git diff origin/main HEAD` measured **empty**, so the squash was
  proven to have captured the branch in full); the engine submodule sits at its pin (`v1.8.0-15-g2340251`).
  The **only dirt is `AGENTS.md`'s `next dev`-re-added `nextjs-agent-rules` block**, restored from a stash
  rather than dropped. **One environment correction from this pass**: the first `git checkout main`
  **refused** because that same block is durable working-tree dirt — a dirty tree blocks the post-merge
  switch, not just the commit — and the block's own text names the remedy (commit it).
- **Last Updated**: 2026-11-19 (**PromptKit OS v2.3.0 upgrade — engine pinned at `52adbe1` (tag `v2.3.0`), the five host directives re-injected with the new 2.3.0 untrusted-content boundary, and `PROMPTKIT.md`'s engine prose and directive md5 re-stated. The Task Record is `docs/tasks/2026-11-19-promptkit-v2-3-upgrade.md`; §3A is repointed at it and `docs-drift` is OK.**). Earlier: 2026-10-23 (**PromptKit OS v2.0.0-71 migration — engine pinned at `0cfa093`, five host directives re-injected, profile machine lines plus `size: large` set, and the §8 table repair is green (`VALID|RECORDS=2`). The Task Record is `docs/tasks/2026-10-23-promptkit-v2-migration.md`; §3A is populated and `docs-drift` is OK; the only remaining follow-up is the C6 governance CI; the release tag stays held.**). Earlier: 2026-09-21 (`pk:checkpoint` 03 at `532c1c9`; the drizzle upgrade landed afterward at `81fdd3c`).
- **Engine Version**: v2.3.0 @ 52adbe1
  identified as already-merged planning PR, milestone #4 open=18/closed=15. Earlier: **post-#156 checkpoint** — #101/M4-12 merged as `a543188`, keyword
  closed the issue, local branch pruned, milestone #4 open=19/closed=14. Earlier: **post-#155 checkpoint** — #149/M4-25 merged as `5ac4c1c`, local branch pruned,
  milestone #4 open=20/closed=13. Earlier: **#149 / M4-25 implemented** — the Lighthouse gate runs on this box now, four
  audits at 100, both controls watched red, and §5's long-standing chrome-launcher bullet is closed with its
  `PATH`-scrub prescription recorded as the trap it was. Earlier this pass: #154 merged and the owner closed
  #95; #149 reopened after its own filing PR had burned it). Before that: **post-#153 checkpoint** — M4-06
  shipped as `01a9816` with CI green, wave 1 (#94 → #142 → #95) is closed, §1's "does not exist yet" paragraph
  lost its telemetry entry, and one board defect surfaced by the merge itself is recorded in §8. Earlier the same
  day: **M4-06 (#95) implemented and observed** — both bundles report to an error sink through a same-origin
  tunnel, `connect-src` went back to `'self'`, and the id on the Sentry event is the id on the route's log line;
  five findings from running it are in §8's final row. Earlier the same day: **M4-24 (#142) implemented and measured — the CSP is server-sent on every response,
  `'unsafe-inline'` is absent from the string, `/_not-found` and `/sign-in` paid the nonce price and read `ƒ` in a
  19/19-dynamic route table, and both watched-red mutations were run and recorded on the card; §8's final row carries
  the numbers, the two battery flakes that are not this card's, and the Lighthouse-100 measurement taken around a
  machine defect. Earlier the same day, before this card: the #94 closeout pass committed the 2026-09-14 `pk:onboard`
  drift patch and opened PRs #146/#147. Before that:) 2026-09-14 (**concern C — the #94 implementation, all of it — is committed as `40ec0c9` on top of #144’s squash (`9f17dfc`) — followed by `e850a4f`, found by writing AC-2’s test before trusting it — the tree is clean, and the branch was re-cut to carry only those two code commits + this row — every earlier commit is already upstream via #143/#144; not yet pushed at this revision; §8's final row carries the M1-11 inert-selector finding and the two product facts the red runs produced. Before this row: concern B is committed as `5667ea0`, the branch is rebased onto
  `origin/main` and pushed, and `lib/logger/` for #94 is the only uncommitted work left — §8's final row.
  Earlier the same day: a `pk:sync` + `pk:commit` engine pass followed the §7 pass: PromptKit OS `c7199c3` → `b3c5edf`, host profile `turbo`, committed as `24e99e5` with `--only` so the in-flight `pk:fix` index survived — §8's final row; two engine-side defects found there too: `pk:grill` has no `workflows/grill.md`, and `sync.md` still advertises 19 of 22 workflows**; **the §7 pass's one owed action is discharged**: the CSP card exists — `docs/tasks/m4/M4-24-csp-baseline.md`, committed as `e0a3f92` and filed as **#142** on milestone 4; board wave 1 now reads #94 → #142 → #95 and #95 waits on it. Earlier the same day: **three** `pk:checkpoint` passes this session — #3: sign-off artifacts committed as `90532b2` (§8 commit row, amend incident disclosed); #2: §7 sign-off pass COMPLETE 13/13, CSP ruled FILE, spec now `grilled + signed-off` → item 24's SIGN-OFF COMPLETE bullet + §8 row; #1: PLAN-m4 retroactive M4 spec authored + grilled — §7 item 24 and the §8 row of 2026-09-14; prior sync content below, dated 2026-09-12: **M3 closed**: milestone 3 `state=closed`, 19/19. #86→`8704c19`, #87→`2d5edfb`, #88→`793db53`, #113→`e9925b5`, #114→`0d221cf`, #115→`69d86cd`. **M4 started**: milestone #4 created, 24 cards filed #89–#112 + 6 parked re-milestoned; #89 (D4 migration authorship + auth-FK cascade) merged as ADR-0006. **The first of those seven ratified decisions executed**:
  #105 → PR **#116** → `6043990`, #105 closed; post-merge gate re-measure on `main` → PR **#117** →
  `89ce24d`. #116's first CI attempt was red on a documented load-sensitive spec and its re-runs
  green, which is recorded in §7 item 22 and PR #116 rather than smoothed.)
- **Gate status**: #48 (D5 route-handler coverage + D1 lint enforcement) and #49 (this intake
  record) are **merged to `main`**, and `main`'s own Actions runs are green (4m32s and 4m40s).
  `npm run lint` exits 0 there. Consequence for the text below: the gates are no longer pending
  but enforced — a PR that reintroduces an `any`, drops an env var, or breaks a declared skip
  now fails in CI, so claims marked closed are backed by a gate.
  #51 (M2-05 importer) is merged on top of them, so the importer's 5 route specs are now
  gate-enforced on the default branch rather than only on a branch that claimed to pass.
  **M3's two exit PRs are merged on top of all of that — #86 (`8704c19`) and #87 (`2d5edfb`) — and
  `main`'s own `test` check is `success` on both merge commits**, so the E2E job, the contrast gate,
  the Lighthouse gate and the legacy-parity scan are all executing on the default branch, not only
  on a branch that claimed to pass.
  Still open as debt: D2, D6, D7 (D3 closed with M3; D4 closed with #89 — the migration
  authorship model is recorded in ADR-0006 and `PROMPTKIT.md` §3; the E2E suite exists, is
  CI-gated, and `PROMPTKIT.md` §3 now describes the real harness, traps included).

**Where things actually stand.** M1 schema, RLS, auth, contracts, exercise/stretch seeds, and the M1-16 route baseline are on `main`. M2-00 adds the runtime app-role Drizzle client, verified auth-to-RLS context, session domain mappers, and user-scoped repository; M2-01 adds the sessions API; M2-02 adds the pure lifecycle transition table, transaction-scoped set/task/phase/finish mutations, and rollback coverage; M2-03 adds pure Epley e1RM calculation and transaction-scoped personal-record recomputation with app-role ownership/rollback coverage; M2-04 adds bounded transactional sync, replay-safe mutation metadata, per-session sequencing/change rows, deterministic clock/device conflict resolution, and the authenticated `/api/sync` adapter. M3 put a real app on top of it: the dashboard, the
session runner with the durable outbox, absolute-deadline timers, history and per-exercise
progress, settings with the legacy-import report, and the Playwright/axe/Lighthouse/contrast/
legacy-parity gates that defend all of it in CI — merged as PRs #69–#87, with the measured
residuals listed in §5 rather than smoothed.

**What does not exist yet, stated plainly (2026-09-12, corrected 2026-09-16 after #158 and again after #159 — the earlier pass retired the analytics and export entries, this pass retires the service-worker entry, and the correction is the point of keeping the sentence dated, a third time after #160 — this pass retires the body-measurements entry — and a fourth time in this pass, #103, which retires the legacy-app sentence)**: production email delivery (issue #16, deferred since M1);— and note what replaced the deleted words: the 50 rps harness was *never* a true absence here — it shipped as M4-01/#90 on 2026-09-12, and the entry's long-standing "(M4-12 #101)" attribution was doubly wrong (#101 was the ZWSP name gate; §8's post-#156 row owns that half); structured logging and one correlation id shipped as #94, the CSP baseline as #142, and Sentry's error sink on both bundles as #95, so "no telemetry" now means "no *tracing*", which is DEFERRED-m4-005 and not an absence; and the service worker absence retired by #159 kept its own honesty trail — DECISION-m4-003's hand-written `public/sw.js` precaches, stores navigation documents verbatim, and never touches an `/api` exchange, so G-M3-1's "reopen with no network" is finally proven against the document being unfetchable (`context.setOffline(true)` reload, five e2e specs, controls watched red first) rather than against the *API* dead as handoff §3.4's difference used to require. Realtime — and this clause changed kind, not just date: it *was* "deferred by owner decision — §5's poll-margin note says what that costs"; as of 2026-09-16 (§1's fifth correction) the decision is **made**, not deferred — ADR-0007 (#112) costed the RLS widening, declined Realtime for margin, ratified the 4 s poll floor as the cross-device posture, and §5's list is now empty — and note that this pass's retirement is stronger than a ship: **body-measurement import never became a feature because there was nothing to import**, F-1's whole-estate sweep found zero `setItem('userStats')` writers, and the settings apology that motivated the entry was factually wrong about the key's contents What does exist now: the full UI — dashboard, runner, history, progress, settings — with its measured claims in `docs/releases/2026-09-12-m3-exit-report-and-m4-handoff.md` §1, a training week counted from completed-session rows (#108), the FMEA row's escape hatch — `GET /api/export/v1` ships the versioned archive (#110) — and a true offline shell whose cached documents are bounded by sign-out purge and keep-previous eviction (#111), and body measurements as a modeled feature — six ratified kinds in `lib/contracts/measurements.ts`, the `0008` table under four discrete RLS policies, a windowed API whose `MEASUREMENT_RANGE_CAP` is derived rather than round, a server-echo settings panel, and #110's reserved export slot filled in the same PR (#109, merged as PR #160). The legacy vanilla-JS app **no longer** runs beside the target stack: #103 (M4-14) deleted the estate on 2026-09-16 with F-1's zero-stranding evidence and #109's replacement shipped, `tests/e2e/legacy-parity.spec.ts` inverted from presence-guard to absence-guard, and the zero-JS `npm run build` sentence retired with its `vite.config.js` — the three legacy scripts now fail at startup, and their removal is M4-15's first act.

---

## 2. Milestone & Task Progress

### Milestone Roadmap

- [x] **Planning**: Spec written, six decisions resolved, ADRs recorded (Complete — 2026-09-08)
- [x] **M0**: De-risk spike — RLS enforcement proven through Drizzle (Complete — 2026-09-08, **gate lifted**)
- [/] **M1**: Contracts & Seams — code, contracts, seeds, RLS, auth, and RED baseline complete; production SMTP/delivery remains deferred under issue #16
- [x] **M2**: Core Domain Engine — issues #36–#42 all merged (PRs #43–#47, #51, #53). **Complete 2026-09-11.**
- [x] **M3**: Presentation — **Complete 2026-09-12.** Milestone #3 is **open=0 / closed=19**. M3-00…M3-09 merged 2026-09-11 as PRs #69, #71, #72, #74, #75, #79, #81, #83, #85; **#67 (M3-10, the verification gate) merged as PR #86 (`8704c19`, 2026-09-11T19:23Z)**, and the milestone's last open child, **#73 (`SessionStateSchema`), merged as PR #87 (`2d5edfb`, 2026-09-12T02:00Z)** — so the milestone closed with nothing parked under it. The gate's own verdict: seven goals measured, two documented misses kept rather than relabelled, and every gate in the suite watched to fail (audit entries 9–19).
- [ ] **M4**: Hardening, telemetry, decommission the legacy static app (**Next milestone** — **the handoff is already written**: `docs/releases/2026-09-12-m3-exit-report-and-m4-handoff.md`; start at §7 item 22). **Wave 0 started:** #89 (M4-00, the D4 migration-authorship gate) is decided and implemented — ADR-0006, hand-authored model, auth-FK cascade shipped as migration `0007` — on `feat/m4-089-migration-authorship` (PR open); the 25-card breakdown is `docs/tasks/m4/`. **Board as of 2026-09-21 (after the release pass filed its cards): open=14 / closed=26 of 40** (`gh api …/milestones/4`) — the three release blockers became **#174** (startup env validation, B4), **#175** (production seed verification, B5) and **#176** (Deployment Protection decision, B1, `priority/p0`), and the health endpoint's card **#173** was filed and closed on already-shipped evidence. The **#164 chain is closed end-to-end** (spike #166 → slice A #169 → slice B #172, with #164/#167/#168 all `CLOSED / COMPLETED`), and **#16 is still the only owner-blocked card**.

### Completed Milestone Task Breakdown (M0)

`[x]` Done · `[/]` In Progress · `[ ]` Queued · `[!]` Blocked

- [x] `M0-00`: Node runtime ≥ 20.9 available — resolved 2026-09-08, see §5
- [x] `M0-01`: `app_authenticated` role created `LOGIN NOBYPASSRLS NOSUPERUSER NOINHERIT`, owns nothing. Attributes asserted by test, since migrations cannot re-force them (A1.4)
- [x] `M0-02`: Two tables, eight policies, `ENABLE` + `FORCE ROW LEVEL SECURITY` on both
- [x] `M0-03`: Two real GoTrue users seeded; cross-user read, update and delete return zero through Drizzle, cross-user insert rejected `42501`
- [x] `M0-04`: `current_user = 'app_authenticated'` asserted; owner connection shown to read everything despite `FORCE`, which is the trap this closes
- [x] `M0-05`: Drift check written and proven against a deliberately unprotected table. Widened past `rowsecurity = false` to also catch zero-policy tables and `FOR ALL`
- [x] `M0-06`: No leak with `is_local = true`, direct and through supavisor transaction pooling. The `false` variant run first as a negative control and shown to leak
- [x] `M0-07`: Write-up at `docs/spikes/2026-09-08-drizzle-rls-enforcement.md`
- [x] `M0-08` (added mid-spike): mutation check — each control removed in turn, suite required to go red

**M0 exit criteria: met.** 32 assertions green, `npm run mutate` catches all three
mutations, ADR-0003 confirmed rather than reopened. Amendment A1 records the five
corrections; none of them changed the decision.

### Active Milestone Task Breakdown (M1)

Filed 2026-09-08 as GitHub issues #3–#18 under milestone `M1: Contracts & Seams`.
Full specs with Gherkin acceptance criteria: `docs/tasks/2026-09-08-m1-contracts-seams-tasks.md`
and the 16 files in `docs/tasks/m1/`. M1 implementation is active; remaining work is
estimated at ~20h plus external SMTP setup.

- [x] `#3` `M1-01`: Next.js 16 + React 19 + TS strict scaffold (`#priority/p0`) — **done**, PR [#22](https://github.com/lowqualityloey/ppl-fitness-tracker/pull/22) merged, issue closed. Re-verified on `main` with `npm ci` — typecheck, lint, build, test, legacy regression, audit all clean.
- [x] `#4` `M1-02`: Supabase project + `DATABASE_URL`/`MIGRATION_DATABASE_URL` split (`#priority/p0`) — **done**, PR [#23](https://github.com/lowqualityloey/ppl-fitness-tracker/pull/23) merged, issue closed.
- [x] `#5` `M1-03`: Drizzle schema, all 9 tables + initial migration (`#priority/p0`) — **done**, PRs [#24](https://github.com/lowqualityloey/ppl-fitness-tracker/pull/24)/[#26](https://github.com/lowqualityloey/ppl-fitness-tracker/pull/26) merged, issue closed.
- [x] `#6` `M1-04`: `app_authenticated` role + `handle_new_user` trigger (`#priority/p0`) — **done**, PR [#25](https://github.com/lowqualityloey/ppl-fitness-tracker/pull/25) merged. Verified by `tests/integration/app-role.test.ts` + `handle-new-user-trigger.test.ts` on `main`. Issue closed retroactively 2026-09-08 — the PR didn't reference it, so it sat open past the actual merge.
- [x] `#7` `M1-05`: RLS on content tables (`#priority/p0`) — **done**, PR [#27](https://github.com/lowqualityloey/ppl-fitness-tracker/pull/27) merged. Verified by `tests/integration/rls-content-tables.test.ts` on `main`. Issue closed retroactively, same gap as `#6`.
- [x] `#8` `M1-06`: RLS on user-data tables, 4 policies each (`#priority/p0`) — **done**, PR [#30](https://github.com/lowqualityloey/ppl-fitness-tracker/pull/30) merged, issue closed. `tests/integration/rls-user-data-tables.test.ts` now uses real GoTrue password-grant users and the non-owner `app_authenticated` role with hardened transaction-local claims. It verifies RLS/FORCE, four app-role DML policies and grants for all seven user-data tables; owner CRUD; cross-user read/update/delete filtering; rejected cross-user insert/reparent/rekey attempts; and rejected owner-to-other-user reassignment (`WITH CHECK`) while proving the original rows remain intact. CI green (87 tests).
- [x] `#9` `M1-07`: schema-drift merge gate, ported + widened (`#priority/p0`) — **done**. Landed as part of #28's stacked branch chain rather than its own PR (branches were built on top of each other, not off `main`). Verified by `tests/integration/schema-drift.test.ts` on `main`, 6/6 passing. Issue closed retroactively.
- [x] `#10` `M1-08`: tenancy integration gate, ported + widened (`#priority/p0`) — **done**. Same stacked-branch situation as `#9`. Verified by `tests/integration/tenancy.test.ts` on `main`, 34/34 passing. Issue closed retroactively.
- [x] `#11` `M1-09`: seed 18 exercises from legacy app (`#priority/p1`) — **done**, PR [#34](https://github.com/lowqualityloey/ppl-fitness-tracker/pull/34) merged; idempotent system seed and focused regression coverage are on `main`.
- [x] `#12` `M1-10`: seed 13 unique stretches, dual-day association (`#priority/p2`) — **done**, PR [#35](https://github.com/lowqualityloey/ppl-fitness-tracker/pull/35) merged; 15 placements, shared Child's Pose/Cat-Cow IDs, phase-aware ordering, and combined-seed coverage are on `main`.
- [x] `#13` `M1-11`: `withUser()` helper, two-GUC hardened (`#priority/p0`) — **done**, PR [#28](https://github.com/lowqualityloey/ppl-fitness-tracker/pull/28) merged, issue closed. `lib/db/with-user.ts` + `tests/unit/with-user.test.ts` (6 assertions, GUC-only, no table grants needed) on `main`. Also fixed along the way: CI Supabase-CLI install, a pooler-vs-direct port mismatch in `MIGRATION_DATABASE_URL`, and a genuine test-isolation race (`vitest.config.ts` now sets `fileParallelism: false` — integration tests share fixture rows across files and were flaking under parallel workers).
- [x] `#14` `M1-12`: Supabase SSR middleware + `requireUser()` (`#priority/p0`) — **done**, PR [#29](https://github.com/lowqualityloey/ppl-fitness-tracker/pull/29) merged, issue closed. Added pinned `@supabase/ssr`/`@supabase/supabase-js`, `lib/supabase/server.ts`, `src/middleware.ts`, and `lib/auth/require-user.ts`; `requireUser()` resolves identity only via verified `auth.getUser()` and returns a typed 401 error without a session. `tests/integration/require-user.test.ts` verifies real GoTrue sign-in/cookie round-trip, no-session 401, and spoofed-body identity is ignored. CI Node bumped from 20 to 24 because Supabase JS's bundled realtime client needs native `WebSocket` even when unused; all checks green.
- [x] `#15` `M1-13`: magic-link sign-in + `/auth/confirm` redirect allowlist (`#priority/p0`) — **done**, PR [#31](https://github.com/lowqualityloey/ppl-fitness-tracker/pull/31) merged, issue closed. Added an email-only `/sign-in` form, `POST /auth/signin`, and `GET /auth/confirm`. The callback validates `token_hash`/`type=email` with Zod, delegates session-cookie persistence to the M1-12 Supabase SSR client, and normalizes `next` through a fixed internal allowlist (currently `/` only). Sign-in responses are generic to avoid account enumeration; a process-local sliding-window limiter returns typed 429 responses, with shared storage required before horizontal production scale. Local GoTrue now targets the Next app on port 3001 and uses the per-request redirect target in its magic-link template. Added real GoTrue token-hash → SSR-cookie → `requireUser()` integration coverage plus redirect/limiter tests. CI green; local final run 11 files / 91 tests and `next build` passed.
- [ ] `#16` `M1-14`: custom SMTP + hourly synthetic monitor (`#priority/p0`) — needs an external provider account and DNS, cannot be picked up cold
- [x] `#17` `M1-15`: Zod contracts + `AppError` envelope (`#priority/p1`) — **done**, PR [#32](https://github.com/lowqualityloey/ppl-fitness-tracker/pull/32) merged, issue closed. Added the canonical envelope and route contracts for auth, sync, sessions, exercises, progress, and legacy import; retained M1-13 compatibility exports and verified targeted contracts/typecheck before merge.
- [x] `#18` `M1-16`: failing route-handler tests, RED, all 9 endpoints (`#priority/p1`) — **baseline complete and merged**, PR [#33](https://github.com/lowqualityloey/ppl-fitness-tracker/pull/33); 22 expected missing-handler failures plus the existing `/auth/confirm` pass are recorded in `docs/tasks/m1-red-baseline.txt`. M2 owns turning the route tests green.

**M1 exit criteria:** code/schema/RLS/auth/contracts and the route RED baseline are complete and merged. The production-release portion remains blocked by issue #16: custom SMTP, verified domain, SPF/DKIM, and real delivery monitoring.

### M2 Checkpoint — M2-00 Foundation, M2-01 Sessions API, M2-02 SessionEngine, M2-03 ProgressionEngine & M2-04 Sync

Formalized 2026-09-08 in `docs/specs/2026-09-08-m2-core-domain-engine.md` with atomic task files under `docs/tasks/m2/`. Filed under GitHub milestone `M2: Core Domain Engine` as issues **#36–#42**; these are the canonical tracking numbers:

- [x] `#36` `M2-00`: runtime `DATABASE_URL` Drizzle client, shared DB/transaction types, verified auth-to-RLS context, session domain types/mappers, and user-scoped `WorkoutRepository` — implemented and committed in [223e2b8](https://github.com/lowqualityloey/ppl-fitness-tracker/commit/223e2b8); repository race/cursor/DSN review gates passed.
- [x] `#37` `M2-01`: deterministic API fixtures and `/api/sessions` route handlers wired to the repository — implemented and validated with 12 focused API integration tests plus five route-error unit assertions using owner-seeded data, tenant-qualified app-role RLS, authentication/validation errors, idempotent starts, pagination, mapped child state, and cross-user isolation.
- [x] `#38` `M2-02`: `SessionEngine` lifecycle, phase gates, set/task mutations, terminal-state protection, and rollback-safe repository transactions — implemented and validated with pure transition tests plus app-role repository integration coverage; true sequence/device sync remains deferred to #39.
- [x] `#41` `M2-03`: `ProgressionEngine` Epley e1RM calculations and personal-record materialization — implemented with nullable/zero policy, edit-down recomputation, deterministic ties, app-role isolation, natural-key race handling, and rollback coverage; no schema migration or progress route introduced.
- [x] `#39` `M2-04`: server-side sync transaction, mutation idempotency, per-session sequence/change model, deterministic clock/device conflict handling, and authenticated `/api/sync` — implementation complete on `feat/m2-04-sync-conflict-model`; final validation and issue-scoped PR are next. Rate limiting remains explicitly deferred to #42 and true `since` deltas remain deferred until a later response contract.
- [x] `#40` `M2-05`: `LegacyImporter` parsing, fingerprint idempotency, archive flow, and import report — merged as PR #51. Per-key parsing with sibling isolation, content-addressed fingerprint replay, one-transaction archived-session writes, and an explicit loss report. "Archive flow" landed as **server-side non-destruction**: the endpoint has no delete path at all, and moving or clearing the user's original keys stays the client's step after it shows the report, which is the UI half queued in #42.
- [x] `#42` `M2-06`: all M1 route-handler tests green, performance/security gates, and M2 integration hardening — merged as **PR #53**. `POST /auth/signout`, `GET /api/exercises`, and `GET /api/progress/:exerciseSlug` shipped; the 120/min sync budget became an enforced control; batch-bound / duplicate-landing / latency gates added; the declared-pending registry was retired with its anti-rot guard because no route is pending any more. `test:api` is now 7 files / 40 passed / 0 skipped.

**M3 slices — planned, grilled, and decomposed 2026-09-11** (`docs/tasks/m3/`, milestone #3, issues #57–#67). First implementation slice (#57 + #58) merged as **PR #69**.

- [x] `#57` `M3-00`: profile endpoints + session prefill reads (p1) — **done**, merged as **PR #69** (`8d2b696`), CI green, issue closed. `GET`/`PATCH /api/profile` and `GET /api/sessions/prefill` ship with 14 route specs; the contract's guessed `z.enum(['kg','lb'])` was corrected to the real DB enum `('kg','lbs')` en route — see §4 item 24. Index decision made on measured `EXPLAIN (ANALYZE, BUFFERS)` evidence: **no new index** (plans in the PR description).
- [x] `#58` `M3-01`: real `since` deltas on session detail — hard prerequisite of the poller (p1) — **done** on the same PR. The `since` discard and its false "M2-04 owns true deltas" comment are gone (contract-graph guard now forbids their return); `since === server_seq` answers `{notModified,serverSeq}` with no body — measured **53 B vs 2 035 B** full (~38×) — and every detail response is now `no-store`, the inherited gap fixed while this work was in the file. The M3-05 poller's hard prerequisite is now a shipped control.
- [x] `#59` `M3-02`: Tailwind/shadcn foundation + contrast-gated tokens, incl. the `--accent-pull` failure fix (p0) — **merged as PR #71 (`3b0ffbf`)**. `--accent-pull` redefined by measurement: `#c2410c` (5.18:1 white / 4.96:1 page) replaces `#fb6514` (3.01/2.88 — fails both bars), which survives as decorative-only `--accent-pull-bright`; `--accent-legs #7a3ff2` ships as the documented DESIGN.md extension. The gate is `scripts/check-contrast.ts` reading the hexes **out of `globals.css`** (26 measured pairs then, **35 as of M3-10**, all pass) with the regression to 2.88:1 kept failing permanently as a spec'd negative control — Scenario 2 observed red, then green at the real value. Day accents are structurally confined to `badge.tsx` + border utilities; `#ecf3ff` and `outline-none` are banned by test, not by promise.
- [x] `#60` `M3-03`: Playwright + axe harness with a deliberately-failing control first — **merged as PR #72 (`9f98f83`)**: 9 specs green against the production build, the axe control observed firing, the first prod-mode latency numbers taken (p0, closes D7). Grown by every slice since: **13 spec files / 61 tests**.
- [x] `#61` `M3-04`: dashboard `/` (p1) — **merged as PR #74 (`33d1eb7`)**: server-aggregated day cards, keyboard-reachable start, `/session/[id]` as a read-only target, `/` flipped to an interactive route in the a11y gate. It also closed a gap it inherited by surfacing it: the Lighthouse gate had been printing a score for `/` while auditing the page `/` redirects to.
- [x] `#62` `M3-05`: durable IndexedDB outbox + reconciliation (p0) — **merged as PR #75 (`df6db14`)** — — **implemented on `feat/m3-05-outbox`: `Outbox` over an injected storage seam, pure `reconcile`/`projectPending`, `SyncEngine` with the single-in-flight guard, jittered backoff that gates sends, and rejection → full refetch. 37 unit tests on the §4.3 invariants. **Nothing user-reachable yet**: no provider, no runner, no browser run of the IndexedDB adapter — all of that is #63.**
- [x] `#63` `M3-06`: session runner with optimistic tap and prefill (p0) — **merged as PR #79 (`5cf3b7e`)** —
- [x] `#64` `M3-07`: `TimerController` absolute deadlines, background-tab recovery (p1) — **merged as PR #81 (`0278634`)** —
- [x] `#65` `M3-08`: history + progress views on existing endpoints (p1) — **merged as PR #83 (`0adf233`)** —
- [x] `#66` `M3-09`: settings, `UnitDisplay`, legacy-import report surfaced in full (p1) — **merged as PR #85 (`6420e5a`)**
- [x] `#67` `M3-10`: M3 verification gate — **MERGED as PR #86 (`8704c19`, 2026-09-11T19:23Z)**, issue closed; exit report and M4 handoff written; see §7 item 21 for what it proved. `main`'s own `test` check is `success` on that merge commit.
- [x] `#73` *(filed by #61 under milestone #3, not a slice card)*: `SessionStateSchema` was a `z.object({}).passthrough()` placeholder — **MERGED as PR #87 (`2d5edfb`, 2026-09-12T02:00Z)**, issue closed; it was the last open child under the milestone, so M3 closed with nothing parked under it. Its two disclosed limits are carried into M4 at §7 item 22.

**Process note, so this stops recurring**: issues `#6`, `#7`, `#9`, `#10` were done on `main` well before they were closed, because the branches that shipped them were stacked on each other instead of on `main`, and none of the PR bodies said "Closes #N". Going forward: branch from `main`, not from a feature branch, unless there's a real dependency; and every PR body must name the issue it closes.

**Implementation notes from `#3` worth carrying into later M1 tasks:**
- Target stack runs on **port 3001** (`npm run next:dev`/`next:build`/`next:start`),
  not 3000 — the legacy Vite server keeps 3000. Both coexist; verified running
  simultaneously with no collision.
- `npm run typecheck` runs `next typegen` before `tsc --noEmit`. A bare `tsc`
  invocation fails on a fresh checkout (`Cannot find name 'LayoutProps'`) because
  that type is generated into `.next/types` and doesn't exist until Next.js has
  run once. Anyone scripting CI around this repo needs the wrapped command, not
  the bare one.
- `create-next-app`'s own dependency set carried 3 `npm audit` findings (moderate
  esbuild dev-server exposure, high Rollup path-traversal, critical Vitest
  UI-server RCE) — none runtime-reachable, but `vite` was bumped to `^7` and
  `vitest` to `^5` to close them outright rather than leave a critical advisory
  sitting in a fresh scaffold.
- **`#4` found a wrong assumption in its own spec.** Connecting as
  `app_authenticated` before that role exists (`M1-04`) fails with "password
  authentication failed," not "role does not exist" — Postgres checks the
  password before revealing role existence, as an enumeration defense. Fixed
  in the task file; the underlying negative case (role genuinely absent,
  confirmed via `pg_roles`) still holds.
- **`DATABASE_URL` routes through the pooler (port 54329) by design**, not the
  direct connection (54322) — matches how the app connects in production.
  `MIGRATION_DATABASE_URL` connects directly as the owner role. Both fail to
  authenticate as the app role right now, which is expected until `M1-04`.

### Open decisions inside M1, deliberately left to the implementer

- **`#11`** — legacy push/legs give rest as a range (`"60-90s"`), pull-day as an integer (`90`). Whether the schema stores a text range or a point estimate is a real choice, called out in the issue rather than guessed.
- **`#7`** — whether `routine_days` needs owner-scoped policies at all, given v1 has no user-created routine days.
- **`#5`** — `session_tasks`, `personal_records`, `import_batches`, `routine_days`, `routine_exercises` are specified in the issue, not the spec. Review that design before building on it.

---

## 3. Active Working Set

- **Target Workspace / Package**: N/A (standalone repo)
- **Active RFC / Spec**: `docs/specs/2026-09-08-spec-fullstack-migration.md`
- **Active Task Spec**: `docs/specs/2026-09-11-spec-m3-presentation.md` (M3 — grilled, §8 amendments binding; §8.7 added by the #57 implementation), decomposed into `docs/tasks/m3/README.md` with eleven slice cards `M3-00`…`M3-10` published as issues #57–#67 under milestone #3. **#57–#67 are all merged (PRs #69–#86) and the milestone's extra child #73 merged as PR #87: M3 is complete, open=0 / closed=19.** There is no active M3 spec; **the next spec to write is M4's**, from `docs/releases/2026-09-12-m3-exit-report-and-m4-handoff.md`. The completed M2 record is `docs/specs/2026-09-08-m2-core-domain-engine.md` with `docs/tasks/m2/`.
- **M4-27 slice A surface, as built and merged** (PR #169 → `de68db5`, 2026-09-16): `lib/repositories/workout-repository.ts` — `upsertSet`/`completeTask` patch `state.current` **in memory** from the write's own `.returning()` row instead of calling `refreshState()` (a full-session graph re-read 60× per batch), with comparators mirroring `mapSessionInTx`'s exact `ORDER BY` (task order is the pgEnum **label** order `warm_up < main_workout < stretch`, not alphabetical); `materializePersonalRecord` moved to a **loop-end flush, once per distinct touched exercise, inside the same transaction** so `ProgressionValidationError` still aborts all-or-nothing; `advancePhase`/`finish` keep the full refresh because lifecycle assertions read `status`/`phase`. Its AC control is `tests/unit/repository/workout-repository.test.ts` (in-memory patch vs a fresh read). Third commit: `src/app/state/outbox.ts` **serializes outbox appends** so `seq` follows tap order, with `tests/unit/state/{fixtures,outbox}.test.ts` teaching `MemoryStorage.list` to break `seq` ties by `mutationId` the way IndexedDB's `bySessionSeq` does. Evidence: `docs/perf/2026-09-16-m4-91-batch-contention.md` §"M4-27 slice A" (paired same-day legs, contended p50 −21.0 % / p95 −39.9 %). **Superseded, then retired 2026-09-21:** the PromptKit v1.8.0 engine sync this bullet described as "unmerged and in flight" **landed as its own PR #170** (`chore(promptkit)`), and `perf/m4-27-slice-a`'s leftover commits were content-identical to `de68db5` — nothing is in flight on that branch, and #167 is closed. The claim is kept in corrected form only so the next session does not go looking for that PR again.
- **M4-28 slice B surface, as merged** (PR #172 → `8ae6f8c`, 2026-09-21): `lib/repositories/workout-repository.ts` — `syncStore()` prefetches the batch's reservations in three statements (`SELECT … IN`, one bulk `INSERT … ON CONFLICT DO NOTHING RETURNING`, and a re-read only of what conflicted, which is what still separates `existing` from `foreign`), prefetches the session's whole version partition plus the set/task fallbacks for keys it cannot describe (one read each, replacing one point read and up to two fallbacks per mutation), and caches `findEntityVersion` answers that `upsertEntityVersion` writes through — so a later mutation in the same batch still compares against the version an earlier one wrote. The tail is buffered and settled once in `flushTail()`: an **exact** `serverSeq` claim (`server_seq + allocated`, safe because the transaction holds the session row `FOR UPDATE`), a bulk version upsert **deduped by entity key** (Postgres refuses `ON CONFLICT DO UPDATE` that touches one row twice), a bulk change insert in application order, and one `UPDATE … FROM (VALUES …)` stamping `applied` with each mutation's own seq — behind an unbalanced-ledger guard that throws rather than half-flushing. **`SyncStore` and `SyncEngine.apply` are byte-identical**; the seven-branch decision evidence lives in the *prefetch*, not the domain loop. Its AC control is the legacy-backfill case in `tests/integration/repository/workout-repository.test.ts`, which went red on the real bug found mid-run (the set-fallback loop cached under the slot key `exerciseId:setIndex` instead of the cache key `type|entityKey`, so every engine question missed and a stale write applied). Evidence: `docs/perf/2026-09-16-m4-91-batch-contention.md` §"M4-28 slice B" (paired same-day legs, contended p50 −76.6 % / p95 −71.7 %); review `docs/reviews/2026-09-21-m4-28-slice-b-batch-fan-out.md`.  **Active working set is now empty** — no branch, no uncommitted code; the next work is chosen from §7 item 45.
- **M4-30 health surface, as implemented** (uncommitted, 2026-09-21): `GET /api/health` — the release probe
  that B3 was missing. `lib/contracts/health.ts` owns the shape (`HealthDbSchema` + `HealthResponseDataSchema`,
  both `.strict()`, the envelope built by `createAppEnvelopeSchema`), so the route stays a thin adapter as
  `contract-graph.test.ts` requires. `src/app/api/health/route.ts` is `export const GET = loggedRoute(handleGet)`,
  pings through the **same `getDb()` pool every other route uses** (`SELECT 1`) and reports the measured
  `latencyMs` rather than a hardcoded literal — a route that hardcodes 200 only proves `next start` is running,
  which the platform already knows. **`no-store` on both the 200 and the 503**: a cached green light has no
  witness behind it, and a cached *failure* is the mirror trap. **No auth check**, deliberately and for a sharper
  reason than `/api/exercises` has one: a probe that needs a session cannot report on a broken auth path — it
  fails for the same reason production does. The 503 branch does **not** reach the error sink, because a database
  outage is the condition the route exists to describe, not a defect. Two named residuals
  (`docs/tasks/m4/M4-30-health-endpoint.md`): the **503 path has no executed control** (forcing it needs a second
  server boot against a bad DSN; the harness shares one `next dev`), and the probe **pays a GoTrue auth hop**
  because `src/middleware.ts` refreshes the session on every matched path — folding health out of the matcher would
  skip the CSP seam, which is why it was left alone.
- **M4-31 environment-validation surface, as implemented** (uncommitted, 2026-09-21): `lib/env/server.ts` —
  `ServerEnvSchema` + `EnvValidationError` + a **pure** `assertServerEnv(raw)`. The required set was **derived from
  a census of every `process.env` read in `lib/` and `src/`**, not guessed: `DATABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL` are required; `SENTRY_DSN`,
  `NEXT_PUBLIC_SENTRY_DSN`, the two release names and `LOG_LEVEL` stay optional by design, and
  **`MIGRATION_DATABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are deliberately not required** — demanding either would
  break the deploy. `z.object` (not `.strict()`) because the input is all of `process.env`; undeclared keys are
  stripped, which is what makes "the service-role key cannot appear in the result" true by construction. The
  failure message is built from the variable **name** plus a reason keyed off `issue.code` — **never** from
  `issue.message` and never from the value, so a boot crash cannot become a credential leak into whatever log
  platform collected it. `src/instrumentation.ts` calls it on the Node runtime and then `process.exit(1)`;
  `NEXT_PHASE === 'phase-production-build'` is excluded so a fresh clone's first `npm run build` still works.
  **`lib/db/client.ts` was deliberately left untouched** despite the issue body listing it — it already throws
  naming `DATABASE_URL`, and `tests/unit/db/client.test.ts` asserts that throw by manipulating `process.env`, which
  a cached parse would break.
- **M3-00/M3-01 surface, as built** (merged PR #69): `lib/repositories/profile-repository.ts` (ADR-0003-compliant, no conversion anywhere — ADR-0005), `src/app/api/profile/route.ts` (GET/PATCH, `no-store` incl. 404 via `appErrorResponse`'s new optional headers), `src/app/api/sessions/prefill/route.ts` + `WorkoutRepository.getPrefill` (`('completed','archived')` source, `desc(localDate), desc(id)`, both-null omitted, `excludeSessionId`), `WorkoutRepository.getSessionServerSeq` + the delta short-circuit in `src/app/api/sessions/[id]/route.ts` (seq read **before** `findSession`, user-scoped, stale comment deleted), `lib/contracts/profile.ts` enum corrected to the DB literal `('kg','lbs')`, specs `tests/integration/api/{profile,prefill,session-deltas}.test.ts` + `tests/unit/api/contract-graph.test.ts` (routes-as-adapters guard; bans local `z.` shapes and the deleted comment's return), plus the new blocks in `contracts.test.ts`. The M3 spec carries the §4.1 erratum and §8.7. No migration shipped — the index decision is on measured `EXPLAIN` evidence (PR #69 §4). D6 (`next dev` rewriting `tsconfig.json`) fired twice during the work and was reverted twice — it remains open.
- **M2-05 surface, as built**: `lib/domain/import/legacy-importer.ts` (pure parse→plan:
  per-key isolation, `legacySlotToOrderIndex` as the single 1-based→0-based seam,
  `stripCollapsedCheckboxKey` for the pull-day sentinel, evidence rules that refuse to mint a
  session from a page visit), `lib/domain/import/legacy-import-service.ts` (`LegacyImporter` +
  replay-before-write ordering), `lib/domain/import/types.ts` (`LegacyImportStore` port + the two
  error classes), `lib/repositories/legacy-import-repository.ts` (one transaction: day resolution →
  archived sessions → sets → `import_batches`, `client_id` derived from the fingerprint so a racing
  twin collides), `src/app/api/import/legacy/route.ts` (thin adapter), `lib/auth/rate-limit.ts`
  (`legacyImportRateLimiter`, 5/hour keyed by user id), `lib/http/route-error.ts`
  (`LegacyImportValidationError` → 400). `lib/contracts/import.ts` is unchanged except that real
  payloads now get their collapsed key stripped before it reaches `BooleanMapSchema` — the contract
  itself was left strict on purpose, since rejecting a `""` key is right for every *other* map.
  `db/schema` and migrations: untouched, no `db:generate` ran.
- **Merged M2 surface, for orientation**: `lib/domain/sessions/` (transition table + mappers), `lib/domain/progression/` (Epley e1RM + PR recomputation), `lib/domain/sync/` (reducer, `types.ts`), `lib/domain/import/` (legacy planner, `LegacyImporter`, `LegacyImportStore` port), `lib/http/route-error.ts`, `src/app/api/{sessions,sessions/[id],sync,import/legacy}`, migrations `0004`–`0006`. Every route handler above has specs that run in CI, and so do the three that used to be missing: `#42` shipped `POST /auth/signout`, `GET /api/exercises` and `GET /api/progress/:exerciseSlug`, which **retired `tests/integration/api/pending-handlers.ts` and its anti-rot guard** — there are no declared-pending skips on `main` (see D5, closed). M3 added `src/app/api/{profile,sessions/prefill}` on top.
- **Spike sandbox — throwaway, delete once M1's integration suite covers the same ground**:
  - `spikes/m0-drizzle-rls/sql/001-setup.sql` — role, tables, 8 policies, `handle_new_user`. Comments record the measured surprises. **Creates `unprotected_future_table` on purpose**; do not copy it.
  - `spikes/m0-drizzle-rls/src/db.ts` — `withUserHardened()` is the version M1 must adopt. `withUserLeaky()` is a negative control, never to be imported.
  - `spikes/m0-drizzle-rls/tests/` — 5 files, 32 assertions
  - `spikes/m0-drizzle-rls/scripts/mutation-check.ts` — proves the suite can fail
  - `spikes/m0-drizzle-rls/scripts/bench.ts` — the ADR-0003 cost measurement
- **Legacy files that M1 read as input** — **deleted by #103 (M4-14) on 2026-09-16; historical pointers, resolvable only in git history before `bd22a75`**. The seed content they carried lives in `db/seed/` (M1-09/10), the parse rules in `lib/domain/import/legacy-importer.ts`, and the absence guard is inverted: `tests/e2e/legacy-parity.spec.ts` now fails if these paths reappear as tracked files.
  - `push-day-workout/index.html` — 6 exercises, 17 set checkboxes, 5 stretches, hardcoded
  - `legs-day-workout/index.html` — same shape
  - `pull-day-workout/app.js:47-223` — the only module with structured exercise/stretch data arrays
- **Verification Commands** (current baseline re-measured 2026-09-15 **on merged `main` (`01a9816`)**, stack up; all must run inside WSL).
  This pass ran `typecheck` (**0 errors**), `lint` (**exit 0** under `--max-warnings=0`), `npm run test`
  (**58 files / 547 tests**) and `next:build` (clean, every route `ƒ`) on the merged tree. `test:api`
  (**11 / 65**) and the e2e battery (**66/66**, minus `lighthouse.spec.ts`, which this box could not launch —
  #149's open defect, since closed by the spec's move to Lighthouse's Node API) were measured on the branch at
  `d0e2897`, whose content is exactly what merged, and CI then ran the whole battery *including* Lighthouse on
  `01a9816`: **`test` pass, 13m54s, 0 failing steps**. **As of #149 the gap above is gone:**
  `npx playwright test lighthouse.spec.ts` runs here — **4/4, all four routes at 100** — and
  `lighthouse + csp + a11y` measured **15/15 in 1.3 min** on `test/m4-25-lighthouse-node-api`, still needing
  `LD_LIBRARY_PATH` (§1's machine facts) because that part is a browser defect, not a launcher one. The older
  SHAs below are the dates they were measured and stay, because they are evidence rather than decoration:
  - Target dev: `npm run next:dev` (3001). The legacy Vite dev server on 3000 is gone with #103; the coexistence note is retired.
  - `npm run typecheck` → **exit 0, clean** (`next typegen && tsc --noEmit`; never run bare `tsc`).
  - `npm run lint` → **exit 0**, 0 errors / 0 warnings, re-verified on merged `main`. It was
    exit 1 (24 errors + 2 warnings) until D1; the step now runs **in CI directly after `npm ci`**
    and the script is `eslint --max-warnings=0 .`, so warnings fail too. Reintroducing an `any`
    is a build break, not a style opinion. See D1 (closed).
  - `npx vitest run tests/unit` fails **offline by construction**, not because the code is wrong: all
    the failures are `tests/unit/with-user.test.ts` reaching real Postgres (`ECONNREFUSED :54322`) —
    6 of them, at intake, out of "67 passed / 6 failed". The layer has grown since (25 files / 276
    tests as of 2026-09-12), so treat the pass count as intake-era and the failure mode as current.
    See D2 (open).
  - Full gate, measured sequence that actually works (verified 2026-09-11 with the stack
    up): `npm run db:up` → `npm run test:api:preflight` → `npm run typecheck` →
    `npm test` → `npm run test:api` → `npm run test:mutation` → `npm run db:down`.
    Results, re-measured **on merged `main`** (`6043990`, the merge of #105's PR #116) with the stack
    up (2026-09-12), as one run of the sequence above: **`npm test` 42 files / 419 tests green**;
    **`test:api` 10 files / 61 passed / 0 skipped**; **Playwright 61 passed / 0 failed in 6.0 m at
    `--workers=1`**; preflight green; **`npm run test:mutation` exit 0**; `check-set-config.sh` exit
    0; lint **0 errors / 0 warnings**; typecheck exit 0. **Re-measured on `324d4b7`** (#100's merge, 2026-09-12, stack up, load 1.03 → 2.92 on `nproc=4`):
    **`npm test` 45 files / 430 tests**; **`test:api` 11 files / 64 passed / 0 skipped**; lint, typecheck and
    `check-set-config.sh` exit 0; preflight green. Playwright is **61 passed** at that merge, measured as five
    consecutive full batteries on `05a6b0d` — the code tip beneath it, everything above being markdown
    (`git diff --name-only 05a6b0d..HEAD` returned `docs/STATE.md` and the ledger alone).
    **Re-measured on `e26ecfa`** (#90's merge, 2026-09-13, stack up, load 1.05 at start): lint 0, typecheck 0,
    `check-set-config.sh` 0, **`npm test` 45 files / 430 tests**, **`test:api` 11 files / 64 passed / 0
    skipped** — unchanged, which is the expected result from a branch whose `src`/`lib` diff was 0 lines. **Re-measured on `eb11342`** (PR #129, #121's merge, 2026-09-13): CI `test` job **success** on merged `main` (lint 0 · typecheck 0 · `check-set-config.sh` 0 · preflight · `npm test` · `test:api` · `test:e2e` 61 passed); locally lint 0 · typecheck 0 · `check-set-config.sh` 0 · unit `latency-percentile.test.ts` **4/4** (the #121 control, watched failing on a deliberate breakage). The 50 ms paint-gate goal and the nearest-rank method are unchanged. **Re-measured on `2b1c37d`** (PR #131, #125's merge, 2026-09-13): CI `test` job **success** on merged `main` (lint 0 · typecheck 0 · `check-set-config.sh` 0 · preflight · `npm test` · `test:api` · `test:e2e` 61 passed); locally lint 0 · typecheck 0 · `check-set-config.sh` 0 · **`npm test` 46 files / 435 tests** (the require-user Scenario 4 control — a shed `getUser()` hop mapped to 503 `SERVICE_UNAVAILABLE`, watched failing on a deliberate 401 mapping — is green). No rate, budget or threshold moved. **Re-measured on `c0ba8f4`** (PR #133, #92's merge — plus PR #132, the #125 state sync — 2026-09-13): CI `test` job **success** on merged `main` (lint 0 · typecheck 0 · `check-set-config.sh` 0 · preflight · `npm test` · `test:api` · `test:e2e`); locally lint 0 · typecheck 0 · `check-set-config.sh` 0 · **`npm test` 46 files / 435 tests**; `playwright test sync-latency.spec.ts` **2 passed** (POST /api/sync p50 211.3 / p95 286.0 / max 594.4 ms inside the enforced 800 ms ceiling; verdict cites the measured ~203–413 ms band; no-auth GET baseline p95 15.0 ms). Milestone #4 now **open=24 / closed=7** (closing #92, which carries the milestone, moved the count). No rate, budget or threshold moved. **Re-measured on `51787a1`** (PR #135, #93's merge, 2026-09-13): CI `test` job **success** on merged `main`; locally `npm test` **46 files / 435 tests**; limiter integration specs **16/16** green (sync 120/min, import 5/hour). Milestone #4 now **open=23 / closed=8** (closing #93, which carries the milestone, moved the count). No rate, budget or threshold moved. **Re-measured on `6580296`** (PR #137, #96's merge, 2026-09-13): CI `test` job **success** on merged `main`; locally lint 0 · typecheck 0 · `npm test` **46 files / 435 tests**; `playwright test sync-latency.spec.ts` **2 passed** (POST /api/sync p95 354.1 ms inside the enforced 800 ms ceiling). Runner badge now shows outbox age alongside depth (`2 waiting to sync · oldest 5:00`); new E2E spec seeds an old entry via IndexedDB and asserts the age (local run blocked by missing `libnspr4.so`; CI will validate). Milestone #4 now **open=22 / closed=9** (closing #96, which carries the milestone, moved the count). No rate, budget or threshold moved. What
    #90 adds is the *existence* of a production-build instrument for the **200 ms @ 50 rps** `POST /api/sync`
    document: `npm run perf:sync`, manual and deliberately outside CI's merge gate. Its first merged-main
    measurement (`--users=3 --rps=4 --duration=20`, offered 4.0 = target, zero rejections) reads **p50 230.9 ms
    / p95 359.0 ms / max 441.8 ms over 81 accepted requests** — and it corrected a claim made on the branch
    (181.3 ms there, "inside the budget"), so the honest wording is that the typical request sits **at** the
    documented number, not under it, while p95 misses on both runs. Magnitudes across runs are not comparable:
    the tail guard fired on this one (`only 4 observation(s) above it`), which is the harness refusing to call
    a 4-sample headroom a percentile. **50 rps remains undeliverable on this 4-core box** (best offered 43.6
    rps at a 256 in-flight cap, verdict `INCONCLUSIVE`); no rate, budget or threshold was moved to improve any
    of these readings. Full record: `docs/perf/2026-09-12-m4-90-load-harness-design.md`.
    *The same block read 39 files / 398 tests
    and 60 API passes at `2d5edfb`, and 24 files / 217 tests plus 7 API files / 40 at `ce1c5d9` after
    PR #53; the growth is M3's exit work and #105's. The e2e line now carries its worker count
    because the number means nothing without it: the "61 passed (3.1 m)" written here before was
    `npx playwright test` at Playwright's default cap on this box, which has since produced reds on
    both shared-fixture collisions and timing gates — §5's #80 and §7 item 22's family, and
    PROMPTKIT §3 now says to pass `--workers=1`.*
    *Correction on the record, kept because it is a rule and not a receipt:* while #53 was open this block sat
    under a heading reading "on merged `main`" while carrying the branch's numbers. Same values, wrong
    warrant — the sentence was false until that merge, which is why re-measuring after merge is a step and
    not a formality, and it is why the numbers above were produced on this checkout rather than copied from
    PR #86's or PR #87's own evidence tables.
    `npm run test:mutation` has been run here, and note the gap it exposed: that script is bare `tsx
    scripts/mutation-check.ts` with **no `--env-file-if-exists`**, unlike the test scripts, so it
    aborts with `MIGRATION_DATABASE_URL environment variable required` unless `.env.local` is
    sourced by hand. Needs `DATABASE_URL` +
    `MIGRATION_DATABASE_URL` on the process env — the npm scripts pass
    `--env-file-if-exists=.env.local` so npm loads them itself; on `main` you must source
    `.env.local` first, or DB-backed files fail or silently skip.
  - `npm run test:red` is an alias for `npm run test:api` (kept so older notes still resolve),
    and **CI runs the API suites as their own step**, so `tests/integration/api/` is inside the
    merge gate. Nothing is declared-pending there any more — see D5 (closed).

  - Repository integration tests need a tenant-qualified local Supavisor URL on 54329
    (`app_authenticated.pooler-dev`); the direct app-role port 54322 also passes the suite.
    The app-role password literal lives in migration `0001` — `supabase status` does **not**
    report it, which is how `.env.example`'s placeholder quietly broke this checkout.
  - Spike, from `spikes/m0-drizzle-rls/`: `npm run db:up` → `npm run db:setup` → `npm test`
    (32 pass) → `npm run mutate` → `npm run db:down`. Superseded by the real M1 suite, kept
    for reference.
- **Known-broken (retired by deletion, and by #104's script removal — 2026-09-16)**: the legacy
  `npm run build` bullet in this section used to record "exits 0, writes 0 `.js` files, by
  design until M4" (re-verified 2026-09-11). #103 deleted the estate's entry points and
  `vite.config.js`, so `npm run dev`/`build`/`preview` were left failing at startup with nothing
  to build — the honest interim item 35 recorded. **#104 (M4-15) closed that interim**: the Vite
  scripts and the `vite` devDependency are gone, `preview` went with them, and `dev`/`build`/`start`
  are now the real Next commands on port 3001 (the card's port decision: stay — every e2e/CI/GoTrue
  config already pinned 3001). `tests/unit/infra/legacy-build-scripts.test.ts` keeps vite off every
  script path. Nothing user-facing ever depended on them and no gate ran them.
  The route-handler suites under `tests/integration/api/` are
  excluded from `npm test` **because they boot a real `next dev` server**, not because any
  handler is missing: every M1 route shipped its handler in `#42`, which retired
  `tests/integration/api/pending-handlers.ts` and its anti-rot guard, and **CI runs those 10
  files as their own step** (D5, closed). Nothing on `main` is declared-pending.
- **Side effect to watch**: running the API suite boots `next dev`, which **rewrites the
  tracked `tsconfig.json`** (appends a generated-types include and reformats arrays). Revert
  before committing — it is formatter noise, not your change. See D6.

- **Runner + client sync state (merged in #79):**
  - `src/app/state/`: `outbox.ts` (durable-before-ack queue, applied vs refused split, `lastSeq`
    so a tap costs O(1) reads instead of O(queue depth)), `indexeddb-outbox-storage.ts`
    (`meta` store at v2 carries the device id), `reconcile.ts` (plan-based projection, refusal
    labels), `sync-engine.ts` (batches, backoff, cadence budget, `snapshot()`), `device-identity.ts`,
    `provider.tsx` (engine lifetime, `/api/sync` mapping, polling + `online` drain).
  - `src/app/session/[id]/`: `page.tsx` is the server half (auth, scoped reads,
    `parseSessionView`, unit, prefill); `runner.tsx` is the writable screen. `src/components/ui/input.tsx`
    is vendored (no local focus classes — ADR-0004's ring is global; `h-11`; `rounded-md` → `--radius-input`).
  - `lib/domain/units.ts` gained `parseWeightToKg` / `parseReps`, the return trip for ADR-0005.
  - Gates measured on that slice's branch (`feat/m3-06-runner`), stack up: `lint` 0 / 0, `typecheck` 0, `check-set-config.sh` 0,
    `git diff --check` 0, `npx vitest run tests/unit` **199 passed (18 files)**,
    `tests/integration/api` + `security` **60 passed (10 files)**, `npx playwright test`
    **20 passed** (14 before this slice; the six new specs are `tests/e2e/session-runner.spec.ts`).
  - Two numbers printed by the suite, not asserted by it: tap-to-commit over 100 taps on a live
    connection `median 15.2–16.5 ms, p95 23.7–26.4 ms` (gate: p95 < 50 ms, enforced); `POST /api/sync`
    p50 200.5–258.1 / p95 364.5–413.9 ms against the documented 200 ms budget, still a **miss** (§5).

- **Timer surface (merged in #81):**
  - `src/app/state/timer-controller.ts` — absolute anchors only (`createCountdownTimer`,
    `createElapsedTimer`, `browserTimerClock`, `formatDuration`), `TimerClock` as the whole seam,
    completion fired once per anchor, the last repaint clamped to the deadline, and an overrun that
    keeps growing instead of freezing at `0:00`. `src/app/state/audio-cue.ts` — gesture-armed chime
    where silence is a supported state; `browserChime` keeps the synthesis.
  - The runner shows a `RestTimer` only while `phase === 'rest'` (mount *is* the cancellation) with
    90 s inherited from `push-day-workout/app.js:245`, `+15 s` and `Skip`, and a session clock under
    the subtitle that becomes a static length once `completedAt` exists. `SessionView` gained
    `startedAt` (non-null) and `completedAt`.
  - `role="timer"` with `aria-live="off"` for the digits; milestones (last ten seconds, finish once)
    go through `#63`'s polite region.
  - Gates on that slice's branch (`feat/m3-07-timers`): lint 0 / 0, typecheck 0, `next:build` 0, unit **219 passed (20 files)**,
    api + security **60 passed (10 files)**, Playwright **25 passed** (20 before #64), set-config and
    `git diff --check` clean. #63's tap gate still holds with the session clock repainting every
    second, because `paints a tap in under 50 ms` is one of the 25.

- **History and progress (merged in #83):**
  - `src/app/history/page.tsx` (cursor-paged log grouped by day, phase badges, `?cursor=` only —
    #82), `src/app/history/[id]/page.tsx` (a **server-rendered report**: no client island, because a
    finished session has nothing to sync and a receipt should not ship a mutation queue), and
    `src/app/progress/[exerciseSlug]/page.tsx` (trend + PRs + the same numbers as a table).
  - `lib/views/history-view.ts` (summary → view, `groupByDay`, `loadCoverage`) and
    `lib/views/progress-view.ts` (`buildChartGeometry`, `toDisplayPoints`, `summarizeTrendline`).
    The chart is **decorative SVG rendered on the server**, which deviates from the card's "the chart
    is the only client component" and ships 0 KB of JS for the screen.
  - Reads go through `WorkoutRepository.listSessions` / `findSession` and
    `ProgressRepository.getExerciseProgress` — the same functions the endpoints call. **No new
    server route was added.**
  - Gates on that slice's branch (`feat/m3-08-history-progress`): lint 0 / 0, typecheck 0, `next:build` 0, unit **243 passed (22 files)**,
    api + security **60 passed (10 files)**, Playwright **37 passed (2.2m)**, set-config and
    `git diff --check` clean. **Lighthouse accessibility on authenticated `/history`: 100** — the
    first authenticated audit, which #60's spec had deliberately left unbuilt.
- **M3-10 surface, as built** (merged as **PR #86, `8704c19`**, 2026-09-11T19:23Z): mostly a branch that
  *measured* — `9591fd4`/`f8a7242`/`7454585`/`7d17b87` added the production-build SLA specs, the
  keyboard-only + colour audits, the legacy-parity scan, and Lighthouse on `/` and `/session/[id]`.
  The break-each-gate pass then changed three products, each because an injection or an
  un-asked-for breach proved the old behaviour wrong: **`96b5202`** contrast gate follows `var()`
  indirection + measures the alias layer + unmeasurable values FAIL with a reason (never a crash)
  + two permanent negative controls; **`4ca87e5`** the G-M3-6 gate asserts the *word* carrier
  separately from the glyph (a differential text check is satisfiable by `○→✓` alone — measured,
  not theorized); **`9ca17cc`** `notifyConnectivityRestored()` clears the offline-grown backoff
  window on `online`, which is what G-M3-4's "miss" actually was. The evidence lives in
  `docs/tests/2026-09-11-m3-verification-audit.md` (entries 9–18 for this slice, entry 19 for what #73 then did to
  the same gates: nine captured breakages, two
  honest non-observations, one real defect, two recorded timing flakes, one reproduction
  sequence); the exit verdict and M4 scope live in
  `docs/releases/2026-09-12-m3-exit-report-and-m4-handoff.md`. Gates on #67's own final tree: lint 0/0,
  typecheck 0, unit 37 files/380, api+security 10/60, mutation exit 0, contrast 35/35,
  Playwright 61/0 on four consecutive final runs (one earlier post-fix run flaked a timing gate —
  recorded in audit 17, budgets unmoved), Lighthouse 100 ×4 on each. **Those are #67's numbers.**
  The tree moved under them when #73 merged as PR #87, so they are no longer the baseline: `main`
  measures 39 files / 398 unit tests now, with `test:api`, Playwright, lint, typecheck and
  mutation unchanged — see the bullet below and §3's Verification Commands. The last red this slice
  produced was its own parity gate failing on CI's shallow checkout — entry 18, fixed so CI really
  executes it (`f37813e`). `tsconfig.json` churned (D6) and is, as always,
  unstaged.
- **#73 surface, as merged** (PR #87, `2d5edfb`, 2026-09-12T02:00Z): `lib/contracts/sessions.ts`
  now carries the session graph — `.strict()` objects transcribed from what `mapSessionState`
  emits, with `ExerciseKindSchema` and `RoutineExercisePhaseSchema` added to
  `lib/contracts/common.ts` so no enum is hand-copied; `lib/views/session-view.ts` is a 47-line
  **re-export** of it (was 166 lines of a second opinion); and `validateOutgoing` in
  `lib/contracts/envelope.ts` throws a non-`ZodError` `ContractViolationError` from
  `POST /api/sessions`, the full-session branch of `GET /api/sessions/[id]`, and `POST /api/sync`,
  so a producer defect cannot be billed to a caller as a 400. New specs:
  `tests/unit/contracts/{session-state,outgoing-validation}.test.ts` plus growth in
  `contracts.test.ts`, `session-view.test.ts` and the routes-own-no-schemas guard.
  `tests/unit/state/fixtures.ts` had to grow, because it had been claiming to be *the server's view*
  of a session the server has never sent. **The two limits this bullet disclosed are closed by
  #105**, whose surface is the next bullet: `state` no longer exists on a sync response, and the
  e2e mock that invented it is built through the contract instead of beside it.

- **#105 surface, as built** (`feat/m4-105-drop-sync-response-state`): `SyncResponseData.state` is
  deleted — from `lib/contracts/sync.ts`, from the domain result that used to be
  `Omit<SyncResponseData,'state'> & { state: SessionState }` (`lib/domain/sync/types.ts`, now
  `SyncApplyResult = SyncResponseData`), and from the seam that existed only to fill it:
  `SyncStore.getState(): Promise<SessionState>` is `currentServerSeq(): Promise<number>`, so
  `lib/repositories/workout-repository.ts` reads one column of a row its transaction already holds
  `FOR UPDATE` instead of re-mapping sets, tasks, and the whole routine plan to throw the result
  away an arm's length from the response. `.strict()` is what makes the removal self-enforcing: a
  producer that still emitted `state` fails `validateOutgoing` with a redacted 500 rather than
  shipping a key the contract stopped describing. Specs were re-aimed, not deleted — the claims
  were about *stored* state, and stored state has one producer: three `SyncResponseSchema` cases in
  `contracts.test.ts` plus a new one pinning the answer to four keys and refusing `state` as an
  unknown key (in both the shape #73 shipped and the shape the mock invented);
  `tests/unit/domain/sync-engine.test.ts`'s fake store lost its
  `state = { serverSeq: 0 } as unknown as SessionState` cast and gained a counted key list;
  `tests/unit/state/sync-engine.test.ts` builds every `SendOutcome` through the contract and drains
  an old-format queue against the narrowed body; `tests/integration/api/sync.test.ts` asserts the
  four keys **on the bytes**, re-reads its two re-aimed assertions through `GET /api/sessions/[id]`,
  and POSTs a literal batch written the way the previous build's outbox writes one — 200, three
  applied, one refused by name. The e2e fabrication at `session-runner.spec.ts:174` is replaced by
  `tests/e2e/sync-fixtures.ts`, which `.parse`es every mock body through `SyncResponseDataSchema`
  at build time, with `tests/unit/contracts/sync-response-fixture.test.ts` injecting the original
  lie and requiring a throw — so the builder is a control that runs, not one that is described.
  Same change, same species of fiction: that mock's `reason: 'ILLEGAL_TRANSITION'` was also a
  string no server path emits, and now carries `CONFLICT`, which is what `rejectionReason` returns
  for a lifecycle refusal.

---

## 3A. Execution-Control Projection (Optional)

> This section is a synchronized projection for checkpoint continuity when the host project uses Controlled Work. The canonical authority remains `docs/tasks/2026-11-19-promptkit-v2-3-upgrade.md`; disagreement with that record is a validation failure and leaves execution blocked or `checkpoint_due` until reconciled.

- **Local Task Source**: `docs/tasks/2026-11-19-promptkit-v2-3-upgrade.md`
- **Task ID**: `TASK-promptkit-v2-3-upgrade`
- **Task Record**: `docs/tasks/2026-11-19-promptkit-v2-3-upgrade.md`
- **Ceremony Level**: `Level 2 (Controlled Work)`
- **Specification**: `docs/specs/2026-11-19-spec-promptkit-v2-3-upgrade.md`
- **Execution Scope**: `ppl-fitness-tracker, branch chore/promptkit-v2-sync, one worktree`
- **Execution State**: `in_progress`
- **Mapped `pk:tasks` Status**: `In Progress`
- **Active Task Pointer**: `TASK-promptkit-v2-3-upgrade`
- **Owner / Current Actor**: `Agent (DeepSeek Harness / lead)`
- **Start Time**: `2026-11-19 09:14 UTC`
- **Current Branch**: `chore/promptkit-v2-sync`
- **Current Revision**: `560ebde`
- **Checkpoint Policy**: `N/A - single session; host timer cannot mechanically enforce checkpoints or terminate the session.`
- **Blockers and Resume Condition**: `None`
- **Verification Status**: `2026-11-19: validate-execution-control.sh VALID, RECORDS=5; validate-references.sh exit 0; check-setup-assert.sh submodule OK after the gitlink commit; check-doctor.sh docs-drift OK with version STALE(+5) recorded as a definitional artifact of pinning the tag rather than origin/main.`
- **CI Evidence**: `N/A - no PR or CI run; local governance gates passed`
- **Changed-File Summary**: `AGENTS.md; CLAUDE.md; .opencode/rules.md; .clinerules/promptkit.md; .github/copilot-instructions.md; PROMPTKIT.md; docs/STATE.md; eslint.config.mjs; docs/tasks/2026-10-23-ci-runtime-reduction.md; docs/tasks/2026-10-23-api-suite-shared-server.md; docs/specs/2026-11-19-spec-promptkit-v2-3-upgrade.md; docs/tasks/2026-11-19-promptkit-v2-3-upgrade.md`
- **Latest Checkpoint**: `None`
- **Latest Handoff**: `None`
- **Next Action**: `Commit the engine move and the section 3A repoint in their two separate commits, then run the S8 gate sweep and S9 pk:sync.`

---

## 4. Locked Technical Invariants (Do Not Undo)

Derived from ADR-0001…0006. Changing any of these means superseding the ADR, not editing code.

> Items 3–6 and 13–16 were **verified empirically** by the M0 spike on 2026-09-08, not merely decided. Evidence: `docs/spikes/2026-09-08-drizzle-rls-enforcement.md`.

1. **Next.js 16 + React 19 + TypeScript strict.** Node ≥ 20.9. (ADR-0001)
2. **Supabase Auth owns identity.** `profiles.id` *is* `auth.users.id`; every domain FK points at `profiles.id`. No mirror table, no identity-sync webhook. (ADR-0002) *Since #89 the identity link is also physical: migration `0007` adds `profiles_id_auth_users_fkey` → `auth.users(id)` `ON DELETE CASCADE`, executed — not trusted — by `tests/integration/auth-user-cascade.test.ts` on both deletion paths.*
3. **Two authorization layers.** App-layer `userId` scoping is authoritative; Postgres RLS under the non-owner `app_authenticated` role is the backstop. Both ship. (ADR-0003)
4. **`set_config('request.jwt.claims', …, true)`** — the `is_local` flag is mandatory. Omitting it leaks identity across pooled connections. **Reproduced in M0**, not theoretical: with `false`, the next claim-less query on the same backend read the previous user's row.
5. **Repository methods take `userId` first.** No unscoped query helper may exist. (ADR-0003)
6. **Every table carries RLS**, four discrete policies, never `FOR ALL`, enforced by a `pg_tables` drift test. (ADR-0003)
7. **Focus ring is 2px `#465fff`**, not the `#ecf3ff` that `DESIGN.md` specifies — the latter measures ~1.1:1 and fails WCAG 2.2 SC 1.4.11. (ADR-0004)
8. **Kilograms canonical in storage**, display unit is a per-profile preference, conversion at the display boundary only. (ADR-0005)
9. **Primary blue is the CTA colour on every route**, regardless of day. Day accents are confined to badge and card border. (ADR-0005)
10. **Timers store absolute `endsAt`**, never decrementing counters. (Spec §3)
11. **A security control does not exist until a merge-gating test proves it runs.** (PROMPTKIT.md §6)
12. **Schema changes follow Expand → Backfill/Read-Switch → Contract** from M1 onward. (Spec §4.6)

Added by the M0 spike (ADR-0003 Amendment A1):

13. **`withUser` sets two GUCs, not one.** Blank `request.jwt.claim.sub` transaction-locally *before* seeding `request.jwt.claims`. `auth.uid()` checks the legacy singular GUC first, so a stale session-scoped value silently outranks the claims you set — demonstrated reading another user's row while correctly authenticated. (A1.1)
14. **The app role gets nothing on the `auth` schema.** Policies resolve `auth.uid()` fine without it. Therefore application code never calls `auth.uid()` directly — the user id comes from `requireUser()`, and diagnostics read the GUC wrapped in `nullif(…, '')`. (A1.2)
15. **`FORCE ROW LEVEL SECURITY` does not stop the owner.** It removes the ownership exemption, not the `BYPASSRLS` attribute, and Supabase's `postgres` has that attribute. The `current_user` assertion in the tenancy gate is the only thing preventing a vacuous pass. (A1.3)
16. **Every security control ships with an exercised failure mode.** Not just a test that passes — a negative control that fails when the mitigation is removed. The `is_local` invariant sat unexercised through planning; M0 added the leaky variant to prove the mitigation does something.
17. **Assert the result of any `GRANT` against a Supabase-managed schema.** `GRANT USAGE ON SCHEMA auth` as `postgres` returns success and changes nothing. Exit codes are not evidence there. (A1.2)
18. **Runtime request-path database code uses `DATABASE_URL` only.** `MIGRATION_DATABASE_URL` is owner-only for migrations, seeds, metadata, and bounded test fixture setup; it must never be imported by runtime repositories or route handlers.
19. **Verified auth context binds claims to the explicit repository user.** `requireUserContext()` derives claims from Supabase `auth.getUser()`, and repository methods assert `claims.sub === userId` before entering `withUser()`.
20. **M2 repository methods keep `userId` first and map rows at the domain boundary.** Route handlers must not expose raw Drizzle rows or bypass `WorkoutRepository` for user data.

21. **`since` is compared to `workout_sessions.server_seq` and nothing else, and `since >` current seq returns the FULL session.** Equality is the only "no change" answer; a client claiming to be ahead of the server is wrong about something, and "no change" would let it keep trusting state that never existed. `updated_at` and client clocks are never version tokens. *(M3-01 #58, locked in `lib/contracts/sessions.ts`, 2026-09-11.)*
22. **`WeightKgSchema` and `RepsSchema` live in `lib/contracts/common.ts`; `sync.ts` re-exports them and `sessions.ts` must never import from `sync.ts`.** Written when `sync.ts` imported `SessionStateSchema` from `sessions.ts`, so the reverse import closed a cycle at module scope — failure mode an `undefined` at import time or a schema that quietly stops validating. **#105 deleted that import** (a sync response no longer carries a session graph), so the cycle hazard is gone; **the rule is kept regardless**, because what it actually protects is single ownership of the scalar bounds — `sync.ts` and `sessions.ts` both need `WeightKgSchema`, and a bound declared twice is two sources of truth that can disagree in silence. The invariant is unchanged; only its original justification is superseded, and `lib/contracts/common.ts` says so where the schemas live. *(Found while writing M3-00 on 2026-09-11; the bounds also mirror the `weight_sane`/`reps_sane` CHECK constraints so schema and database rejections stay one event.)*
23. **`PATCH /api/profile` accepts only `displayName` and `preferredUnit`, and an unknown key is a 400, not an ignored field.** `email` is not client-editable at all: identity belongs to Supabase Auth and the app has no verification flow to back the claim. *(M3-00 #57.)*
24. **The `preferredUnit` wire value is literally the DB enum: `('kg', 'lbs')`, not `('kg', 'lb')`.** Verified against `db/schema/index.ts:29`, migration `0000:5`, and a live `pg_type ⋈ pg_enum` query. No mapping layer, no `ALTER TYPE`: `"lb"` is a 400 pinned in unit and route specs (the RFC §4.1 snippet that guessed it is corrected by the spec's §8.7 erratum). A contract comment claiming to *mirror* storage is an unverified claim until a test reads the storage truth. *(M3-00 #57, 2026-09-11.)*
25. **Migrations are hand-authored SQL in `supabase/migrations/`, applied in filename order by the Supabase CLI; drizzle-kit `generate`/`migrate` stay out of the migration loop.** The npm scripts are gone, `drizzle.config.ts` declares no `out:`, and `supabase/migrations/meta/` is deleted — each leg enforced by `tests/unit/migration-authority.test.ts`, which was watched failing on all four injected re-introductions (M4 audit entries 4–5). `db/schema/index.ts` is a runtime type view, not a codegen source: keep it in step with the SQL by hand and prove column-level truth with live-catalog tests. *(M4-00 #89, ADR-0006, 2026-09-12.)*

---

## 5. Known Blockers, Risks & Open Questions

### Blockers
- **[CLOSED 2026-09-21 — the project was created and provisioned; the text below is the as-found state.]**
- **THERE IS NO HOSTED DATABASE PROJECT FOR THIS APPLICATION — it was the top of the chain (2026-09-21, `B7`).** The
  Supabase Management API (`GET https://api.supabase.com/v1/projects`, authoritative; not the CLI's org-filtered
  view) returns **exactly two** projects on this account — **`shelf`** (`pisvfdoahbtnmamwzcbt`, ap-southeast-2)
  and **`anonboard`** (`bjrqjkhmbmiamglmvcax`, ap-northeast-2) — across **one** organization, and **neither is
  this app**. Nothing matches `ppl` / `fitness` / `tracker`. **Consequences:** (1) the four variables `B6` needs
  **cannot be configured**, because three of them require a hosted project that does not exist; (2) the
  owner-reported *"hosted Supabase with migrations `0000`-`0008` applied"* is **measured false**, and those
  migrations are applied **only** in this workstation's local stack; (3) **B5's premise is void** — there is no
  seed content anywhere to verify, so that card is **not applicable rather than blocked**. **Security task
  carried forward**: `supabase/migrations/0001` line 20 commits a `CREATE ROLE app_authenticated LOGIN
  PASSWORD '…'` literal, so any hosted deployment would ship a publicly-known DB role password and must rotate
  it during provisioning; the hosted pooler username format also differs from the local
  `app_authenticated.pooler-dev`. **This is a decision, not a build** — create the project, decommission
  production, or label it a non-functional preview. Holder: Owner. Filed as **#178** (M4-35).
- **[CONFIGURED 2026-09-21 — all four variables are set for Production and the boot is proven; production HTTP verification stays with B1. The text below is the as-found state.]**
- **PRODUCTION HAD NO ENVIRONMENT VARIABLES AT ALL — it was blocked by B7 (2026-09-21, `B6`).**
  `vercel env ls production` **and** `vercel env ls` return **"No Environment Variables found"** for
  `jonells-projects/ppl-fitness-tracker`, and a production `env pull` returns only Vercel/Turbo system vars —
  no `DATABASE_URL`, no `NEXT_PUBLIC_SUPABASE_URL`, no anon key, no `NEXT_PUBLIC_APP_URL`. Since `f0f5993`
  (**M4-31**) a boot without `DATABASE_URL` **refuses to start and exits non-zero**, so production cannot
  serve a request at all. **Every deployment reads `● Ready` — but that is a build result, never a runtime
  one.** The runtime failure itself is **inference, not measurement**: it cannot be observed from here because
  B1's SSO means no request reaches the app, and `vercel logs` returns "No logs found", the signature of an
  unreachable surface rather than a healthy one. This **corrects the owner-reported "Vercel env all set"
  claim** — labelled *not measured* when recorded earlier this session, and now measured **false**. **B6 sits
  at the top of the dependency chain: it gates B5, the `/api/health` probe, and any meaningful B1 decision.**
  Holder: Owner (Vercel project settings). A card is owed.
- **CI IS UNAVAILABLE FOR THE WHOLE REPOSITORY — GitHub account billing, not code (2026-09-21).** Push run
  `35555062183` on `main` (`f0f5993`) is `completed/failure` with **`steps: 0`** and a **2-second** lifetime,
  and the provider's own annotation reads *"The job was not started because recent account payments have failed
  or your spending limit needs to be increased."* Classification: **`infrastructure or transient`**, account
  level — not a code, test or build failure, and **no repository file is implicated** (the failing push touched
  nothing under `.github/`). **The consequence to hold onto:** the four commits that push delivered —
  `12068c4`, `c5e8ed8`, `b44ff6c`, `f0f5993` — have **no CI coverage at all**, so M4-30's health route and
  M4-31's env validation rest on **local gates alone**; **`main`'s last CI-verified-green revision is
  `e11e75b`**. Every run created before the billing fix fails identically in ~2 s — **do not bisect it**, and
  do not read the red board as a `main` regression.  **Confirmed, not predicted:** a second run
  (`35555468830` on `5a5a0a0`, `02:50:07Z`) reproduced it exactly — `steps=0`, 2-second job, the same
  verbatim annotation. **And a third time, on the authorized re-run:** after the owner confirmed the action,
  `gh run rerun 35555062183` was executed and attempt 2 failed identically (`03:08:56Z` → `03:08:58Z`,
  `steps: 0`, same annotation verbatim) — which is what turns "do not bisect it" into **"do not re-run it
  either"**: while the account condition holds, the result is a fact about the account, not the code.
  Canonical record:
  `docs/releases/ci-triage/CI-github-35555062183.md` (state **`remediation_planned`**, ACTION-001 recorded as
  **executed and consumed**, no code remediation proposed). **Holder: Owner** — GitHub *Settings → Billing & plans*.
  **Fourth occurrence, 2026-09-21T04:26:31Z — and it shows a *push* is equally futile:** seven commits were
  pushed to `main` (`5a5a0a0..89418d5`, carrying the B5/B6/B7 resolutions) and the resulting run
  **`35560988807`** on `89418d5` failed identically — **`steps: 0`**, 2-second job (`04:26:31Z` → `04:26:33Z`),
  the same annotation verbatim. **The condition blocks every run-creation path, not just re-runs**, so while it
  holds *pushing delivers code with no arbitration attached*. **Seven commits now sit on `origin/main` with no
  runner-side result**, and **`main`'s last CI-verified-green revision remains `e11e75b`.**
  **Fifth occurrence, 2026-09-21T05:06:15Z:** pushing the two free cost-control commits
  (`89418d5..6203057`) produced run **`35563333673`** on `6203057` — again **`steps: 0`**, the identical
  annotation, so the condition is unchanged and no push or re-run can arbitrate. The same run is also the
  **only** evidence that GitHub accepts the new `.github/workflows/test.yml` (`state=active`, a normally
  created `test` job, no `startup_failure`) — **syntax acceptance, not gate validation**, since no step ran.
  **Local evidence substituted, and labelled as such:** with no runner able to start, the workflow's full
  five-stage gate was executed **locally on `89418d5`** — lint 0 · typecheck 0 · set-config ban 0 ·
  preflight 4/4 · unit **66 files / 638 tests** · api **14 files / 84 tests** · e2e **81 passed** (0 skipped,
  legacy-parity executed) against a production build, with `/api/health` 200 and every M3 SLA inside budget.
  Record: **`docs/releases/ci-triage/gate-local-89418d5.md`**. **This is *not* CI arbitration and *not*
  production truth** — it ran on this workstation against the **local** stack, so it does not turn any red run
  green and does not touch the tag decision.
- ~~**M3-00/M3-01 (#57/#58) are half-built and unverified.**~~ **Resolved 2026-09-11: the endpoints exist and every promise above is now a watched control.** The RED steps were observed RED first (profile spec failed 7/7 against the absent route; prefill spec failed the happy paths while the `[id]` route shadowed it, exactly as the trap note predicted). Measured green: lint 0 under `--max-warnings=0`, typecheck 0, `check-set-config.sh` 0, unit **25 files / 236 tests**, API **10 files / 60 tests** (twice — the first full run exposed a substring assertion in `prefill.test.ts` that flaked on random UUID hex containing "500"; it was replaced with a field-level assertion, and the pass cited here is the post-fix run). The traps: `/api/sessions/prefill` non-shadowing is load-borne on its 200 spec; `no-store` now covers the `[id]` route's 200s **and** 404s; the delta byte claim is measured (53 B vs 2 035 B). The last open risk — "a gate that only ran locally is not yet a gate" — is closed: PR #69's CI `test` job **passed (5m53s)** on the exact merged tree before the Owner merged it. No blocker remains in M3-00/M3-01 territory.


**No immediate coding blocker. M2 and M3 are both complete:** M2-00 → M2-06 are merged (the last as
PR #53, `ce1c5d9`), M3-00 → M3-10 are merged (the last two as PRs #86 and #87), and issues #42, #67
and #73 are closed. Nothing in either milestone remains. What M3 left behind are two named residual
risks rather than absorbed ones: the **documented 200 ms p95 budget is measured in production mode,
and it MISSES** — 50 sequential authenticated `POST /api/sync` writes on the production
build give **p50 188.3 ms / p95 272.8 ms / max 609.9 ms** on the first production-mode run, and
**p50 187.5–199.0 / p95 234.2–282.1 / max 268.6–302.2 ms** on M3-10's re-runs (the exit report's
number), against a 30-request no-auth `GET /api/exercises` baseline on the same server of p50 8.7 /
p95 16.9 / max 24.2. That ~14–16x p95 gap attributes the cost to the authenticated write path (two
`getUser()` round trips plus the per-user transaction), not to Next's prod server or to Postgres
being slow that day. The enforced 800 ms ceiling holds and the miss is printed on every E2E run, so
it cannot be quietly forgotten. **PR #72's CI run
reproduced it independently**: p50 117.8 ms / p95 222.0 ms against a no-auth p95 of 7.2 ms on a clean GitHub
runner (vs 272.8 / 16.9 here) — so the miss is not an artifact of this dev box, and the authenticated-path
attribution holds on both machines (a ~19x p95 gap on CI, ~16x locally). **The 50 rps condition
§3 actually specifies is still untested** — that is M4's load test, and nothing here satisfies it —
and the rate limiters are **accepted as single-instance-only** (PROMPTKIT.md §2): one process holds each budget, so a second instance multiplies every budget by N — a documented limitation, not a TODO. A production-mode
measurement (`next:build` + `next:start`) is the natural M4/telemetry task. See the remediation list
below and `docs/tasks/2026-09-11-intake-debt-index.md`.

*Resolved 2026-09-13 — #92 (re-document, not remediate).* The 200 ms @ 50 rps figure was **documented, never enforced**; the enforced ceiling is M2-06's 800 ms and it holds on all recorded runs. #92 settled the promise by re-documenting to measured reality instead of moving a budget to fit it (locked protocol): sequential production `POST /api/sync` reads **p50 200.5–258.1 / p95 364.5–413.9 ms** on the #90 harness (first-ever prod measurement p95 272.8 / max 609.9; PR #72 CI p95 222.0) — all above 200 and *outside* the 50 rps condition, which no sequential run ever reached (#90: 50 rps undeliverable on this 4-core box, best 43.6 rps, verdict `INCONCLUSIVE`). The RFC §3 SLA row and `tests/e2e/sync-latency.spec.ts` now quote the **measured band + enforced 800 ms ceiling**; the per-run "MISSES vs 200 ms" print is retired. No rate, budget, or threshold moved. The other three residuals on the list below stand.

*Resolved 2026-09-08 — `M0-00`, Node runtime.* Initially filed as "WSL Node is 18.19.1, too old for Next.js 16." That was overstated. `~/.nvm/versions/node/` already contained v22.19.0 and v24.18.0, and the `PATH` prepend at `~/.zshrc:119-122` selects the highest, so the **interactive** shell was already on Node 24 and Next.js 16 would have run fine.

The narrower claim that survived — "non-interactive shells resolve `/usr/bin/node` v18.19.1" — was **also overstated**, re-measured 2026-09-11: plain `bash -c`, `bash -lc`, and `zsh -lc` in this environment all resolve **v24.20.0**, because the nvm `PATH` prepend is inherited from the parent process. Only a stripped environment (`env -i bash -c 'node -v'`) falls back to `/usr/bin/node` **v18.19.1**. `PROMPTKIT.md` §3 is corrected accordingly; `~/.zshenv` was still deliberately not created — no repo-visible change is needed.

**Actions taken (2026-09-08, unchanged)**: `nvm install --lts` → v24.20.0 set as nvm default (additive; `/usr/bin/node` untouched), and `PROMPTKIT.md` §3 documents the explicit-source command form for automation. `~/.zshenv` was deliberately *not* created — it changes the user's environment rather than the repo.

**Standing caution**: `node --version` reporting v18 is the signal that nvm was not sourced. Check it before trusting any build result, especially in CI-style sandboxes, systemd units, and cron.

- **Standing the browser harness up surfaced two machine-environment hazards that will bite the next
  person.** (1) `npx playwright install chromium` downloads a browser that cannot start here:
  `chrome-headless-shell` exits **127** for want of `libnspr4` / `libnss3` / `libasound2`, and there is no
  passwordless sudo — so the seven resulting `browserType.launch` failures look exactly like product
  defects. Local workaround used for these runs: unpack the distro libraries into a non-system path and
  export `LD_LIBRARY_PATH`. It is deliberately **not** a repository dependency; CI does it properly with
  `npx playwright install --with-deps chromium`. (2) Chrome's profile directory name came from a
  **Windows** temp path (`C:\Users\<user>\AppData\Local\lighthouse.<n>`) present somewhere in this
  machine's process environment — `.env.local`, the shell, and `os.tmpdir()` were each checked and are
  clean, so the origin is still unidentified. chrome-launcher treated the string as relative and created
  the profile **inside the repository**, after which every `next build` panicked with `os error 6` while
  reading `SingletonSocket` as a CSS dependency — a failure indistinguishable from a code regression, and
  one that also broke a clean `main` checked out into a git worktree. `tests/e2e/lighthouse.spec.ts` now
  pins an explicit `--user-data-dir` under `/tmp` and fails if the run creates anything at the repo root,
  so the suite cannot repeat it even while the cause is unresolved.

- **`SessionStateSchema` was `z.object({}).passthrough()`; #73 closed it, MERGED as PR #87 (`2d5edfb`, 2026-09-12T02:00Z).** For four milestones the session graph was never contract-validated: `GET /api/sessions/[id]` checked the envelope and every response built from the placeholder passed regardless of content, and `z.infer` of it was `Record<string, unknown>` — a screen typed against `SessionState` compiled while reading `undefined` weights. M3-04 had worked around it with a view-boundary schema (`lib/views/session-view.ts`) that parsed only what the session screen renders. The contract now states the graph — transcribed from `lib/domain/sessions/types.ts` as `mapSessionState` emits it, `.strict()` throughout, every enum reused from `lib/contracts/common.ts` (including the two the plan half needed, `ExerciseKindSchema` and `RoutineExercisePhaseSchema`), with the `Date`-or-ISO timestamp duality living in the contract rather than in a view — and `session-view.ts` is the re-export this bullet asked for. All three producers (`POST /api/sessions`, `GET /api/sessions/[id]`, `POST /api/sync`) parse what they send, so a mapper that drifts fails at the boundary; both drift classes were injected and observed to fail (audit entry 19). **What #73 left open is now shut, by #105:** the second half of that three-producer sentence is history — `POST /api/sync` no longer ships a session graph at all, because `SyncResponseData.state` had no runtime consumer and the client that was supposed to read it refetches instead (§3's #105 bullet). The `tests/e2e/session-runner.spec.ts:174` mock, which invented a `state.session.*` shape the contract had never had *at any revision*, is now built through `SyncResponseDataSchema.parse` in `tests/e2e/sync-fixtures.ts`, with a unit control that injects the original fabrication and requires a throw. Neither was a reason to reopen #73, and #105 did not reopen it: the graph's two remaining producers still validate what they send, unchanged.

- **The Lighthouse gate now audits the screens users actually train on — and one thing it still cannot see.** `#60` recorded a score of 100 "for `/`" when `/` was a page. Since `#61` made `/` a per-user screen, an unauthenticated audit is served a redirect, so the spec resolves the entry point, asserts it against a small allow-list, and labels the measurement with the pathname it audited (`score for /sign-in (reached from /): 100`). The **authenticated** audit that note deferred — a session attached to Lighthouse's request via `--extra-headers`, fed from the same cookie jar `tests/e2e/auth.ts` uses — **was built: #67 shipped it** (PR #86), and `tests/e2e/lighthouse.spec.ts` now scores 100 on `/history`, `/`, and `/session/[id]` as well as `/sign-in`, all four re-scored on every final run. **The hole M3 found but did not close:** an accessible name that is a **zero-width space** scores **100** (audit entry 11) — axe did not catch it either. "A link that renders as nothing" is invisible to both gates, so the fix is a structural DOM check, not a louder Lighthouse; it is handed to M4 (exit report §3.6) rather than papered over here.

### Open Questions

- ~~**`--accent-legs` has no assigned colour.**~~ **Resolved 2026-09-11 by #59 (PR #71)**: `#7a3ff2` ships in `src/app/globals.css` as a *documented DESIGN.md extension* — measured 5.50:1 on white / 5.26:1 on the page, inside the contrast gate's matrix. `DESIGN.md` offers no third accent that could be legitimately spent (`tertiary #667085` is reserved for disabled states), which is why it is an extension rather than a pick. It blocked M3; M3 is closed.
- ~~**Package manager for the target app.**~~ **Resolved at the M1 scaffold**: **npm** (`package-lock.json` present, no `packageManager` field), and `PROMPTKIT.md` §3 records it with the instruction not to run `pnpm`/`yarn` here.
- **Dark mode deferred.** `DESIGN.md` ships no dark tokens. Light-only in v1 per ADR-0005, with tokens authored under one `:root` so adding a `.dark` block stays additive. Revisit immediately post-v1 — this app gets used in dim gyms at night.

### #65's three findings, all from tests that were right

- **A sets table keyed by the wrong id renders a plausible lie.** `view.routineDay.exercises[]`
  entries are *placements* (`routine_exercises` rows with their own id); `session_sets.exerciseId`
  references the exercise. Keying the name map by `placement.id` type-checked, ran, and labelled
  every logged lift "Removed exercise". Caught by asserting a name that should have been present
  (`tests/e2e/history.spec.ts`), which is the only kind of test that catches this class.
- **Two `signInFreshUser` calls on one page silently swap identity.** The disclosure spec
  (`/progress/<another user's exercise>`) initially "found" a leak: it seeded the exercise as user B
  and then signed B into the same browser context it was auditing as user A, so the page correctly
  showed B's own data. The fix is `createTestSession` for anyone who is not the visitor — an auth
  row without cookies. Recorded because the trap is still there for the next spec.
- **#100 — the Playwright "contention" family was mostly arithmetic, and it is now fenced by cause.**
  Three things were found, each with a control watched failing on a deliberate breakage: (1) eleven
  assertions waited on a **poll-delivered server fact inside Playwright's 5 000 ms default**, shorter than
  the 4 s poll they depend on — `expectPhase`'s window is now derived and *imported* from
  `POLL_INTERVAL_VISIBLE_MS`; (2) **spec clocks never sized from the waits they contain** — G-M3-3 permits
  55 s of waiting inside a 30 s default (measured 25.6 s solo, which is audit 19's
  "out of test budget while printing a passing p95" with no load involved), and a `describe`-scoped
  `setTimeout` does not reach tests outside it, so two Lighthouse audits and three `session-runner` specs
  ran on the default (one measuring 17.9 s at 2.1× load, and timing out at CI's worker count); (3) **the
  evidence was unreachable by configuration** — `trace: "on-first-retry"` could not fire because `retries`
  defaults to 0, so the suite had never produced a trace for any incident in its history; it is now
  `retain-on-failure` plus per-spec JSON durations, and every number above came from that reporter. Five
  consecutive full batteries green with zero solo re-runs exists twice (`100r1`–`r5` on `7baf430`,
  discarded when a spec's allowed runtime changed; `100s1`–`s5` on the shipping tree, one of them at load
  8.36 on `nproc=4`). **What this does not buy:** the 50 ms paint gate is missed by two specs at once at
  CI's 2 workers on an oversubscribed box (55.1 / 73.2 ms) — CI's * quieter runner read 16.8–19.4 ms on one #116 job, but **CI itself went red on it too**
  (66.1 ms at **n=17, where p95 is the maximum** — **#121**), so the gate is load-sensitive and its denominator is
  broken on CI hardware; neither was papered over with a `--workers` cap or a moved goal, and neither a `--workers` cap nor a moved goal was used;
  `dashboard.spec.ts:125` is still unexplained after a wrong explanation was withdrawn; the GoTrue teardown
  500 is nameable rather than fixed; the sampler's `n=17` degeneracy is **#121**, and the `chrome-launcher`
  WSL `PATH` scan that forced a stripped `PATH` on every Lighthouse number in this ledger is **#122**; `100run1`'s vanished server is unnamed. Full ledger, including the
  three claims of mine that were wrong in the flattering direction:
  `docs/rca/m4-100-contention-ledger.md`. **MERGED as PR #120 (`324d4b7`, 2026-09-12T19:49Z)**, issue closed; branch was `test/m4-100-contention-fences`.

- **#90 — the 50 rps load harness exists, was watched failing on a deliberate slowdown, and it says the
  documented budget is not met rather than why.** `scripts/perf-sync-load.ts` (`npm run perf:sync`, manual,
  outside CI by the card's own scope) measures a production build: percentiles over **2xx responses only**
  (a 429 returns before the ledger insert, so mixing rejections reports a better p95 while the server did less
  work), `nproc`/`loadavg` travelling with the verdict, and `pg_stat_activity` for concurrency because the
  app's `pg.Pool` is only reachable inside the server process (`lib/db/client.ts:8`) and **no proxy is
  substituted for its queue depth**. §4 item 16 control: +500 ms injected moved **p50 221.7 → 711.6 ms
  (+489.9)** and returned to 205.0 ms after revert — rested on the **median**, because at n≈20 "p95" is the
  second-largest observation and read 261/312/545 ms across identical code, which is #121's defect reproduced
  in this very tool and now guarded. The 429 scenario genuinely runs: 12 rps at 4 rps/user for 90 s →
  **423 of 1080 refused**, 7.3 accepted rps against 12.0 offered, p95 over the 657 accepted only. ADR-0003's
  caution is **confirmed in shape and undetermined in split**: ~210 ms at 1–5 rps becomes 5.7 s at 13 rps and
  12.6 s at 34 rps while `idle in transaction` pins at pg's default 10 — and **narrowed against my own earlier
  reading**, since at 12 rps with 6 active backends the budget was still missed, so the ten-connection pool
  explains the collapse and not the whole gap. Findings it produced and deliberately did not fix: **#125** (a
  shed `getUser()` hop reported as `UNAUTHENTICATED` — 2715 of 2899 requests in one run, 30/30 users later
  accepted on the same cookie, cause discarded on both sides: 1003 rejections produced an 8-line log) and
  **#121** (now gating CI on branches that change no shipped code; three matched runs with identical medians
  and `p95 == max`, because `ceil(0.95n) − 1 = n − 1` for every n ≤ 19). Residue: **50 rps sustained is
  unmet on this hardware** and stays unmet rather than being reworded; four 500s appeared in one baseline with
  no captured body (that run predates the per-status sampler); the sampler still does not record
  `Retry-After`. **MERGED as PR #126 (`e26ecfa`, 2026-09-12T23:43Z)**, issue closed; branch was
  `perf/m4-90-load-harness`.

- **#82 — #65's own card asks for `?from=`/`?to=` paging, and the contract has no such params.**
  `SessionsListQuerySchema` is `{ cursor? }.strict()`, so a date filter is a 400, not an ignored
  query. The card also says "no backend work", so the screen shipped on the cursor the contract
  offers. A client-side filter over cursor pages would skip or repeat days at every page boundary,
  which is the failure the card's "raise a spec gap" invariant exists to prevent.

### #64's two findings, one filed

- **#80 — the API/E2E fixture layer shared one hardcoded id set; the ids are now minted per run.**
  `ids.session` used to be literally `22222222-…` (`tests/integration/api/fixtures.ts:5`), and
  `seedSessionFixtures` deleted those rows in `cleanup()` **and, as crash-recovery hygiene, on its way
  in before it seeded**. Under `fullyParallel: true` with no worker cap that made one file's *setup* a
  data-destruction event for a sibling — #60's spec recorded it as a `404 NOT_FOUND` mid-measurement.
  Now each call mints its eleven identities and returns them as `SessionFixture.ids`, and the two
  `NOT NULL UNIQUE` slugs carry the same per-run suffix, because per-run ids with fixed slugs would
  only have moved the collision onto the natural key (`db/schema/index.ts:74,96`). Per-run identity
  gives up the pre-clean's self-healing — a crashed run's rows no longer repeat anyone's ids, so
  nobody sweeps them up — which is why a **sweep by slug marker, bounded to rows older than 2 hours**
  replaces it: an unbounded prefix sweep is the same bug wearing a name. The invariant is asserted at
  the seam the failure surfaced (an authenticated `GET /api/sessions/[id]`) in
  `tests/integration/api/fixture-isolation.test.ts`, and watched red: with the constants restored, the
  second seeding call dies on `exercises_pkey`, so the file fails at its hook rather than at an
  assertion. `sync-latency.spec.ts` keeps `mode: 'serial'` for measurement isolation only, and **#100's
  five-consecutive-full-battery criterion is what will prove the cross-file case — this change makes
  the collision unreachable, it does not prove the suite is quiet.** **Two further reproductions on 2026-09-12 (#105's branch), and the
  attribution first written here was wrong, so it is corrected rather than kept.**
  `session-runner.spec.ts:111` failed inside `cleanup()` with
  `Could not clean up M1-16 test user (500)` — first at Playwright's default **2 workers** (60 passed /
  1 failed, while `--workers=1` was 61/0 printing median 14.8 ms / p95 20.2 ms), then **twice more at
  `--workers=1`** in consecutive full runs, each time with the spec's own 100-tap measurement already
  behind it: Playwright reports the first failure, and the failure was in the `finally`. So worker
  count does not explain it and this bullet's original framing was too tidy. What is known: a bare
  admin create-then-delete of a fresh user against the same still-running stack returns 200/200
  minutes later, so nothing is persistently broken; and `tests/integration/api/fixtures.ts:120`
  throws the **status** while discarding GoTrue's response body, which is precisely why the cause
  cannot be named from test output — the shape can be described and the mechanism cannot. Naming it is
  this card's work (per-run ids, and a fixture that says what the admin API answered), and #105
  neither creates it nor fixes it. `--workers=1` is still the right local invocation, because it is
  what makes the 404 above unreachable — not because it makes this go away.
- **~~The four Lighthouse specs fail on this machine~~ — closed by #149: the spec no longer asks
  `chrome-launcher` to launch anything.** The mechanism stayed exactly as this bullet described it:
  `chrome-launcher/dist/utils.js` `makeTmpDir()` switches on `getPlatform()`, which returns `'wsl'` whenever
  `os.release()` contains *microsoft*, and that case **overwrites `process.env.TEMP`** with
  `getWSLLocalAppDataPath(process.env.PATH)` — a regex scan of `$PATH` for `/x/Users/<name>/AppData/` — before
  falling through to `makeWin32TmpDir()`. So the spec's `TMPDIR/TEMP/TMP=/tmp` override was discarded by the
  child, and with `/mnt/c` unwritable all four runs died in `mkdir` with `EACCES` before a page load.
  **What this bullet prescribed — "filter the child's `PATH`" — was a trap, and it is kept here as one**: with
  no `/mnt/c` match the regex returns `[]`, so the fallback builds `/mnt/undefined/Users/undefined/AppData/Local`,
  which chrome-launcher treats as relative and creates **inside the checkout** — the litter the 2026-09-14
  `pk:onboard` row spent a bisect deleting. The fix was transport, not environment: `lighthouse(url, { port })`
  against a Chromium the spec spawns itself, leaving `chrome-launcher` reachable only from `lighthouse/cli/*`.
  The repo-root tripwire plus an asserted-absolute profile dir replace the override, and the guard that proves
  the session cookies still arrive (`extraHeaders`, and the audited `finalDisplayedUrl`) is recorded on
  `docs/tasks/m4/M4-25-lighthouse-local-bootstrap.md`. The sibling machine defect — Playwright's browsers
  needing `LD_LIBRARY_PATH` for `libnspr4`/`libnss3`/`libasound` — is **not** fixed by this and is **not** the
  repo's to fix (the owner's ruling on #149's open fork): the spec detects a shared-library death and names it,
  and §1 plus `PROMPTKIT.md` §3 carry the workaround.
- **A `next build` killed mid-write leaves a corrupted *generated* file that `next build` then
  typechecks — so the failure looks like a code regression in whichever route the writer was
  reaching.** Observed on #105's branch (2026-09-12): one full battery went red at its e2e step with
  `Failed to type check` and nothing but
  `.next/dev/types/validator.ts(188,1): error TS1434: Unexpected keyword or identifier`, while
  `npm run typecheck` in the same pass had exited 0 minutes earlier. The file's line 188 read
  `eof import("../../../src/app/api/sync/route.js")` — a torn write, the tail of a `// @ts-` comment
  fused to the next statement. Cause: a stray `pkill` of a leftover server catching the build that
  was still generating those types. `rm -rf .next` and rebuilding produced a clean build with no
  source change, which is the whole diagnosis. Two rules follow for anyone scripting the battery:
  never kill by process name in a shell whose own command line matches that name (it killed the
  script's process twice here), and clear `.next` before letting `playwright.config.ts`'s
  `webServer` rebuild, because a reused stale build silently measures the wrong tree and a torn one
  fails for reasons that have nothing to do with the diff.
- **Unexplained: a `window`-bubble `pointerdown` listener with `{ once: true }` that never fired**
  while four pointerdowns in the same document were seen by a `document`-capture listener and by a
  spy on `window`, with no cleanup having run. Diagnosed by instrumentation, not inference — and the
  apparent conclusion (the app's listener was at fault) was *wrong*: the probe's own spy assigned an
  arrow function as `window.AudioContext`, `new` on it threw, and the chime's silent fallback
  swallowed the error. What remains true is that the listener route was not demonstrably working,
  so the chime is now armed from inside the interaction handlers *and* by a document-capture
  listener. The unexplained residue is recorded here rather than deleted, because "a window listener
  that does not receive window events" is not a thing I know how to dismiss.

### Open findings from #63 (all filed, none absorbed by a later slice)

- **#76 — no API path produces an `archived` session.** `getPrefill` already queries
  `inArray(status, ['completed','archived'])`, so production code branches on a value nothing can
  create, and #63's read-only assertions cover `completed` only. Archive semantics belong to #65.
- **#77 — sync rejections carry only a code.** `rejectionReason` collapses every domain message to
  `NOT_FOUND` / `CONFLICT` / `INVALID_MUTATION` / `MUTATION_REJECTED`, discarding sentences like
  "The warm-up task must be completed before starting the main workout." #63's runner therefore
  mirrors the phase gates locally to print its hint — a second copy of a rule in a second language,
  which will drift. The requested fix is additive (`message` next to `reason`).
- **#78 — same-millisecond writes to one entity are ordered by a random UUID.**
  `compareEntityVersions` ties on `effectiveTs` (ms resolution) and `deviceId` break on
  `mutationId`, so a double-tap queued in one batch can have its second half refused as
  `STALE_CONFLICT`: the older tap wins. Reproduced by #60's spec before `7f06381`. The fix is to let
  the client's monotonic per-session `seq` decide order, which #62 already assigns and #8.2's batch
  contract already preserves.

### Technical Debt & Risks

**Remediation items — found by running, not reading (intake 2026-09-11).** Full cards with
Gherkin AC in `docs/tasks/2026-09-11-intake-debt-index.md`. **D1 and D5 are closed and merged** (PR #48, green on `main`),
and **D3 closed with M3** (PR #72 stood the harness up; #86 made it the CI merge gate for everything user-visible).
**D4 closed with #89** (hand-authored authorship model, ADR-0006 — see the row below).
**D2, D6 and D7 remain open** — all three are M4's, none of them blocks closing M3.

- ~~**D1 · `npm run lint` is red and CI never runs it.**~~ **CLOSED (merged, #48)**:
  all 24 `no-explicit-any` errors in `app-role`,
  `handle-new-user-trigger`, `rls-content-tables`, `schema-constraints` replaced with a
  narrowing helper (`tests/integration/pg-error.ts` — returns `undefined`/`''` for non-DB
  throws so a wrong SQLSTATE still fails), 2 unused bindings dropped, `lint` now
  `--max-warnings=0`, and CI gained a `Lint` step. Verified: lint exit 0, and exit 1 on a
  deliberately reintroduced `any`.
- ~~**D5 · The 6 route-handler suites are excluded from `npm test`, and `test.yml` runs only
  `npm test`.**~~ **CLOSED (merged, #48)**: CI runs
  `npm run test:api`, env moved to job level, a preflight step precedes it, and the 11
  specs whose handlers were unbuilt (`signout`/`exercises`/`progress`). They were parked in
  `tests/integration/api/pending-handlers.ts` as counted skips behind an anti-rot guard that
  failed if a pending entry's route later appeared on disk. **Retired by #42**: every M1 route now
  has a handler, the registry emptied, and the guard's own rule — "has at least one entry, or this
  file should be deleted with the registry" — is what closed it out. If M3 parks a route behind a
  skip, the registry and its negative test come back together; removing the control was the
  designed end state, not an oversight.
  exit 0.
- **D2 · `tests/unit/with-user.test.ts` is an integration test in the unit layer** (opens a
  socket to `:54322`), so the fastest feedback loop is red offline by construction.
  Confirmed harmless-but-misclassified: with a working environment it passes, and the whole
  non-API suite is green.
- ~~**D3 · Playwright is configured for `tests/e2e/`, which does not exist** — zero E2E specs
  anywhere. Do not describe E2E as coverage.~~ **CLOSED in M3**: `tests/e2e/` exists with
  **13 spec files / 61 tests**, `npm run test:e2e` runs them against a **production** build, and
  CI runs the job last on every push (PR #72, hardened by #86 — audit entry 18 fixed the parity
  gate so CI really executes it rather than skipping on a shallow checkout). E2E *is* coverage now,
  and it is a merge gate rather than a suggestion.
- ~~**D4 · `meta/_journal.json` covers migrations `0000`–`0003` only**; `0004`, `0005` and
  `0006` are hand-authored and unrecorded, while `drizzle.config.ts` still generates into
  that same directory.~~ **CLOSED — decided and implemented by #89 (M4-00): hand-authoring is
  the recorded model (ADR-0006).** The trap was **watched before it was removed**: on `793db53`,
  `npm run db:generate` emitted a phantom destructive `0004_warm_ozymandias.sql` (re-`CREATE`ing
  shipped tables, `DROP INDEX routine_exercises_day_order`, relaxing shipped NOT NULLs) and
  rewrote the journal — **exit 0**. The disarm: `db:generate`/`db:migrate` deleted from
  `package.json`, `out:` deleted from `drizzle.config.ts`, `supabase/migrations/meta/` deleted,
  and `tests/unit/migration-authority.test.ts` (CI) fails on any re-introduction — all four
  violation classes observed RED and reverted, #89 audit entries 1–5. One model paragraph now
  lives in `PROMPTKIT.md` §3; M4-20/#109 and any cascade migration start from it, not folklore.
- **D6 · Running the API suite rewrites the tracked `tsconfig.json`** (`next dev` appends a
  generated-types include and reformats arrays), so a test run dirties the tree and a later
  `git add -A` can sweep in a formatter diff. Not a CI problem; revert is manual today.
- **D7 · The integration suites read query results through inferred `any`.** D1 removed the
  explicit casts; `Client.query()`'s default generic means `rows[0].slug` and friends are
  still untyped, and under `noUncheckedIndexedAccess` a missing row is not caught either.
  A typo'd column reads `undefined`, and `expect(undefined).toBe(undefined)` passes — in the
  files that *are* the security gate. Do this before M2-06 writes its negative controls.

**Incident closed during follow-through**: `npm run test:api` first produced 10 HTTP-500
assertion failures that looked like an M2-04 regression and were not — `.env.local` still
carried `REPLACE_IN_M1-04` as the app-role password, because that credential comes from
this repo's own migration `0001`, not from `supabase status`. Corrected locally,
`.env.example` fixed, and `npm run test:api:preflight` added so the diagnosis takes two
seconds. Two residual risks from it are recorded on the index: a committed app-role password
literal with no local-only guard, and CI running the full service set that `db:up` excludes.

**Baselines now on record** (stack up, Node 24.20.0), re-measured **on merged `main` (`2d5edfb`)
2026-09-12**: `npm test` **39 files / 398 tests green**; `npm run test:api` **10 files / 60 passed /
0 skipped**; `npx playwright test` **61 passed / 0 failed**; `npm run test:mutation` exit 0;
`npm run lint` **0 errors / 0 warnings** and `npm run typecheck` exit 0. *(The intake recorded
23 files / 196 tests with 20 passed / 12 declared-skipped API specs; everything between those
numbers and these ones is M3, and the declared-skip layer no longer exists — see D5.)*
**Update for #89 (M4-00), measured twice on `feat/m4-089-migration-authorship` 2026-09-12 with
the stack up** (pass 2 re-ran everything against a database built by a **fresh `supabase start`**
on a deleted volume — CI parity): `npm test` is now **41 files / 408 tests** (the migration-authority
guard: 4; the auth-cascade suite: 6), `npm run test:mutation` now carries **six** controls (the sixth:
drop the cascade FK → 5 of 6 red, restored green) at exit 0, `test:api` unchanged **10 / 60 / 0**,
lint **0/0**, typecheck **0**, Lighthouse 100 on all four routes. **Playwright: pass 1 twice 61/0;
pass 2 opened 60/1** — `timers.spec.ts:224`, not on the documented load-sensitive list, red again
on its first solo and green on four further solos and two further full runs; the event log is entry
11 of the #89 audit, kept rather than smoothed. The two known names (`:277`, `sla.spec.ts:282`)
never fired on five full runs. No budget moved; nothing was retried into a pass without a record. The
`793db53`-era `npm run db:generate`/`db:migrate` lines in the intake record and PROMPTKIT §3's
old mixed-authority warning describe the world this branch changed; the trap itself is
reproduced deliberately and captured in `docs/tests/2026-09-12-m4-089-break-each-gate-audit.md`
entry 1 rather than taken on faith.

Carried forward, still open:

- **Custom SMTP remains a launch blocker, not polish, and is intentionally deferred as issue #16.** Supabase's default sender allows 2 emails/hour from a shared generic address. On a magic-link-only app that is the entire front door. Do not claim production email delivery until an external provider, verified sending domain, SPF/DKIM, DNS, and the hourly synthetic monitor are in place.
- **Legacy `npm run build` emits zero JavaScript** and exits 0 while doing so. Verified 2026-09-08 **and re-verified 2026-09-11** (0 `.js` files in `dist/`). Cause: classic `<script>` tags Vite won't process. Not being fixed — the legacy app is decommissioned in M4 — but do not mistake a green build for a working one.
- **Pull-day legacy set data is unrecoverable.** `saveProgress()` keyed checkbox state by `checkbox.id`, and the generated set checkboxes never had one, so all 17 collapsed into a single `"undefined"` key. Only aggregate counts survive the import. Accepted and documented in spec §4.5.
- ~~**Drizzle migration metadata is incomplete.**~~ Superseded and widened by **D4** above: the journal omits `0004`, `0005` **and now `0006`**, which M2-04 added. Same root cause, larger gap.
- ~~**Auth/profile deletion is not physically cascaded.**~~ **Decided and migrated by #89:**
  `0007_auth_user_cascade.sql` adds `profiles_id_auth_users_fkey` (`profiles.id` →
  `auth.users(id)`, `ON DELETE CASCADE`), behind a guarded cleanup of stranded fixture residue
  (the old local database held **2 026** parentless profile rows; a fresh `db reset` apply sees
  zero and prints nothing). Cascade, not restrict, because ADR-0002 makes a profile without an
  identity invalid state — and every domain table already cascaded from `profiles`, so one FK
  closes the whole deletion chain. `tests/integration/auth-user-cascade.test.ts` **executes** it
  (GoTrue admin API deletion, which runs as a role with zero privileges on `public.*`, plus the
  owner-SQL path; a 23503 refusal assertion; an in-test rolled-back negative control that
  reproduces the leak first), and `npm run test:mutation` carries drop-the-FK as its sixth
  permanent control. Fixtures may now clean up in any order; the old "profiles before Auth
  users" discipline is a courtesy, not a constraint. **Unverified where it must eventually be:**
  the same FK creation under a hosted project's `postgres` role — re-assert at first production
  migration (same caveat `supautils` findings already carry).
- **Sync conflict metadata is implemented in M2-04.** The additive migration now persists per-session sequences, mutation hashes/status, entity versions, and change rows with relationship-aware RLS. Legacy set/task rows use their stored client timestamp and zero UUID baseline until they receive sync metadata; true deltas remain deferred by contract.
- **`server_seq` is settled for M2-04.** It remains an integer per-session sequence, protected by the locked session row and unique change-log key; revisit width only with a future contract/volume requirement.
- ~~**Per-request transaction cost of ADR-0003 is unmeasured.**~~ **Measured 2026-09-08.** `withUser()` costs **+1.29 ms p50 / +1.87 ms p95** over an app-scoped autocommit `SELECT` on a direct connection, **+1.98 ms p50 / +2.35 ms p95** through supavisor in transaction mode. Four round trips instead of one, so it scales with RTT and will be worse from a region distant from the database. Affordable against the spec §2 SLA. *What remains open is narrower: pool exhaustion under sustained load. The spike reached 40 interleaved concurrent transactions on one container, which is not a load test. Still an M4 item.*
- **M0 findings are from the local stack, not a hosted project.** Roles and `auth.uid()` came from the stock Supabase image so behaviour should match, but two findings (the silently-discarded `GRANT` on `auth`, and the refusal to `ALTER` role attributes) are mediated by `supautils` and could differ on a hosted plan. Re-assert both during M1 against a real project.
- **The magic-link flow is still unproven.** M0 used the password grant to obtain real JWTs cheaply. The `sub` claim is identical either way, so the RLS conclusion is unaffected, but no part of the actual sign-in path has been exercised.
- **`node_modules` present but installed for verification only.** Installed 2026-09-08 inside WSL to confirm the build defect. Gitignored, safe to delete.


- **G-M3-4 (60-mutation outbox drain < 5 s): MISSED through M3, and the MISS turned out to be a
  defect, not a ceiling. Measured 2026-09-11, root-caused and fixed 2026-09-12; budget never
  moved.** The original six-run distribution — **4693 / 5051 / 5084 / 5326 / 5334 / 9086 /
  9660 ms**, always one `POST /api/sync` HTTP 200 — was recorded as a miss with a 15 s *hang*
  guard, on the theory that the server applied a 60-mutation batch slowly. Half right: the batch
  applies in well under a second (node→empty lands ~150 ms behind online→empty). The missing
  time was the **client refusing to send**: full-jitter backoff (cap 30 s) grew windows while the
  context was offline, and nothing cleared `nextSendAt` when the browser reported `online` — so
  the reconnect drain, and every 4 s poll, returned null inside a window whose premise the
  reconnect had just falsified. The bimodality I had called cold-start variance was this wait.
  Found by the hang guard itself firing during a full-suite battery run (34 polls, same badge
  string, 15 s — "never drains" is a different bug from "slow", and the guard told them apart).
  Fix `9ca17cc`: `SyncEngine.notifyConnectivityRestored()` + provider wiring + a permanent unit
  control that asserts both directions (ordinary drain inside a window still no-ops; post-`online`
  drain sends). Post-fix, same production build, same 5 s budget: **online→empty 1643 / 1701 /
  1711 / 1783 / 1838 ms across five runs, PASSES.** Audit entries 4, 12, 15 hold the captures.
  **Answered by M4-02 (#91, measured 2026-09-16)** — the solo number re-measured under
  competition at an intensity this box delivers without rejection (~11 rps of single mutations +
  two 60-mutation batch clients; 50 rps remains unreachable here, #90): the budget **MISSES** —
  server-side batch p95 **6 124 ms**, browser drain **11 676 ms** vs the 5 s budget, with a solo
  control of 1 757 ms on the same build minutes later attributing it to contention. The client
  drain *is* the server apply (solo round trip 1 737 vs drain 1 757; the AC-2 injected 6.5 s
  sleep under the lock showed up 1:1 client-side), which also dates this bullet's "applies in
  well under a second" phrase — true of the pre-fix comparison it was making, contradicted as an
  absolute by this measurement. **Budget moved by no one; the breach filed #164** (remediation
  of the ~420-round-trip apply). Instruments + all denominators:
  `docs/perf/2026-09-16-m4-91-batch-contention.md`, `scripts/perf-sync-contention.ts`.
  **Slice A of that remediation shipped on 2026-09-16** (PR #169 → `de68db5`): the per-mutation
  remap is gone and `materializePersonalRecord` runs once per exercise at loop end, in-transaction.
  Paired same-day legs measured contended p50 **−21.0 %** / p95 **−39.9 %** (6 337.9 ms) / max
  −44.8 % and solo p50 −34.8 % / p95 −18.6 %, with applied=offered and zero rejects on every leg —
  at the **top** of the 25–40 % band the split predicted, while the two other statistics sit below
  it. **Solo still HOLDS and contended still MISSES**, which is the card's own claim: slice A moves
  the wall by the priced share and does not clear the budget. The verdict sentence for #164 belongs
  to **slice B (#168 / M4-28)**, whose PR carries the closing keyword.
  **Slice B is implemented, measured and committed** (branch `perf/m4-28-fan-out-batching`, commit
  `c24b3a9`, 2026-09-21): the reserve, version and tail groups are batched per request — reservations
  in three statements, the session's version partition plus its set/task fallbacks in one read with
  write-through, and one tail flush (exact `serverSeq` claim, deduped bulk version upsert, bulk
  change insert, bulk `applied` stamp). `SyncStore` and `SyncEngine.apply` are byte-identical, so
  every existing spec compiles and passes untouched. **Paired same-day legs, this box, 200 s each:**
  contended p50 **2 056.9 → 482.2 ms (−76.6 %)** / p95 **2 543.4 → 719.4 ms (−71.7 %)** / max
  3 283.5 → 1 358.7, solo p50 **1 015.9 → 245.7 ms (−75.8 %)** / p95 1 214.9 → 275.0, bystanders
  527.0/650.8 → **434.5/576.9** (n=2 000) — applied=offered, zero rejects, all legs 200-only, and the
  same 200 s carried **193 → 268** contended batches (+38.9 %) at identical cadence. Both post-fix
  legs **HOLD** the 5 s budget; the control re-proved the instrument still **MISSES** when a 6 500 ms
  sleep is injected (driver p95 **7 023.1 ms**, drain 6 869 ms) and **HOLDS** again restored
  (538.2 / 488.8 ms). **Two things are deliberately not claimed:** today's *pre*-leg also held
  (2 543.4 < 5 000), so the 2026-09-16 breach reading (6 337.9 ms) was **not reproduced on this box
  today** — the finding is the paired −71.7 %, not a re-observed breach; and #166's solo band
  (400–900 ms) is **corrected downward to 245.7 ms** rather than passed. Gates: typecheck 0 · lint 0 ·
  unit **65 files / 626 tests** · api **13 files / 81** (preflight green) · e2e **81 passed (5.7 m)**
  with **zero spec edits**, one earlier G-M3-3 red (`p95 5289 ms`) recorded and solo-verified green
  twice before the next battery ran 81/81. Denominators:
  `docs/perf/2026-09-16-m4-91-batch-contention.md` §"M4-28 slice B"; #166's prediction line is
  answered in `docs/spikes/2026-09-16-m4-26-apply-path-costing.md`.
- **G-M3-3 passes for a reason worth saying out loud.** Cross-device p95 measured **4.42 s** against
  a 5 s budget — but `POLL_INTERVAL_VISIBLE_MS` is 4 000 ms, so the goal is met by the poll period,
  not by a fast propagation path. Any increase to the poll interval eats that margin completely.
- **The latency gates are load-sensitive, and M3-10 watched that happen rather than hiding it.**
  Two measurement-gate failures were observed across the ~ten suite executions of M3-10 on this
  machine (post-fix run record: 60/1, then 61/0 four times consecutively), both under 4-worker
  contention, both green on every less-contended run:
  `a11y.spec.ts:102` (keyboard-only) hit the 30 s default test timeout while the finish-status
  poll was still within its own 20 s allowance (baseline duration 15.1 s), and
  `sla.spec.ts:69` (G-M3-2) printed `p95 64.8ms exceeds the 50ms goal` once in a deliberately
  contended reproduction loop (four full runs otherwise: p95 16.8–22.1 ms). Neither budget was
  moved. These are the same family as the `session-deltas.test.ts` 5 s-coupling fix and the
  `hookTimeout` fix recorded above — the honest statement is that the gates measure the *box*,
  and CI has headroom this WSL box sometimes does not: the E2E job is green on every merged M3
  PR, and `main`'s own `test` check is `success` on both M3 exit merges (#86 `8704c19`, #87 `2d5edfb`).
  **Two more arrived on #73's branch, same family (audit entry 19):** `timers.spec.ts:277` (the
  CDP-freeze spec) failed inside `warmUpAndStart` — after `advance-phase` the subtitle was still
  "Warming up" at the 5 s assertion — and `sla.spec.ts:282` (G-M3-3) ran out its 30 s **test** budget
  *while printing a passing measurement* (`n=5 median 4339.0 ms / p95 4424.0 ms` against the 5000 ms
  goal). Both passed solo (`timers.spec.ts` 5/5 in 1.1 m; `sla.spec.ts` 3/3 in 41.3 s) and the third
  full run was 61/0. Neither flake was reproduced deliberately, so **"contention" is the best
  explanation available, not a proven one** — that residue is recorded rather than deleted.
  **The documented protocol, still in force for M4:** a red *timing* gate on this machine gets a solo
  re-run before anyone believes it (audit entries 17 and 19); no budget moves without a re-run proving
  the reality — not the wish — changed.
- **An unexplained ordering observation (not filed as a bug, because it is not substantiated).** A
  set tick flips to `Logged`, `aria-pressed=true` is asserted, and the queue reports "All changes
  synced" — yet a snapshot taken *after* that reconciliation can show the same row back as
  `Not logged` in one specific flow. The click path is proven to persist (session-runner's own
  server-side `completedSetCount` assertions pass in the same suite), so this is not "the app loses
  sets" — it is the reconciled view disagreeing under a race the test itself can sit in. The colour
  gate was decoupled from persistence rather than papered over; if it resurfaces, it is a
  reconciliation question, not an accessibility one.
- **G-M3-6 measured, not assumed: `hueCarriesState=false`.** Completion carries **no** colour signal
  at all — word (`Logged`/`Not logged`), glyph (`✓`/`○`) and `aria-pressed` only; the button's
  background is `rgba(0,0,0,0)` in both states. The first draft of that gate asserted "all four
  channels must move", which is a *stronger* claim than the goal makes and was falsified by a
  control that is in fact compliant. G-M3-6 forbids colour as the **only** carrier; it does not
  require colour to participate.

---

## 6. Recent Architectural Decisions (ADR Log)

| Date | Title & Scope | Decision Summary | ADR File |
| :--- | :--- | :--- | :--- |
| 2026-09-08 | Framework version | Next.js 16 + React 19 + TS strict. Requested "Next.js 14 + React 19" is not a valid pair — React 19 stabilised in Next 15, and 14 is EOL. | `docs/adrs/0001-nextjs-16-react-19.md` |
| 2026-09-08 | Auth provider | Supabase Auth, replacing the originally requested Clerk. Removes a vendor, the identity-sync webhook, the mirror table, and the custom RLS resolver function. | `docs/adrs/0002-supabase-auth-over-clerk.md` |
| 2026-09-08 | Authorization model | Both layers. App scoping authoritative, RLS under a `NOBYPASSRLS` non-owner role as backstop. **Confirmed empirically by M0 and amended (A1)**: `withUser` needs a second `set_config`, the app role gets nothing on the `auth` schema, `FORCE` does not stop the owner, role attributes cannot be re-forced by migration, and the cost is now measured. Decision unchanged. | `docs/adrs/0003-rls-defense-in-depth.md` |
| 2026-09-08 | Focus ring contrast | Override `DESIGN.md`. 2px `#465fff` (~4.8:1) replaces `#ecf3ff` (~1.1:1), which fails SC 1.4.11. | `docs/adrs/0004-focus-ring-contrast-override.md` |
| 2026-09-08 | Design tokens + set logging | One base palette plus three scoped day accents; light-only v1. Weight and reps in scope, nullable, prefilled from last session, kg canonical. | `docs/adrs/0005-design-tokens-and-set-logging.md` |
| 2026-09-12 | Migration authorship (D4) + auth-FK cascade | **Hand-authored SQL is the only migration currency**, applied by the Supabase CLI in filename order; drizzle-kit `generate`/`migrate` retired (scripts, `out:`, journal all deleted) after the stale-snapshot phantom migration was *watched* emitting destructive DDL with exit 0. Same card made identity deletion physical: `0007` adds `profiles.id → auth.users.id ON DELETE CASCADE`, executed by `auth-user-cascade.test.ts` and carried by `test:mutation`. | `docs/adrs/0006-migration-authorship-hand-authored.md` |
| 2026-09-16 | Cross-device propagation posture (M4-23/#112) | **The 4 s poll floor is the ratified mechanism; Supabase Realtime is declined for margin, not ignored.** The RLS widening was costed (first browser-readable application-table policy; today zero `authenticated` policies exist) and declined; §8.3's limiter arithmetic (120 req/min, polls ≤40 %) excludes a shorter poll. Monitoring is the existing instrument — G-M3-3's printed distribution on every CI battery — with four named revisit triggers, and the card's AC-2 tenancy-gate rule stands as a permanent precondition for any future Realtime PR. `G_M3_3_BUDGET_MS` untouched. | `docs/adrs/0007-realtime-declined-poll-floor-accepted.md` |

---

## 7. Next Immediate Actions (Queued)

1. ~~**Start `#40`/M2-05 legacy importer.**~~ ~~**Implemented.**~~ **Merged as PR #51**, issue #40
   closed, all five tasks done — including deleting the `importLegacy` entry from the
   declared-pending registry, which was observed failing its own anti-rot guard the moment the
   route appeared on disk. No migration was needed, so D4 never blocked it: `import_batches`
   already ships in `0000` with RLS from `0003`.
2. ~~**Merge the M2-05 PR, then refresh the docs.**~~ **This row is that refresh.** §1, §3, §5, §7
   here and the `PROMPTKIT.md` §2/§3 bullets described an unmerged branch until it landed; the
   re-measured numbers on merged `main` are in §3 and §8.
3. ~~**Start `#42`/M2-06.**~~ **Merged as PR #53** (`ce1c5d9`), closing issue #42. Handlers live,
   the 120/min sync budget is enforced rather than documented, and the batch-bound,
   duplicate-landing, and latency gates exist.
4. ~~**Merge PR #48 before M2-05's route lands.**~~ **Done.** It carried D5 (API suites in CI,
   preflight, declared-pending registry + anti-rot guard, `.env.example` fix) and D1 (24 casts
   removed via a narrowing helper, `--max-warnings=0`, CI `Lint` step) as two atomic commits.
   Both were verified green locally with the stack up, and both new gates were observed failing
   when their control was removed. Read CI's checks, not just a local table: a gate that has only
   ever run on a branch is not yet a gate. Kept off the M2-05 branch on purpose — a feature branch
   that also changes the gate hides which regression either one caught. **Then update
   `PROMPTKIT.md` §3 and §3/§5 here**: they described `main` and went stale on merge, which is the
   §8 row below this one.
5. ~~**Decide D4 (journal vs hand-authored migrations) before any `db:generate`** and record
   the chosen authorship model in `PROMPTKIT.md` §3.~~ **Decided and implemented by #89
   (M4-00): hand-authoring, ADR-0006** — model paragraph in `PROMPTKIT.md` §3, guard in
   `tests/unit/migration-authority.test.ts`, and there is no `db:generate` left to run before
   it. ~~Decide D7 before M2-06 writes its negative
   controls.~~ → **D7 (typed rows in the security suites) is still open, and M2-06 long since wrote
   those controls**: it is an M4 item now, because the 50 rps load test and the hardening pass will
   pile more assertions onto the same untyped foundation.
6. ~~**Keep schema-risk work explicit.** Retain the missing Auth/profile FK as a tracked
   hardening risk.~~ **Closed by #89**: the FK shipped (`0007_auth_user_cascade.sql`, cascade)
   and is executed by `tests/integration/auth-user-cascade.test.ts`, `test:mutation` control 6,
   and the #89 audit — see §5's rewritten cascade bullet for the one remaining unverified claim
   (hosted-project FK privileges). ~~Keep `--accent-legs` unresolved-but-flagged since it blocks M3, not M2.~~
   **Resolved: #59 shipped `--accent-legs #7a3ff2` as a documented `DESIGN.md` extension (PR #71),
   measured and inside the contrast gate.**
7. **Keep issue #16 deferred.** Custom SMTP/provider/DNS remains the separate M1 production-release blocker and must not block M2 coding or be described as complete.
8. ~~**Preserve the M3 boundary.** Do not delete legacy source folders or begin UI/design-system implementation until M2-06 closes the backend/API hardening gate.~~ **Retired by the world it described:** M2-06 closed that gate, and M3 shipped the whole UI *beside* the legacy app with `tests/e2e/legacy-parity.spec.ts` measuring that no M3 code wrote a legacy key. **The boundary now points the other way** — M4 owns deleting the legacy modules, and that spec is built to fire when it happens; flipping it is a deliberate step, not a green-suite chore (exit report §3.3).
9. ~~**Plan M3 before writing any M3 code.**~~ **Done 2026-09-11:** `docs/specs/2026-09-11-spec-m3-presentation.md` records the RFC — goals with measurement methods, non-goals, deep-module seams (`Outbox`, `SyncEngine`, `TimerController`, `UnitDisplay`), FMEA, and six milestones M3-00…M3-05. Four decisions were settled with the Owner and are recorded in §2.4 of that spec.
10. ~~**Grill the M3 spec, then decompose it.**~~ **Done 2026-09-11**, manually: `pk:grill` is advertised in `AGENTS.md` but `.promptkit/workflows/grill.md` is absent from this installation. The pass found four defects in the RFC — recorded as §8 with two Owner decisions settled (Start requires connectivity; `--accent-pull` is redefined rather than duplicated).
11. ~~**Run `pk:tasks` on the amended RFC.**~~ **Done 2026-09-11**: eleven slices in `docs/tasks/m3/`, published as issues #57–#67 under milestone #3 (M3: Presentation). The breakdown carries the §8 dependency facts: #58 before #62, #60 before any screen is *called* accessible, #59 before every screen.
12. ~~**Finish #57 and #58 on `feat/m3-00-m3-01-client-reads` (contracts committed at `14b8be2`).**~~ **Done and merged 2026-09-11 as PR #69 (`8d2b696`), CI green, issues #57/#58 closed**, in exactly the named order and watched RED before each step. The stale comment and its discard are deleted; the delta spec asserts measured byte sizes (53 B vs 2 035 B) instead of claiming shrinkage; the #48 precedent is honored — one PR, two atomic commits (`feat(api)` for #57, `feat(sessions)` for #58).
13. ~~**Start #59 (M3-02): Tailwind/shadcn foundation + contrast-gated tokens (p0).**~~ **Done 2026-09-11** exactly as written there: installed with npm, `next:build` (exit 0) and the legacy Vite build (exit 0, CSS bytes unchanged) both measured, `--accent-pull`/`--accent-legs` shipped at measured-passing values, the gate's Scenario-2 red state kept as a permanent spec assertion, and the `/` first-load baseline recorded in the PR. **Next: wait for "done merging"; then #60 (M3-03, Playwright + axe with the deliberately-failing control first) — #60's axe checks need #59's shipped tokens, which is why it sits behind this merge.**
14. ~~**Review and merge #60, then take #61 (M3-04, dashboard `/`).**~~ **Done: #60 merged as PR #72 (`9f98f83`) and #61 as PR #74 (`33d1eb7`), and the flag was flipped as demanded** — `/` is registered `interactive: true` in `tests/e2e/a11y.spec.ts` now. The instruction this item carried — edit `tests/e2e/a11y.spec.ts` as part of #61 rather than letting `/` stay registered `interactive: false` after it stopped being a placeholder — was followed, and the silent-hole failure mode it was guarding did not arrive.
15. ~~**Review and merge #61, then take #62 (M3-05, the outbox).**~~ **Done: #62 merged as PR #75 (`df6db14`).** Two things #61 left for it, which were that branch's evidence that the seam is real: `StartButton` is the only mutation in the app that goes straight to the network (RFC §8.1 — `session.start` is not a sync op), and the 409 path in it already follows §4.3's rule by calling `router.refresh()` instead of merging state client-side. The E2E spec with "another tab" in its name proves that branch runs; the outbox must obey the same rule on every rejection, not just this one.
16. ~~**Review and merge #62, then take #63 (M3-06, the runner).**~~ **Done: #63 merged as PR #79 (`5cf3b7e`).** #62 shipped the mechanism and deliberately not the usage; three things it left that #63 cannot invent for itself, all of them documented in `docs/tasks/m3/M3-05-outbox-and-reconciliation.md`:
    - **`deviceId` has no owner.** `SyncRequestSchema` requires one, and the engine takes it as injected config. Nothing in the app mints or persists it yet. It is *not* the queue, so §4.3's ban on `localStorage`-as-queue does not cover it — but the decision still has to be made deliberately (a `meta` store in the same IndexedDB database is the choice consistent with §8.5), not dropped into the first file that needs it.
    - **`IndexedDBOutboxStorage` has never run.** The unit suite tests `Outbox` against a memory store, which is the point of the seam — and also means the browser half is unproven. The first execution of that file must be a test, not a user's phone. The card itself assigns that proof to M3-06's `offline-session.spec.ts`.
    - **The queue is invisible until #63 renders it.** `pendingCount()`/`pending()` are the interface; the "N waiting to sync" copy and the rejection banner are the runner's job. Until then no user can observe any of §4.3 holding, which is why this PR claims plumbing and not the offline goal.
    **Done 2026-09-11 on `feat/m3-06-runner` (nine commits, `8cd8a02..7f06381`), merged as PR #79 (`5cf3b7e`).** All
    three inherited items landed as code, not intentions: the device id has an owner
    (`device-identity.ts` + the `meta` store), `IndexedDBOutboxStorage` executed in a browser for the
    first time in `tests/e2e/session-runner.spec.ts` (its reload spec is the durability proof #62
    could not produce), and the queue renders as a badge that cannot claim "synced" over a refusal.
    The card's tap gate is measured and passing (`p95 23.7–26.4 ms` over 100 taps).

    Two deviations from the card's text are recorded rather than smoothed over: airplane mode is
    modelled by refusing `/api/sync` (a `context.setOffline(true)` reload has no document to load,
    and M3 ships no cached shell), and *archived* is unreachable — no route or transition produces
    it, so the read-only branch is tested against `completed`, which is the same code path (#76).

    What the slice found about the code that was already merged, in one place:
    - `session_sets` rows are created **lazily** by the first `set.upsert`. #61's read-only screen
     therefore rendered "No sets recorded" for a workout in progress, and `projectPending`'s
     history-based overlay reported the user's first tick of every set as a mutation referencing a
     row the server does not have. Both are fixed by projecting the *plan* (`3be4129`). No test
     covered it, which is the same lesson as "a control does not exist until a test proves it runs",
     one milestone later, on a screen instead of a button.
    - The phase machine is gated on **tasks**, and tasks are created by completing them. A runner
     that rendered no checklist could start a workout and never finish one — caught only when a
     spec tried to walk a whole session through the UI.
    - `#60`'s latency spec held one `clientTs` for fifty re-ticks of three slots, so
     `compareEntityVersions` decided each by UUID order: a coin flip that had been passing because
     the production build was slow enough to push every timestamp outside the skew window (#78).


17. ~~**Review and merge #63, then take #64 (M3-07, rest and elapsed timers).**~~ **Done 2026-09-11
    on `feat/m3-07-timers` (seven commits, `ab47ac2..1c08dc3`), merged as PR #81 (`0278634`).** The three
    inherited constraints all held: absolute anchors with no counter anywhere, `visibilitychange`
    recomputing from `now()`, and the clock injected so the background-tab case is a unit test
    (`fires: 'none' | 3` in `tests/unit/state/timer-controller.test.ts`). #63's own follow-ups stayed
    parked rather than being smuggled in: #76, #77, #78 untouched by this slice.

18. ~~**Review and merge #64, then take #65 (M3-08, history and per-exercise progress).**~~ **Done
    2026-09-11 on `feat/m3-08-history-progress`, merged as PR #83 (`0adf233`).** All three inherited
    constraints held: the `archived` question was answered by *rendering* every status the storage
    layer can hold rather than by inventing a route that produces it (#76 still open, still #66's
    neighbour); progress reads `ProgressRepository.getExerciseProgress` and never recomputes e1RM
    (`E1rmPointSchema.strict()` means the seam has no weight or reps to recompute from); and
    durations come from `startedAt`/`completedAt`, formatted by #64's `formatDuration`.

19. ~~**Review and merge #65, then take #66 (M3-09, settings and the legacy import UI).**~~ **Done —
    merged as PR #83 (`0adf233`), CI green (9m25s), and #66 itself followed as PR #85 (`6420e5a`) — see
    item 20.** What item 19 inherited, and what became of it:
    - **`/history` is the destination for imported sessions, and it already renders them.** #66's
      import flow can therefore assert "the rows appear in the log" against a screen that exists
      instead of building its own list. `loadCoverage` is the shared answer to "did this session
      record any load", and the report page's `—` cells are the contract for the M2-05 NULL shape.
    - **`tests/e2e/history-fixtures.ts` seeds rows through `MIGRATION_DATABASE_URL`.** Import specs
      will need legacy-shaped data (NULL weight, `source = 'legacy_import'`); that helper already
      produces it, and its comment explains why the owner role is the only connection that can.
    - ~~**#82 is #66's or #67's to settle** if the import screen wants a date range; do not implement
      filtering client-side over cursor pages.~~ **Neither settled it, and both issues are now closed,
      so #82 is M4's** (item 22). The rule still holds and nothing in M4 may quietly break it: no
      client-side filtering over cursor pages — `SessionsListQuerySchema` is `{ cursor? }.strict()`,
      so a date range is a contract decision taken before any UI.


20. **M3-09 (`#66`, merged as PR #85, `6420e5a`) — the seam decisions that are not in the diff.**
    - **`src/app/state/unit-display.ts` is a façade, not a second converter.** The card's invariant
      ("`UnitDisplay` is the only place a kg↔lb conversion exists") was already satisfied by
      `lib/domain/units.ts`, which the server imports too; a second `KG_PER_LB` would have been the
      violation. A test scans the file for the factor with **comments stripped**, because the file
      describes the thing it must not contain — the same prose-vs-code trap #64 hit.
    - **The rounding tolerance is derived, not chosen.** It was 5 g until a sweep proved that
      incoherent (0.1 lb **is** 45 g, so the display is coarser than storage). It now comes from
      asking the parser what `0.1 lb` weighs in kg. The enforceable claim is **monotonicity of the
      displayed series**, not round-trip equality.
    - **#84 was found by a test and deliberately not fixed here**: `parseWeightToKg` bounds the
      *entered number* at `MAX_WEIGHT_KG`, so every thousands-grouped input (`2,000 lb` = 907 kg)
      parses to `null`. Making the client more permissive than `WeightKgSchema` would move the
      failure into the outbox, which is #77's territory. Do not "fix" the parser alone.
    - **Sign-out needs `body: JSON.stringify({})`.** `SignoutRequestSchema` is
      `z.object({}).strict()` and returns 400 to a bodyless POST — that strictness *is* the CSRF
      posture of RFC §5.1. A settings button that looks inert but leaves the session alive is the
      worst direction for this to fail in.
    - **The unit reaches server routes without client state.** Verified across requests: save `lbs`
      on `/settings`, then assert `220.5 lb` inside `/history/[id]`'s table. If a future slice
      caches a profile read, that test is what breaks first — keep it.
    - **Import never deletes a legacy key** (M4's call), reports `userStats` as *left alone* rather
      than skipping it silently, and refuses to render an unparseable report instead of paraphrasing
      it. Counts are read out of the dialog and `/history` is asserted against that number.
    - **Known limit carried into #67 — and #67 honoured the instruction:** the "switch units with
      3 queued mutations" scenario has no test, because Vitest here is `environment: "node"` with no
      jsdom. The protection is structural (no sync path can import a display module), not observed.
      Verified rather than assumed: that scenario appears nowhere in
      `docs/tests/2026-09-11-m3-verification-audit.md` or the exit report, so no gate claims it.
      It is an M4 item if jsdom (or a browser-run spec) ever makes it observable.

21. **#67 (M3-10) — CLOSED and MERGED as PR #86 (`8704c19`, 2026-09-11T19:23Z); the evidence is
    external to this file, as it should be.** `main`'s own `test` check is `success` on that merge commit.
    All five items done, each with a captured artifact: **(1)** legacy parity — four module dirs
    untouched on `main...HEAD`, five keys never written (audit table; the scan caught its own
    author's bug first, entry 3). **(2)** Lighthouse on `/` and `/session/[id]` — both added, both
    100, all four routes re-scored on both final runs. **(3)** break-each-gate — nine deliberate
    breakages captured and restored (audit 9–14: G-M3-2 delay → red; mouse guard throw → red;
    Lighthouse empty-name → 95 + `link-name`; never-drain → hang guard red at :225; colour-alone →
    the gate *missed* it and was strengthened, then red; alias re-point → red) plus two
    zero-width-space non-observations recorded honestly because Lighthouse scores them 100
    (entry 11). **(4)** audit record with the one reproduction sequence (entry 16). **(5)** M4
    handoff: `docs/releases/2026-09-12-m3-exit-report-and-m4-handoff.md` names every item the
    bullet above lists, with numbers and file references. **The owner's call on #73 landed:** it
    stayed under milestone 3 and merged as PR #87 (`2d5edfb`) on 2026-09-12, so M3 closed
    open=0 / closed=19 rather than "complete" with an open child still under it — the outcome §3.4
    asked for, reached by finishing it instead of moving it.
    - **What the gate audit left in the tree permanently:** the G-M3-6 word-carrier assertions
      (`4ca87e5`), the contrast gate's `var()` resolution + alias rows + two permanent negative
      controls (`96b5202`), the connectivity-clears-backoff fix + its two-direction unit control
      (`9ca17cc`). Every *injection* was removed; every *hole an injection found* was fixed
      instead of kept as a passing test — Scenario 2 honoured, and the alias hole is closed here
      rather than handed off, with entry 14 as its proof.
    - **Locked by measurement, do not re-litigate:** G-M3-4's budget stayed 5 s through the whole
      investigation and the ceiling — not the budget — is what caught the defect; a red *timing*
      gate on this machine gets a solo re-run before anyone believes it (audit 17), and no budget
      moves without a re-run proving the reality, not the wish, changed.
    - **Known commands:** unchanged (reproduction sequence now in audit entry 16 verbatim).
22. **M4 — START HERE.** M3 is closed (milestone #3: open=0 / closed=19) and **nothing is in
    flight**: cut M4's first branch from `main`, not from an M3 branch — there is no M3 branch left to
    continue. Read, in order: §1 above; the handoff **`docs/releases/2026-09-12-m3-exit-report-and-m4-handoff.md`**
    (its §3 is M4's raw material); and audit entry 16 for the one command sequence that regenerates
    every M3 number. Open M4's cards the way M3 did — `pk:plan` spec, then `pk:tasks` decomposition
    under a new milestone — and carry these forward as **starting facts, not discoveries**:
    - **Parked issues with their evidence** (§3.5 of the handoff — raise them, do not re-derive):
      **#76** no API path produces an `archived` session, so the archived branch is untestable;
      **#77** sync rejections carry a code with no message, so the client cannot explain a refusal;
      **#78** two same-millisecond writes to one entity are ordered by a random UUID;
      **#80** the API/E2E fixture layer shared one hardcoded id set, which is the underlying cause
      of the contention flakes below (its ids are per-run now, so what remains of that family is
      scheduling and load, not row identity — owned by #100); **#82** `/history` wants `?from=`/`?to=`, and
      `SessionsListQuerySchema` is `{ cursor? }.strict()`, so it is a contract decision first;
      **#84** the weight ceiling rejects thousands-grouped input (`2,000 lb`). Plus **#16** —
      production SMTP, open since M1, still the deploy blocker.
    - **`POST /api/sync` p95 misses the documented 200 ms budget, and that is the honest current
      state, not a regression**: production-build p95 **234–282 ms** on M3-10's runs (exit report
      §3.1), 222.0 ms on PR #72's CI runner, 272.8 ms when M3-03 first measured. The **enforced**
      ceiling is M2-06's 800 ms and it holds; the 200 ms figure stayed *documented, never enforced*.
      The 50 rps condition the master RFC specifies is still untested, and the rate limiters are
      **accepted as single-instance-only** (PROMPTKIT.md §2): N instances = N × every budget — a documented, owned limitation, not a defect.
    - **The two disclosed #73 limits are closed, and the way they were told to be closed.** The
      owner ratified *drop the field* rather than wire a consumer, so `SyncResponseData.state` no
      longer exists to have no consumer, and the `session-runner.spec.ts:174` mock is built through
      `SyncResponseDataSchema.parse` (`tests/e2e/sync-fixtures.ts`) in the same change that deleted
      it — which is what "fix the mock when you add the consumer, in the same change" was
      protecting against. The second half of the card's Option B is what remains open: an old
      queue against the narrowed server is asserted at the route and the client seam, and the
      deployment itself is not observable from this battery. See §3's #105 bullet.
    - **Playwright contention flakes, with the protocol that goes with them**: `timers.spec.ts:277`
      (CDP-freeze spec, subtitle still "Warming up" at 5 s) and `sla.spec.ts:282` (G-M3-3 exhausting
      its 30 s *test* budget while printing a passing p95) each failed once in full-suite runs on
      #73's branch, passed solo, and the third run was 61/0. Neither was reproduced deliberately, so
      "contention" is the best available explanation, not a proven one (audit 19; same family as
      `a11y.spec.ts:102` and `sla.spec.ts:69` in audit 17). **A third name arrived on #105's branch
      (2026-09-12): `sla.spec.ts:144`, G-M3-4's 5 s drain budget** — red once in a full `--workers=1`
      suite, green solo at median **1 752 ms** against that 5 000 ms, and green in the counted passes
      that followed; same treatment, same caveat (not reproduced deliberately). **`session-runner.spec.ts:201`
      — the full-workout walk, a *flow* gate rather than a latency one — went red in the same branch's
      second counted suite** (`Expected "Stretching"`, received `"2026-09-12 · Resting"`, **14 identical
      locator resolutions** inside the assertion's default 5 s) and green solo in 16.2 s. That is #89's
      audit entry 11 signature verbatim, including the 14: a phase advance crossing the engine's ~4 s
      visible poll while the box is still settling. It is named here and in PROMPTKIT §3 — green solo,
      so it meets that list's claim — and its budget was not touched, because the seam behind it belongs
      to #96's queue work, not to a number in a spec.
       **And CI is not immune to the family.** On 2026-09-12 `a11y.spec.ts:102` — on PROMPTKIT §3's
       list since audit entry 17 — went red in PR #116's first `test` job with the same string
       (`Expected "Stretching"`, received `"2026-09-12 · Resting"`), 1 failed / 60 passed, and a
       re-run of that exact SHA came back **61/0**. The workflow runs `npm run test:e2e`, which is
       bare `playwright test` with no `--workers` cap, so a hosted runner's four cores can meet the
       same seam as this laptop. What the runner does buy is headroom: the same production-build
       measurements read sync **p50 96.7 / 108.4 ms** and tap **p95 16.8 / 19.4 ms** there against
       **191–200 ms** and **~21 ms** here — which also means this box misses the documented 200 ms
       `POST /api/sync` budget *on `main`*, and did so before #105 existed. A local e2e timing red
       is therefore worth roughly half a CI one, and neither is worth a budget edit.
      **Protocol: re-run a red timing gate solo
      before believing it, and move no budget without a re-run proving the reality changed.** M4's
      load test is what decides whether any of these tails is real.
     - **#100 renamed most of the family on 2026-09-12: it was arithmetic, not contention.** The largest
       member has a root cause with a control — the subtitle is server truth by design (`runner.tsx:459`;
       `:1155-1160`, "the client *asks*; it does not decide"), so a phase may lag one
       `POLL_INTERVAL_VISIBLE_MS` cycle, and eleven assertions waited on that chain inside Playwright's
       **5 000 ms default** — shorter than the poll they depend on. `expectPhase`'s window is now *derived*
       from that interval (`2 × POLL_INTERVAL_VISIBLE_MS + 2 000`, imported from `sync-engine.ts` rather than
       retyped), which accounts for `a11y.spec.ts:102`'s CI red, `session-runner.spec.ts:201`, and
       `timers.spec.ts:277` — retiring this bullet's "not reproduced deliberately" caveat for them. Two
       further causes were clocks never sized from their own specs: **G-M3-3 permits 55 s of declared waiting
       inside a 30 s default** (measured 25.6 s solo — audit 19's "out of test budget while printing a passing
       p95", explained without invoking load), and tests running on the default because a `describe`-scoped
       `setTimeout` does not reach outside its `describe` (two Lighthouse audits at 12.2–13.5 s; three
       `session-runner` specs, one measuring 17.9 s at 2.1× load = 60 % of its clock, which timed out at CI's
       worker count). Third, the evidence was unreachable by configuration: `trace: "on-first-retry"` could
       not fire because `retries` defaults to 0, so **the suite had never produced a trace for any incident in
       its history**; it is now `retain-on-failure` with a JSON duration reporter — every number in this
       bullet came from that reporter, which is what made the class visible at all. **Five controls, each
       watched failing on a deliberate breakage** (`tests/unit/infra/e2e-evidence-config.test.ts`,
       `e2e-phase-window.test.ts`, `gotrue-failure-detail.test.ts`); two guards' first failures were defects
       *in the guard* (a parser matching no `PHASE_LABEL` keys, a scan flagging an assertion of a *set* of
       labels) and the guard was fixed, not the assertion dropped. **No SLA, budget, or threshold moved** —
       50 ms, both 5 s budgets, 800 ms, the 4 s poll, axe's rules — and CI's `--workers` was not capped.
       **Residue, named rather than smoothed:** (a) `dashboard.spec.ts:125` is unexplained — a poll-based
       explanation was written into the ledger and **withdrawn** after reading the spec's body (it learns via
       a rejection-triggered refetch), and it received no speculative window widening; (b) `100run1`'s 54 reds
       came from the production server vanishing mid-run — no crash output, no OOM, no competing process, and
       it did **not** reproduce — cause unnamed, harness now detects the signature and locks against a
       concurrent pass; (c) the GoTrue teardown 500 that had been filed as two unexplained flakes is now
       *nameable* (our helper was discarding the response body) but not fixed; (d) `/api/sync`'s
       documented 200 ms is judged on p95 and was missed on nine of ten counted passes (199.1–404.6 ms
       across the shipping five); `100s5` **met it by 0.9 ms**, which is a coin flip rather than a result and
       is recorded instead of being quoted either way — #92; **(d′) #90 built the instrument this clause was waiting
       for, and its first merged-main reading changed the wording rather than the goal:** the median sits *at*
       the document (181.3 ms on the branch, **230.9 ms on `e26ecfa`** — a "inside the budget" claim that
       failed to replicate and is retracted in `docs/perf/2026-09-12-m4-90-load-harness-design.md`), the p95
       misses on both, and the mechanism is narrowed (12 rps, 6 active backends, still missed). #92 inherits a
       problem in both halves of the distribution plus **#125 sitting upstream of every measurement**; (e) at CI's real scheduling on
       this box the 50 ms paint gate is missed by two specs at once at 1.9× oversubscription (55.1 and 73.2 ms
       p95), and CI's own runner went red on it too (66.1 ms at **n=17**, where p95 *is* the maximum — filed as
       **#121**, because the defect is the sampler's denominator rather than the 50 ms goal), so it is
       load-sensitive and its CI statistic is degenerate,
       and `timers.spec.ts:278` exhausted the new 10 s window there — the poll it is derived from is itself
       starved under contention, and widening the bound to fit a busy machine would tune it to the box.
       Five consecutive full batteries green with **zero solo re-runs** now exists twice — `100r1`–`100r5` on
       `7baf430`, discarded when a spec's allowed runtime changed, and `100s1`–`100s5` on the shipping tree —
       because a clock is behaviour and carrying greens across that change is the same shortcut as carrying
       them across a red. **The protocol above still stands as a fallback**, but it is no longer the only
       instrument: a red timing gate now arrives with a trace and a duration.
    - **The Lighthouse gate is blind to a zero-width-space accessible name** — it scores such a link
      **100**, and axe did not catch it either (audit entry 11). Closing this needs a structural DOM
      check, not a louder Lighthouse (handoff §3.6). The same section notes the contrast matrix
      measures only *enumerated* tokens: a new alias must be added to `GATE_MATRIX` by hand, or the
      rows generated from the `@theme inline` mapping.
    - **The prose-vs-reality list is now empty, each half closed the way it said it would be.**
      (200 ms `/api/sync` miss was resolved by #92 — re-documented to the measured ~203–413 ms p95
      band + enforced 800 ms ceiling, not relabelled; the process-local limiter by #93 — accepted as
      a documented single-instance-only limitation in PROMPTKIT.md §2, not relabelled.)
      **G-M3-3's margin half closes 2026-09-16 via ADR-0007 (#112)**: the owner ratified the 4 s poll
      floor as the cross-device posture — Realtime declined for margin after costing its RLS
      widening — so the prose no longer implies a fast path the mechanism lacks; the margin *is* the
      design, with four named revisit triggers (§8.3's arithmetic cites the ADR, and `sla.spec.ts`'s
      comment carries the monitoring contract). The service-worker half was already untrue — #111
      (PR #159) shipped the offline shell, and G-M3-1's "reopen with no network" has been proven
      against the document being unfetchable since, as §1's dated correction records; this entry
      carrying that fact until now was this list's own rot, caught by the DoD line ("loses its
      G-M3-3 entry one way or the other") forcing the whole bullet to be read.

---

## 8. Session Continuity Log

| Date | Engineer / Agent | Milestone / Focus | Key Changes & Artifacts |
| :--- | :--- | :--- | :--- |
| 2026-11-19 | Agent (DeepSeek Harness / lead) | PromptKit OS v2.3.0 upgrade | Engine pinned to `v2.3.0` (`52adbe1`), five host directives re-injected with the 2.3.0 untrusted-content boundary, `PROMPTKIT.md` engine prose plus directive md5 re-stated; plan `docs/specs/2026-11-19-spec-promptkit-v2-3-upgrade.md`; Task Record `docs/tasks/2026-11-19-promptkit-v2-3-upgrade.md`; §3A repointed; validator `VALID`; doctor `docs-drift OK`. |
| 2026-10-23 | Agent (Codebuff/Buffy) | PromptKit OS v2 migration | Engine pinned to `v2.0.0-71` (`0cfa093`), five host directives re-injected, profile machine lines plus `size: large` set; plan `docs/specs/2026-10-23-spec-promptkit-v2-migration.md`; Task Record `docs/tasks/2026-10-23-promptkit-v2-migration.md` (`awaiting_review`); §3A projection added; validator `VALID`, `RECORDS=2`; doctor `docs-drift OK`. |
| 2026-09-21 | Agent (Freebuff/Buffy) | `pk:checkpoint` 03 | `docs/tasks/m4/M4-29-first-release.checkpoint-03.md`; release provisioned, CI blocked on account billing, tag held. |
| 2026-09-21 | Agent (Freebuff/Buffy) | Hosted provisioning / local gate | B5 PASS (18/13), B6 configured, B7 resolved; local gate on `89418d5` green. |
| 2026-09-21 | Agent (Freebuff/Buffy) | CI cost fix | `paths-ignore` + PR-only concurrency; measured ~33% saving; a docs-only push produced zero runs. |

Older session rows are preserved in git history: `git log --follow -- docs/STATE.md`.

## 9. Session Spend Ledger

The durable spend artifact required by `checkpoint.md`. Per-turn card figures stay in chat history; this
ledger is the only place they persist. **Created 2026-09-21** — this repository's earlier checkpoints
predate the ledger requirement, and **no earlier row was reconstructed**: fabricating turn counts for
sessions nobody measured would make the ledger worse than empty. Measured spend is recorded as
`not measured` where the host exposes no token accounting, rather than estimated and presented as fact.

| Date (focus) | Turns | Measured in/out | ~Estimated payload | Host usage source or why not measured |
| :--- | :--- | :--- | :--- | :--- |
| 2026-09-21 (**one continuous session**, three checkpoints: M4-28 slice B → post-merge sync → `pk:ship` → M4-30 → `pk:issue` → M4-31 → CI triage → **executed CI re-run** → M4-32/B5 → **B6 discovery + #177** → `pk:checkpoint` 02 → **hosted provisioning (B5 PASS, B6, B7)** → **local gate on `89418d5`** → **free CI cost fix + measurement** → `pk:checkpoint` 03) | `~60 (estimate, not measured)` | `not measured` | large — 12+ workflow passes, 3 code cards, 1 release record, 1 CI triage record, 1 executed remote action, 2 checkpoints, 1 new `p0` card | The host exposes no token accounting to the agent, so the honest value is `not measured`; the turn value is labelled an estimate because it is one. The row was **extended rather than duplicated** when checkpoint 02 was taken, because both checkpoints bound the same session — a second row would inflate the session count |

**Running total**: 1 session recorded (holding **3 checkpoints**, 01–03) · measured spend `not measured`
for all recorded sessions · the estimate column is present but explicitly an estimate, never a substitute for
a measurement. No row was reconstructed for any earlier session, and none was duplicated for the second
checkpoint of this one.
