<a id="TASK-m4-29-first-release-checkpoint-02"></a>

# Checkpoint Record: M4-29 — first release (session boundary 02)

> **Why this record exists:** the session outlived the endurance window and ended with a **new `p0` blocker**
> that outranks everything previously open in M4. State is compacted here so a fresh session resumes from
> disk rather than from a transcript.

## 1. Identity and Authority

- **Record Type**: `Checkpoint Record`
- **Task ID**: `TASK-m4-29-first-release-checkpoint-02`
- **PromptKit Adaptation Profile**: `none`
- **Work Type**: `Configuration Work` (the session's spine is the release; the work mixed code, docs and CI triage)
- **Parent Task Record**: `docs/tasks/m4/M4-29-first-release.md` (L3, first release, state `blocked`)
- **Checkpoint Sequence**: `02` (predecessor: `docs/tasks/m4/M4-29-first-release.checkpoint-01.md`)
- **Identity Chain**: M4-29 (release) with **M4-30** (health endpoint, closed), **M4-31** (env validation, shipped), **M4-32** (seed verification, `blocked`), and **M4-34** (production env, `p0`, **new this session**)
- **Specification**: `docs/releases/2026-09-21-v1.0.0-release-readiness.md`
- **Owner / Actor**: Agent (Freebuff/Buffy)
- **Approval Boundary**: **no tag, no push, no deploy, no rollback, no production write.** A remote CI re-run was
  executed once under explicit owner confirmation; that action is now consumed.
- **Created**: `2026-09-21 03:42 UTC` (measured `date -u`)

## 2. Objective

Ship `v1.0.0` as a release that is **verifiable**, not merely recorded — and, in getting there, stop the
repository's own documents from disagreeing with what is actually true.

## 3. State

- **Execution State**: `handoff_ready`
- **Mapped `pk:tasks` Status**: `In Progress`
- **Branch / Revision**: `main` @ `a41742f`; `origin/main` @ `5a5a0a0`; **5 local commits unpushed**
- **Working tree**: **clean** — zero modified, zero untracked
- **Tag**: **none** (`git tag -l` → 0) — correctly held
- **Board**: milestone M4 **open=14 / closed=27** (41 total)

### Transition History

| Previous State | New State | Timestamp | Actor | Reason | Supporting Evidence |
|---|---|---|---|---|---|
| `in_progress` | `handoff_ready` | `2026-09-21 03:42 UTC` | Agent | session endurance reached; a `p0` blocker landed and state is compacted to disk | §4 audit, `docs/STATE.md` item 54 |

## 4. Phase 1 Workspace Delta Audit (read this turn, not recalled)

| Check | Result |
| :--- | :--- |
| Branch & revision | `main` @ `a41742f` |
| Sync | `0 behind / 5 ahead` of `origin/main` (`5a5a0a0`) |
| Working tree | **clean** (`git status --porcelain` empty) |
| Engine gitlink | clean at `v1.8.0-15-g2340251` (no `+`/`-`) |
| Tags | **0** |
| Debug probes | none in `src/` or `lib/` |
| CLI footprint | `.vercel/` **absent**, throwaway env file **absent** |
| `.env.local` integrity | **1623 bytes** — exactly the pre-link size, token removed |
| Test suite status | **not run this turn** — the session's last executable change was M4-31, whose gates are recorded in its Task Record. No code changed since. |

## 5. Completed Work This Session

1. **M4-30 — `GET /api/health`** (issue **#173**, closed): the release probe's target. Watched-red spec,
   contract, `no-store` on 200 **and** 503, registered in both closed route lists. Committed `12068c4`.
2. **M4-31 — fail-fast startup env validation** (issue **#174**, closed): `lib/env/server.ts` + instrumentation
   wiring with a build-phase exclusion. Running it found **three defects in its own first implementation** —
   a throwing hook leaves the server *serving*, one misconfiguration reported twice, and three acceptance
   criteria the filed card lacked. Committed `b44ff6c`.
3. **`pk:ship` release readiness** (L3): produced `docs/releases/2026-09-21-v1.0.0-release-readiness.md` and
   found that production deploys had been happening unmanaged since `2026-09-08`, and that the alias answers
   `302` to SSO on every path.
4. **Blocker set filed** as issues **#173**–**#176** (M4-30, B4, B5, B1) with a closing-keyword audit run
   forward: **0 matches**.
5. **CI triage** (`CI-github-35555062183`): `main`'s red is **GitHub account billing**, not code —
   `steps: 0` in 2 seconds. Two unarbitrated runs on two revisions, then an authorized **re-run** that failed
   identically. Three occurrences → the account condition is measured, and repetition is now forbidden.
6. **M4-32 / B5 — production seed verification**: recorded `blocked` under the filed card's own **Scenario 3**
   (not verified, **not** a pass). Attempting it found **two defects in the card I filed** — a `stretches`
   table that does not exist, and a count that includes per-user rows without an `owner_user_id is null`
   filter. Both corrected in the issue body.
7. **M4-34 / B6 — the session's largest finding**: the production Vercel project has **no environment
   variables at all** (`vercel env ls production` and `vercel env ls`: "No Environment Variables found").
   Filed as **#177**, `priority/p0`.

## 6. Revised Blocker Set (this is the state to resume from)

| ID | Blocker | Card | Blocks |
| :--- | :--- | :--- | :--- |
| **B6** | Production Vercel project has **no environment variables** — the deployed app cannot boot | **#177** (M4-34, `p0`) | **everything below** |
| **B5** | Production seed content unverified — no credential exists to read with | **#175** (M4-32) | `/api/exercises`, prefill, importer trust |
| **B1** | Deployment Protection answers `302` on every path | **#176** (M4-33, `p0`) | public reachability, and the ability to observe runtime at all |
| **B2** | No production SMTP — magic link cannot deliver | **#16** | sign-in |
| **CI** | GitHub account billing — no job can start | `CI-github-35555062183` | all runner-side arbitration |

**B6 outranks B1 and B5**: lifting Deployment Protection today would expose an app that cannot start, and B5
cannot be closed while production has no credential to query with. **B3 and B4 are closed.**

## 7. Locked Invariants (do not undo)

1. **No secret value ever appears in an issue, comment, or document** — enforced this session by masking every
   DSN, and by *not* making the Vercel env-var change myself, which would have put values on a command line.
2. **`● Ready` is a build result, never a runtime result.** Do not read a green deployment as a working app.
3. **Measured and inferred stay labelled separately.** B6's env-var absence is measured; "production cannot
   serve a request" is inferred and is recorded as inference.
4. **The `v1.0.0` tag stays uncreated** while the candidate has no CI result and production cannot boot.
5. **Do not re-run CI, and do not bisect its red** — the account condition makes both measurements of the
   account rather than the code.
6. **Closing keywords belong in PR bodies only**, never in issue or comment text (item 43's law).
7. **A card's automated verification command is a hypothesis until it is executed.** Both B5 defects were found
   by running the filed command, not by reading it.
8. **`MIGRATION_DATABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are not runtime requirements** — making either
   mandatory breaks the deploy.
9. **The local stack is a venue, not a verdict** — the production seed read must come from the hosted project.

## 8. Verification & CI Evidence

| Evidence | Result |
| :--- | :--- |
| M4-30 gates (its own turn) | typecheck 0 · lint 0 · unit **65 files / 628 tests** · api **14 / 84** · e2e **81 passed (6.0 m)** |
| M4-31 gates (its own turn) | typecheck 0 · lint 0 · unit **66 / 638** · api **14 / 84** · e2e **81 passed (6.0 m)**; bad-boot probe **exit 1**; good-boot `GET /api/health` → **200**; build-exclusion probe `exit 0` |
| CI | **none since `e11e75b`** — `main`'s last CI-verified-green revision. Five pushed commits and five local commits have **no runner-side arbitration**. |
| This checkpoint turn | **no tests run** — no executable file changed; no gate is claimed |

## 9. Scope Changes

- **Recorded, not absorbed:** the session's objective did not expand — B6 was discovered *inside* B5's scope,
  reported, filed as its own card (**#177**), and **no production action was taken** on it. The B5 card's
  `blocked` state stands rather than mutating into a production-configuration task.
- No Scope Change Record was required, because no objective, acceptance criterion, or dependency of a live
  card was altered. The one in-repo edit to a card was correcting a factually broken command in #175's own
  body, which restores the card to what it claimed rather than changing its intent.

## 10. Stop States and Host Limitation

- `handoff_ready` is a **stop state**. It prohibits implementation edits, commits, pull-request actions, and
  task switches until the resume condition in §11 is satisfied. Read-only diagnosis may continue.
- **`POLICY_LIMITATION`**: this host observes **turn counts, not wall-clock**. The workflow's 60-minute soft
  and 90-minute hard checkpoints are therefore **advisory** here; the enforced trigger is the ~15-turn nudge,
  which this session passed several times. No mechanical timer enforcement is claimed.

## 11. Exactly One Prioritized Next Action

**Configure the four required variables on the Vercel production project (`#177` / B6)** — `DATABASE_URL`
(the app-role **pooler** string), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`NEXT_PUBLIC_APP_URL` — then redeploy, then verify. **This must be done by the owner in the Vercel dashboard**,
because passing the values through an agent puts them on a command line. It is the only action that unblocks
B5, makes the `/api/health` probe meaningful, and gives the B1 decision anything worth exposing.

Everything else — the push, the tag, and the arbitration run — is **downstream of it** or blocked on the
GitHub billing condition.

## 12. Receiver Validation Checklist

Before editing, a fresh session must confirm:

- [ ] `docs/STATE.md` reads §7 item 53 (B6) and item 54 (this checkpoint), and §5 carries the B6 blocker.
- [ ] `main` @ `a41742f`, tree clean, **5 commits ahead** of `origin/main` — and that **nothing is pushed**.
- [ ] `git tag -l` returns **0**, and that is **intentional**, not an oversight.
- [ ] `#177` is open, `p0`, and is the top of the dependency chain.
- [ ] `#174`/`#173` are closed; `#175`/`#176`/`#16` are open.
- [ ] CI is still billing-blocked; do not re-run or bisect it.
- [ ] If any of these disagree with this record, **stop and reconcile** — the mismatch is the finding.
