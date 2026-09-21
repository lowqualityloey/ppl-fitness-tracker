<a id="TASK-m4-29-first-release-checkpoint-01"></a>

# Checkpoint Record 01 — `TASK-m4-29-first-release`

> **Boundary this record marks:** the end of a session that carried an L3 release pass (`pk:ship`),
> two L2 code cards (M4-30, M4-31), an issue-decomposition pass (`pk:issue`), and a CI triage. It is
> written so a fresh session can resume the release workstream without re-deriving it from chat.
>
> **Host capability (`POLICY_LIMITATION`):** this host can observe turn counts, **not** wall-clock
> elapsed time. The workflow's 60-minute soft / 90-minute hard checkpoints are therefore advisory
> here; the enforced trigger in practice is the ~15-turn nudge, and this session passed it.

## Identity

- **Task Record**: [`TASK-m4-29-first-release`](M4-29-first-release.md#TASK-m4-29-first-release)
- **Linked sub-tasks**: [`M4-30-health-endpoint`](M4-30-health-endpoint.md#TASK-m4-30-health-endpoint) · [`M4-31-env-validation`](M4-31-env-validation.md#TASK-m4-31-env-validation)
- **Specification**: `docs/releases/2026-09-21-v1.0.0-release-readiness.md` (`RELEASE-v1.0.0`)
- **Checkpoint state**: `handoff_ready`
- **Branch / Revision**: `main` @ `02dd673` (pushed through `5a5a0a0`; **`02dd673` is unpushed**)
- **Created**: `2026-09-21 02:55 UTC`

## Objective

Record the repository's first release — candidate revision, measured production state, blockers,
rollback runbook, and the human-only tag decision — so that "has this shipped?" stops being
answerable only from a chat transcript.

## Completed This Session

| Work | Result | Evidence |
| :--- | :--- | :--- |
| `pk:pr` → **PR #172 merged** | M4-28 slice B on `main` as `8ae6f8c`; `#164`/`#167`/`#168` all `CLOSED / COMPLETED` | PR API read; `git diff origin/main HEAD` empty before the `-D` prune |
| Post-merge sync | `main` fast-forwarded, branch pruned, `AGENTS.md` dirt committed | commits `f7eb268`, `e11e75b` |
| **`pk:ship`** (L3) | Found the repo has **auto-deployed `main` to Vercel Production since 2026-09-08** (≥100 deploys) with no tag, record, env audit or smoke test; production alias answers `302` to Vercel SSO on **every** path | 6 read-only probes; `RELEASE-v1.0.0` record, blockers B1–B6 |
| **M4-30** (`#173`) | `GET /api/health` — real `SELECT 1` ping, `no-store` on 200 **and** 503, no auth | watched red 3/3 → green 3/3; commits `12068c4`, `c5e8ed8`; issue closed |
| **`pk:issue`** | B1/B4/B5 filed as **#174/#175/#176**; B2 already tracked as #16; closing-keyword audit clean | milestone #4 `open=14 / closed=26` |
| **M4-31** (`#174`) | Startup env validation; boot **exits non-zero** naming the missing variable | commit `b44ff6c`; boot probes both directions; issue closed |
| **CI triage** | `main`'s red is **GitHub account billing**, not code — `steps: 0`, 2-second job, twice | `docs/releases/ci-triage/CI-github-35555062183.md` |

**Three defects were found by running M4-31 rather than by reading it**, and are the session's most
transferable lesson: a throwing instrumentation hook leaves the server **serving** (exit 124, not 1); a
`.min(1).url()` chain reports one misconfiguration **twice**; and three acceptance criteria the filed
issue lacked were added by measurement. All three are fixed and controlled.

## Remaining Work

- **Release not shipped.** No tag exists (`git tag -l` → 0). Correct while the candidate has no CI result.
- **`v1.0.0` is short of `linked_to_pk_ship`** — the CI record is not `verified`.
- **No production smoke probe has ever passed** — B1 prevents any probe reaching the application.

## Changed Files (this session, all committed)

- `lib/contracts/health.ts`, `src/app/api/health/route.ts`, `tests/integration/api/health.test.ts` — M4-30
- `tests/unit/api/contract-graph.test.ts`, `tests/unit/api/route-scope.test.ts` — the two closed registries the new route had to join
- `lib/env/server.ts`, `src/instrumentation.ts`, `tests/unit/infra/env-validation.test.ts` — M4-31
- `docs/releases/2026-09-21-v1.0.0-release-readiness.md`, `docs/releases/ci-triage/CI-github-35555062183.md`
- `docs/tasks/m4/M4-29-first-release.md`, `M4-30-health-endpoint.md`, `M4-31-env-validation.md`, this record
- `docs/STATE.md` — §2 board line, §3 surfaces, §5 blocker, §7 items 45–51, §8 rows

## Decisions and Invariants Locked This Session (do not undo)

1. **`/api/health` is unauthenticated and answers `no-store` on both 200 and 503.** A probe needing a
   session cannot report on a broken auth path; a cached green light has no witness.
2. **The route pings the same `getDb()` pool every other route uses.** A hardcoded 200 proves only that
   `next start` is running, which the platform already knows.
3. **An invalid environment ends the process (`process.exit(1)`), and the build phase is excluded.**
   `NEXT_PHASE === 'phase-production-build'` is the exclusion; proven by a build with `DATABASE_URL`
   emptied that succeeds.
4. **The required env set is exactly four names** — `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`. `MIGRATION_DATABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` are **deliberately not required**; requiring either would break the deploy.
5. **Validation messages never echo a value** — built from the variable name and an `issue.code`-derived
   reason, never `issue.message`.
6. **Closing keywords live in PR bodies only**, never in issue or card text (item 43's accident).
7. **`lib/db/client.ts` stays as it is** — it already throws naming `DATABASE_URL`, and
   `tests/unit/db/client.test.ts` asserts that by mutating `process.env`.
8. **No tag while CI cannot start.** A release stamp on unarbitrated code is what this pass existed to stop.
9. **The production alias is not a deployment until B1 is lifted** — it is a private preview wearing a
   production label.

## Verification / CI Evidence

- **Local gates, all green on the landed revisions**: typecheck **0** · lint **0** · unit **66 files /
  638 tests** · api **14 files / 84 tests** (preflight green) · e2e **81 passed (6.0 m)**.
- **Boot probes** (M4-31): bad → **exit 1** naming the variable; good → `Ready in 388ms`, `/api/health`
  → **HTTP 200**.
- **Build exclusion proof**: `DATABASE_URL= npm run build` → exit 0, zero `EnvValidationError`.
- **CI: no result exists for the four commits pushed after `e11e75b`.** `main`'s last CI-verified-green
  revision is **`e11e75b`**. Runs `35555062183` (`f0f5993`) and `35555468830` (`5a5a0a0`) both failed with
  **zero steps** in 2 seconds on the same account-billing annotation.

## Blockers

| ID | Blocker | Owner | Resume condition |
| :--- | :--- | :--- | :--- |
| **CI** | GitHub account billing prevented both runs from starting | **Owner** — *Settings → Billing & plans* | Billing fixed, then ACTION-001 executed |
| **B1** (`#176`) | Vercel Deployment Protection returns `302` to SSO on every path | **Owner** — Vercel dashboard | Lifted, or recorded as permanent with the release labelled non-public |
| **B2** (`#16`) | No production SMTP; magic link is the only sign-in | **Owner** | #16 closed |
| **B5** (`#175`) | Production seed content unverified | **Owner** | Read-only counts recorded |

**No unresolved scope change, stale handoff, or revision mismatch.** M4-31's deviation from its filed
issue body (`lib/db/client.ts` untouched) is recorded in that card, not silently absorbed.

## Optional Release-Evaluation Handoff

`N/A - not a PromptKit OS release evaluation` (this repository is a consumer of the engine, not the
engine itself).

## Exactly One Prioritized Next Action

**Resolve the GitHub account billing condition (Owner), then confirm
`ACTION-CI-github-35555062183-001` so the existing run can be re-executed.** Everything else in this
release workstream is blocked behind an ability to observe CI — the tag, the release linkage, and any
claim that the four unarbitrated commits are good.

## Receiver Validation Checklist

Before editing, confirm: `main` @ `02dd673`; the four Task/Release records above exist and are current;
`git tag -l` is empty; the tree is clean; and `docs/releases/ci-triage/CI-github-35555062183.md` is still
`awaiting_confirmation`. A mismatch means reconcile before editing.
