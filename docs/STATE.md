# Project State & Living Execution Tracker

## 1. Executive Summary & Current Position

- **Project Name**: PPL Fitness Tracker
- **Current Milestone / Epic**: **M4: Hardening, Telemetry & Decommission — IN PROGRESS** (§7 item 22 is its start line). M3 is closed and stays described below. **(previously the live field named M3; it had not been moved since 2026-09-12T02:00Z)** Milestone #3 reads **open=0 / closed=19** (`gh api repos/lowqualityloey/ppl-fitness-tracker/milestones/3`, read 2026-09-12). M2 remains as it was: M2-00 → M2-06 merged (PRs #43–#47, #51, #53). All of M3's build slices merged 2026-09-11 — #57/#58 (PR #69), #59 (PR #71), #60 (PR #72), #61 (PR #74), #62 (PR #75), #63 (PR #79), #64 (PR #81), #65 (PR #83), #66 (PR #85). **#67 (M3-10, the verification gate) is MERGED as PR #86 (`8704c19`, 2026-09-11T19:23Z)**, and the milestone's last open issue, **#73 (`SessionStateSchema`), is MERGED as PR #87 (`2d5edfb`, 2026-09-12T02:00Z)**. M3's exit report and M4 handoff are `docs/releases/2026-09-12-m3-exit-report-and-m4-handoff.md`; the break-each-gate evidence is `docs/tests/2026-09-11-m3-verification-audit.md` (entries 9–19). **M4 is the next milestone** — §7 item 22 is its start line. **Wave 0 is under way:** #89 (M4-00) is merged — ADR-0006 records hand-authored migration authority, `0007` ships the auth→profiles cascade — and **#105 (M4-16) is merged as PR #116**, and **#105 (M4-16) is merged as PR #116**, the first of the seven ratified spec decisions to be executed rather than carried as a comment on an issue. Milestone #4 reads **open=28 / closed=3** (`gh api repos/lowqualityloey/ppl-fitness-tracker/milestones/4`, read 2026-09-12). Nothing is in flight; no PR is open.
- **Overall Status**: ACTIVE <!-- Options: ACTIVE | PAUSED | STABILIZING | RELEASE_CANDIDATE -->
- **Target Release**: v1.0.0, no date committed
- **Current Working Branch**: `main` (PR #131 merged #125 and PR #130 merged the #121 state sync on 2026-09-13). **M4 in progress** — milestone #4 reads **open=25 / closed=6** (unchanged: #125 carries no milestone, so the count does not move)
  (`gh api repos/lowqualityloey/ppl-fitness-tracker/milestones/4`, re-read 2026-09-13 after #90's merge;
  it read 26 open / 5 closed an hour earlier, 28/3 until #80 and #100 merged as PRs #119 and #120, and
  **25 open / 6 closed now that PR #126 landed #90**). **Name the source on this number,
  because two GitHub APIs disagree on it by design**: REST's `closed_issues` counts milestone-tagged *pull
  requests* (5), GraphQL's `issues(states: CLOSED)` counts only issues (4), which is also why M3 reads
  19 on one and 12 on the other. A third path fails silently — `gh issue list --milestone "M4"` matches on
  **title**, and a mismatched string returns an empty list that looks exactly like a clean board; that is
  how "open M4 cards: 0" appeared once in this project's session log and it was wrong by 26. All 7 deferred
  spec decisions are OWNER-RATIFIED (see §7 item 23), and one of them is now *executed* rather than
  decided: #105 shipped in PR #116. **Nothing is in flight** — no open PR, no active branch (last merge PR #131 closed #125, 2026-09-13; PR #130 closed the #121 state sync) — so the
  next card starts by cutting its own branch from `main`, per this repo's one-active-branch rule. **Nothing is
  in flight** as of this `pk:checkpoint`: no open PR, and #80 / #100 / #90 are all closed.
  The SHA this field used to name is three merges behind the tree it described, which is the failure
  the rule immediately below it exists to prevent; read `git log --oneline -1` when the hash matters.
  Both M3 exit PRs remain merged (#86 → `8704c19`, #87 → `2d5edfb`) and there is no M3 work left to
  continue.

> **Do not pin the current `main` SHA in this field.** It was tried three times and went stale three times, because the merge commit that lands the correction advances `main` past the value being recorded. Describe the state, not the hash. Run `git log --oneline -1` if you need the exact commit.
- **Last Updated**: 2026-09-12 (**M3 closed**: milestone 3 `state=closed`, 19/19. #86→`8704c19`, #87→`2d5edfb`, #88→`793db53`, #113→`e9925b5`, #114→`0d221cf`, #115→`69d86cd`. **M4 started**: milestone #4 created, 24 cards filed #89–#112 + 6 parked re-milestoned; #89 (D4 migration authorship + auth-FK cascade) merged as ADR-0006. **The first of those seven ratified decisions executed**:
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

**What does not exist yet, stated plainly (2026-09-12)**: production email delivery (issue #16, deferred since M1); telemetry, Sentry, correlation ids, and the 50 rps load test (all M4, per spec §2.2); Realtime (deferred by owner decision — §5's poll-margin note says what that costs); a service worker, which means G-M3-1's "reopen with no network" is proven with the *API* dead rather than the document unfetchable (handoff §3.4 owns the difference); volume/streak analytics, body-measurement import, and export (named non-goals, each on a card). What does exist now: the full UI — dashboard, runner, history, progress, settings — with its measured claims in `docs/releases/2026-09-12-m3-exit-report-and-m4-handoff.md` §1. The legacy vanilla-JS app still runs unchanged alongside the target stack (M4's decommission, guarded meanwhile by `tests/e2e/legacy-parity.spec.ts`), and `npm run build` still emits zero JavaScript — re-verified 2026-09-11, not inherited from the old note.

---

## 2. Milestone & Task Progress

### Milestone Roadmap

- [x] **Planning**: Spec written, six decisions resolved, ADRs recorded (Complete — 2026-09-08)
- [x] **M0**: De-risk spike — RLS enforcement proven through Drizzle (Complete — 2026-09-08, **gate lifted**)
- [/] **M1**: Contracts & Seams — code, contracts, seeds, RLS, auth, and RED baseline complete; production SMTP/delivery remains deferred under issue #16
- [x] **M2**: Core Domain Engine — issues #36–#42 all merged (PRs #43–#47, #51, #53). **Complete 2026-09-11.**
- [x] **M3**: Presentation — **Complete 2026-09-12.** Milestone #3 is **open=0 / closed=19**. M3-00…M3-09 merged 2026-09-11 as PRs #69, #71, #72, #74, #75, #79, #81, #83, #85; **#67 (M3-10, the verification gate) merged as PR #86 (`8704c19`, 2026-09-11T19:23Z)**, and the milestone's last open child, **#73 (`SessionStateSchema`), merged as PR #87 (`2d5edfb`, 2026-09-12T02:00Z)** — so the milestone closed with nothing parked under it. The gate's own verdict: seven goals measured, two documented misses kept rather than relabelled, and every gate in the suite watched to fail (audit entries 9–19).
- [ ] **M4**: Hardening, telemetry, decommission the legacy static app (**Next milestone** — **the handoff is already written**: `docs/releases/2026-09-12-m3-exit-report-and-m4-handoff.md`; start at §7 item 22). **Wave 0 started:** #89 (M4-00, the D4 migration-authorship gate) is decided and implemented — ADR-0006, hand-authored model, auth-FK cascade shipped as migration `0007` — on `feat/m4-089-migration-authorship` (PR open); the 25-card breakdown is `docs/tasks/m4/`.

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
- **Legacy files that M1 reads as input** (source of seed data, do not delete before M4):
  - `push-day-workout/index.html` — 6 exercises, 17 set checkboxes, 5 stretches, hardcoded
  - `legs-day-workout/index.html` — same shape
  - `pull-day-workout/app.js:47-223` — the only module with structured exercise/stretch data arrays
- **Verification Commands** (current baseline re-measured 2026-09-12 **on merged `main` (`2d5edfb`)**, stack up; all must run inside WSL):
  - Legacy dev: `npm run dev` (3000). Target dev: `npm run next:dev` (3001).
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
    skipped** — unchanged, which is the expected result from a branch whose `src`/`lib` diff was 0 lines. **Re-measured on `eb11342`** (PR #129, #121's merge, 2026-09-13): CI `test` job **success** on merged `main` (lint 0 · typecheck 0 · `check-set-config.sh` 0 · preflight · `npm test` · `test:api` · `test:e2e` 61 passed); locally lint 0 · typecheck 0 · `check-set-config.sh` 0 · unit `latency-percentile.test.ts` **4/4** (the #121 control, watched failing on a deliberate breakage). The 50 ms paint-gate goal and the nearest-rank method are unchanged. **Re-measured on `2b1c37d`** (PR #131, #125's merge, 2026-09-13): CI `test` job **success** on merged `main` (lint 0 · typecheck 0 · `check-set-config.sh` 0 · preflight · `npm test` · `test:api` · `test:e2e` 61 passed); locally lint 0 · typecheck 0 · `check-set-config.sh` 0 · **`npm test` 46 files / 435 tests** (the require-user Scenario 4 control — a shed `getUser()` hop mapped to 503 `SERVICE_UNAVAILABLE`, watched failing on a deliberate 401 mapping — is green). No rate, budget or threshold moved. What
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
- **Known-broken**: `npm run build` (legacy Vite) — **re-verified 2026-09-11**: exits 0 and
  writes **0 `.js` files**; `dist/index.html` still references the untouched classic script
  paths. By design until M4. The route-handler suites under `tests/integration/api/` are
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
and the **rate limiters are process-local**, so N instances multiply the budget by N. A production-mode
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
- **The four Lighthouse specs fail on this machine for a reason that is now identified, and the
  mitigation in the spec cannot work because it aims at the wrong variable.**
  `tests/e2e/lighthouse.spec.ts` forces `TMPDIR`/`TEMP`/`TMP` to `/tmp` so chrome-launcher cannot
  create its Chrome profile inside the repository, and its comment records the origin of the
  Windows path as "still unidentified". It is not unidentified: `chrome-launcher/dist/utils.js`
  `makeTmpDir()` switches on `getPlatform()`, which returns `'wsl'` on this box, and the `'wsl'`
  case **overwrites `process.env.TEMP`** with `getWSLLocalAppDataPath(process.env.PATH)` — a regex
  scan of `$PATH` for `/x/Users/<name>/AppData/` — before falling through to `makeWin32TmpDir()`.
  So the spec's override is discarded by the child, and on a WSL whose `PATH` carries
  `/mnt/c/Users/…/AppData/Local/…` while `/mnt/c` is unwritable, all four Lighthouse runs die in
  `mkdir` with `EACCES` — a red suite that says nothing about the code under test. Measured on
  `feat/m4-105-drop-sync-response-state` (2026-09-12): the same four specs, same build, same
  Chromium binary, **fail** under the inherited `PATH` and **pass at 100** with `/mnt/*` entries
  removed from it. #105's e2e runs were taken with that sanitized `PATH`, which is disclosed rather
  than treated as normal; the file was not touched, because changing a gate's environment to
  retrieve green is not the same as fixing it and this is not #105's surface. What it needs is its
  own card: filter the child's `PATH` in `runLighthouse`, replace the "origin unidentified" comment
  with the mechanism above, and state the WSL prerequisite in §3's Verification Commands.
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
  What M4 still owns: this is a solo-machine number — re-measure the drain under the 50 rps load
  test, where server-side batch application has competition.
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
      The 50 rps condition the master RFC specifies is still untested, and the **rate limiters are
      process-local** (N instances = N × every budget).
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
    - **The three things whose measured reality still differs from their prose** (the 200 ms `/api/sync` miss was resolved by #92 — re-documented to the measured ~203–413 ms p95 band + enforced 800 ms ceiling, not relabelled): the process-local limiter, G-M3-3's margin being the 4 s poll interval rather than engine speed, and the missing service worker — G-M3-1's "reopen with no network" is proven with the *API* dead, not the document unfetchable.

---

## 8. Session Continuity Log

| Date | Engineer / Agent | Milestone / Focus | Key Changes & Artifacts |
| :--- | :--- | :--- | :--- |
| 2026-09-08 | Owner + Kiro | Codebase review | Full read of legacy app. Found: production build emits zero JS (verified by running it); dashboard metrics fabricated from `getDay()` and `Math.random()`; `legs` phase gating stubbed to `return true`; documented `AuthManager` unreachable; pull-day set persistence writes to a single `"undefined"` key; zero `aria-*` attributes in `push-day-workout/index.html`. |
| 2026-09-08 | Owner + Kiro | `pk:plan` | Wrote `docs/specs/2026-09-08-spec-fullstack-migration.md`. Flagged that Next 14 + React 19 is invalid, that Drizzle bypasses Supabase RLS by default, and that `DESIGN.md`'s focus ring fails WCAG. Six decisions raised for sign-off. |
| 2026-09-08 | Owner + Kiro | Decisions + ADRs | All six resolved. Spec revised end-to-end for Supabase Auth. ADR-0001…0005 written. While writing ADR-0003, found two holes in the tenancy test gate and the `set_config` `is_local` leak — both now covered in M0. Deleted `DESIGN.md:Zone.Identifier`. |
| 2026-09-08 | Owner + Kiro | Context sync | Filled `PROMPTKIT.md` and this file — both were still PromptKit placeholder templates asserting an "Acme Dashboard" monorepo, `pnpm`, and a blocked Milestone 2. |
| 2026-09-08 | Owner + Kiro | Node runtime | Filed a Node-version blocker, then found it was overstated: interactive shells were already on Node 24 via the `.zshrc` nvm PATH prepend; only non-interactive shells resolve `/usr/bin/node` v18. Installed v24.20.0 LTS as nvm default and documented the explicit-source command form in `PROMPTKIT.md` §3. No dotfiles modified. |
| 2026-09-08 | Owner + Kiro | `pk:spike` (M0) | Built `spikes/m0-drizzle-rls/` against the local Supabase stack. **32 assertions green; ADR-0003 confirmed, M1 unblocked.** Five things the spec had wrong or missing, all now folded back: `auth.uid()` checks the legacy singular GUC *first*, so `withUser` as specified could be silently overridden into reading another user's row; `GRANT USAGE ON SCHEMA auth` as `postgres` returns success and does nothing; the app role needs no `auth` access at all, so least privilege is stricter than assumed; `FORCE ROW LEVEL SECURITY` does not stop `postgres` because `BYPASSRLS` wins; role attributes cannot be re-`ALTER`ed by an idempotent migration. Also: Postgres is 17.6, not 16. Added a mutation check after realising a green suite proves nothing — it immediately caught that the idempotent DDL was healing every mutation before assertions ran. Measured the ADR-0003 cost (+1.29 ms p50 direct, +1.98 ms pooled), closing an open risk. ADR-0003 amended (A1), spec §4.2/§6/§8 updated. |
| 2026-09-08 | Owner + Kiro | `pk:tasks` (M1) | Decomposed M1 into 16 atomic 1–4h issues across scaffold/infra, schema/RLS/data, auth, and contracts tracks, ~45h total. Dispatched a context-gatherer to pin down the legacy exercise/stretch data precisely (file:line for all 18 exercises across the three legacy sources) rather than estimate — found the stretch count is not simply additive: 15 raw entries across push/legs/pull but only 13 unique concepts, since "Child's Pose" and "Cat-Cow Stretch" are each duplicated verbatim across push-day and pull-day. Split seeding into two issues (`M1-09` exercises, `M1-10` stretches) specifically so that dedup decision gets its own review rather than being buried. Every issue's AC traces back to a spec section, ADR, or a named M0 spike finding — `M1-04`/`M1-11` exist specifically to port the spike's verified `app_authenticated`/`withUser` patterns rather than re-derive them from the spec's original (incomplete) sketch, and `M1-07`/`M1-08` port the drift test and tenancy gate with their negative controls intact. Full breakdown at `docs/tasks/2026-09-08-m1-contracts-seams-tasks.md` plus 16 files under `docs/tasks/m1/`. |
| 2026-09-08 | Owner + Kiro | Merge + issue filing | PRs #2, #19, #20 merged to `main`. The spec, ADRs, M0 spike and M1 task specs went onto the default branch **before** issues were filed, so the repository paths their bodies cite resolve on GitHub rather than 404ing for anyone reading the issue. Created 11 `area:*`/`priority/*` labels (none existed — the repo had only GitHub's defaults), milestone `M1: Contracts & Seams`, and filed all 16 M1 issues as **#3–#18**. Issue numbers written back into the task doc's dependency graph and §2 here, so the local specs and the board cannot drift apart silently. Learned the hard way that recording `main`'s SHA in §1 is self-invalidating — the merge that lands the fix moves the branch. §1 now describes state instead, with a note saying why. |
| 2026-09-08 | Owner + Kiro | `M1-01` implementation | Scaffolded Next.js 16 + React 19 + TS strict at the repo root (issue #3), coexisting with the legacy Vite app rather than replacing it — target stack on port 3001, legacy stays on 3000, verified both running at once with no collision. Used `create-next-app` into a scratch directory rather than the repo root, since its own conflict scanner refuses to run against a directory containing the legacy files, then merged the generated config in by hand. Found and closed 3 `npm audit` findings (moderate/high/critical) in `create-next-app`'s own dependency set by bumping `vite` to `^7` and `vitest` to `^5`. Found that `npx tsc --noEmit` fails on a fresh checkout with a misleading error because `LayoutProps` is generated into `.next/types` by Next.js itself — fixed by running `next typegen` first in the `typecheck` script, documented in `PROMPTKIT.md` so it isn't rediscovered. Verified strict mode actually rejects an implicit `any` (not just declared), verified the legacy build's zero-JS defect is untouched, verified lint/typecheck/build/test all pass from a clean install. Opened PR #22, not yet merged. |
| 2026-09-08 | Owner + Kiro | `M1-01` merge | PR #22 merged, issue #3 closed. Re-verified on `main` with `npm ci` rather than trusting the pre-merge branch check — typecheck, lint, build, test, the legacy regression check, and a fresh `npm audit` all clean. `STATE.md` synced directly to `main` (pure status update, no code risk, skipped the branch/PR ceremony). |
| 2026-09-08 | Owner + Kiro | `M1-02` implementation | Provisioned the local Supabase stack for the real app (issue #4), mirroring the M0 spike's setup rather than reusing its throwaway sandbox — `supabase init` at the repo root, pooler enabled on 54329, CLI pinned as a devDependency at the spike's exact version (2.117.0) instead of a global install. Wrote `.env.example` (placeholders, committed) and `.env.local` (real local values, confirmed gitignored via `git check-ignore`, not assumed). `DATABASE_URL` routes through the pooler to match production; `MIGRATION_DATABASE_URL` connects directly as owner. Found the task's own Scenario 3 was wrong: connecting as `app_authenticated` before `M1-04` creates it fails with "password authentication failed," not "role does not exist" — Postgres checks the password before revealing role existence. Confirmed the role really is absent via `pg_roles` on the owner connection, then corrected the task file rather than leave a misleading expected-error string for later. Verified `MIGRATION_DATABASE_URL` reports `current_user = postgres`; verified no secret reaches a committed file; verified `typecheck`/`lint` unaffected. Stopped the stack after verification, no lingering containers. Merged as PR #23. |
| 2026-09-08 | Owner + Kiro | `M1-11` implementation + CI stand-up | Ported `withUserHardened()` from the M0 spike into `lib/db/with-user.ts` as `withUser()` — the two-GUC pattern (blank `request.jwt.claim.sub` before seeding `request.jwt.claims`) that closes the A1.1 hazard. Deliberately left `withUserLeaky()` out of application code; it exists only as a negative-control fixture in tests. Wrote `tests/unit/with-user.test.ts` (6 assertions) as a **GUC-only** regression suite — reads `current_setting()` directly rather than querying a table, so it needs no grants from migrations outside this PR's scope and runs in under 100ms. Added `docs/SECURITY-CHECKLIST.md`, an ESLint `no-restricted-syntax` rule, and `scripts/check-set-config.sh` to ban direct `set_config` calls outside the helper. Also stood up `.github/workflows/test.yml` from scratch, since no CI had run this suite before — which surfaced four unrelated pre-existing problems the first real CI run exposed: (1) the Supabase CLI install step used a broken `curl \| sh` installer, fixed to `npx supabase` from the pinned devDependency; (2) several test files had strict-mode TypeScript errors (array-index `T \| undefined`, implicit `any`, a wrong enum literal, a missing required column) that had never been typechecked in CI; (3) `MIGRATION_DATABASE_URL` was pointed at the pooler (54329), which needs a tenant identifier a bare owner connection doesn't carry — direct connection is 54322 per `.env.example`; (4) a **genuine test-isolation bug**: integration test files share one local Postgres and overlapping fixture rows (e.g. `routine_days` slug `test-push`), and running files in parallel workers let one file's cleanup race against another's read, causing intermittent FK-violation and row-count failures with nothing to do with the code under test — fixed with `fileParallelism: false` in `vitest.config.ts`, verified via three consecutive clean runs. Found along the way that `tests/integration/rls-user-data-tables.test.ts` (M1-06, swept in from an earlier uncommitted branch state) references column names from a stale schema draft; descoped it from this PR rather than fix 17 assertions against the current schema as an incidental to a database-helper PR — kept on disk, untracked, for its own fix pass. PR #28 merged; because the branch had been stacked on `m1-05-rls-content-tables` rather than on `main`, the merge fast-forwarded `main` through the whole chain (M1-05, M1-07, M1-08, M1-11 together). Closed issues `#6`, `#7`, `#9`, `#10` retroactively — all four were actually done and verified on `main`, but their PRs never said "Closes #N" so they'd sat open. `#8`/M1-06 stays open: migration is on `main`, verifying test is not. |
| 2026-09-08 | Owner + Kiro | `M1-12` SSR auth seam | Implemented Supabase SSR authentication and merged PR #29. Added exact-pinned `@supabase/ssr@0.12.6` and `@supabase/supabase-js@2.116.0`; `lib/supabase/server.ts` uses the current `getAll()`/`setAll()` cookie API only, `src/middleware.ts` refreshes sessions with `auth.getUser()`, and `requireUser()` resolves the sole authoritative application-layer user ID through a verified server-side Auth call (never request body/query/JWT hand-decoding). Added a minimal typed 401 `AppError` seam in `lib/contracts/envelope.ts` for M1-15 to extend. Because Next `cookies()` throws outside a request context, the integration suite injects a test-only cookie-jar-backed client while still exercising a real GoTrue sign-in and `@supabase/ssr` cookie serialization — 3 tests cover the valid session, missing session, and spoofed body-user-ID cases. First CI run uncovered Node 20 lacks native `WebSocket`, required by Supabase JS's bundled realtime client despite realtime being unused; bumped workflow to Node 24 (matching local dev). Second run green: typecheck, security gate, 81 tests, Vercel. Issue #14 auto-closed through `Closes #14` in the PR body. |
| 2026-09-08 | Owner + Kiro | `M1-06` user-data RLS verification | Repaired the stale, untracked verifier and merged PR #30. The new `tests/integration/rls-user-data-tables.test.ts` authenticates three real GoTrue users by password grant and executes application operations as non-owner `app_authenticated` through the hardened two-GUC `withUser()` helper. It checks RLS/FORCE plus exactly four per-verb policies and DML grants on all seven user-data tables, owner CRUD, cross-user read/update/delete filtering, rejected cross-user inserts and profile rekeys, and—after behavioral review exposed the gap—rejected reassignment of an owned row to another user or task to another user's session, with owner-side postconditions proving data remained intact. Fixture teardown now removes domain data/profiles before Auth users (profiles has no physical FK to `auth.users`) and removes the fixed content parents. PR CI green: Test Suite, Vercel, Vercel Preview Comments; local final run 9 files / 87 tests. Issue #8 auto-closed via `Closes #8`. |
| 2026-09-08 | Owner + Kiro | `M1-13` magic-link auth checkpoint | Implemented and merged PR #31 (`5548d57`), closing issue #15. Added exact-pinned `zod@4.5.4`, email-only `/sign-in`, `POST /auth/signin`, and `GET /auth/confirm`. The callback validates `token_hash` and `type=email`, calls Supabase `verifyOtp` through the existing SSR server client so session cookies remain HttpOnly/SameSite-managed, and permits only the current internal `/` destination. Sign-in initiation returns a generic response to avoid account enumeration and applies a per-process sliding-window limiter keyed by a platform-provided address header rather than arbitrary `X-Forwarded-For`; shared atomic storage is still required before horizontal production scale. Local GoTrue was corrected to the Next origin on port 3001, and its magic-link template consumes the per-request redirect target. Real local GoTrue token-hash → SSR-cookie → `requireUser()` coverage, redirect/limiter tests, typecheck, targeted lint, `check-set-config`, full suite (11 files / 91 tests), and `next build` passed. Remaining auth risks are external SMTP/domain delivery (#16) and canonical contract consolidation (#17); no production email-delivery claim is made from local capture tests. |
| 2026-09-08 | Owner + Kiro | `M1-15` canonical contracts | Added `lib/contracts/` modules for the shared AppError/envelope, auth, sync, sessions, exercises, progress, and legacy import boundaries; retained M1-13 lower-camel auth schema exports through compatibility re-exports. Sync covers all four discriminated mutations, 0–1000 nullable weight/reps with `numeric(6,2)` precision, a 200-mutation cap, and non-negative server sequence. Legacy import accepts raw localStorage values per key, tolerates malformed siblings for partial reporting, accepts the documented optional push timestamp and ignored `userStats` key, and has focused unit coverage. Targeted tests (13), typecheck, targeted lint, and diff checks pass. Full `npm test` remains blocked by missing local Supabase environment credentials; repository-wide lint retains unrelated pre-existing `any` errors.
| 2026-09-08 | Owner + Kiro | `M1-16` RED route-handler tests | Created the HTTP integration harness and suites for all 9 endpoints. Real SSR-cookie Supabase fixtures are used without request-provided identities or token storage. Fixed test-server process-group cleanup, the local anon-key fallback, and the M1-15 contract graph's Next/Turbopack-incompatible relative `.js` imports. Validation is clean (`npm run typecheck`, targeted ESLint, diagnostics); the RED baseline is 22 missing-handler 404 failures plus the existing M1-13 callback validation pass across 23 tests. Artifact: `docs/tasks/m1-red-baseline.txt`. |
| 2026-09-08 | Owner + Kiro | `pk:checkpoint` — M2 handoff | Synced the tracker to `feat/m2-core-domain-engine` and the completed-but-uncommitted M2-00 foundation: runtime `DATABASE_URL` Drizzle client, shared DB/transaction types, verified auth-to-RLS context, session domain mappers, and user-scoped `WorkoutRepository`. Recorded the deferred migration-journal, auth-profile-FK, session-delta, `deviceId`, and `server_seq` risks; replaced stale M1 next actions with the required retroactive M2 `pk:plan` → `docs/tasks/m2/` → GitHub issue sequence; retained SMTP issue #16 as deferred. Validation evidence and zero-loss handoff are in the session response; no commit, push, discard, or stash was performed.
| 2026-09-08 | Owner + Kiro | M2 planning + `pk:commit` | Formalized M2 in `docs/specs/2026-09-08-m2-core-domain-engine.md`; created atomic task artifacts under `docs/tasks/m2/`; created milestone `M2: Core Domain Engine`; filed #36–#42; fixed and tested cursor validation, duplicate-start race recovery, two-user repository isolation, concurrent starts, pagination, and runtime DSN selection. Committed planning as `10da008` and M2-00 foundation as `223e2b8` (`Closes #36`). M2-01 sessions routes/fixtures are next; issue #16 remains deferred.
| 2026-09-08 | Owner + Kiro | `M2-01` sessions API | Implemented `GET/POST /api/sessions` and `GET /api/sessions/:id` through verified Supabase auth, explicit user-scoped `WorkoutRepository`, `DATABASE_URL`, and RLS; added shared AppError/Zod/conflict/not-found translation; added deterministic owner/cross-user fixtures through `MIGRATION_DATABASE_URL`; and expanded the API suite to 12 passing tests plus five route-error unit assertions covering list isolation, cursor validation, idempotent starts, malformed input, unauthenticated reads, full-state `since` compatibility, and cross-user 404. True sync deltas remain deferred to M2-04; issue #16 remains deferred.
| 2026-09-08 | Owner + Kiro | `M2-02` SessionEngine | Implemented the pure lifecycle transition table (`pre_workout → exercise ↔ rest → stretch → post_workout`), warm-up/main-set/stretch gates, typed lifecycle errors, user-scoped transaction mutation context, set/task upserts, phase advancement, completion, terminal protection, and forced rollback coverage. No schema, sync, device, PR, route, UI, SMTP, or legacy changes; true sequence/device semantics remain deferred to M2-04. |
| 2026-09-08 | Owner + Kiro | `M2-03` ProgressionEngine | Implemented pure Epley e1RM calculation with two-decimal rounding, nullable/zero/incomplete policy, numeric storage bounds, transaction-scoped personal-record recomputation, deterministic ties, insert-if-absent race handling, edit-down recomputation, app-role ownership isolation, and set/PR rollback coverage. No schema, route, sync, device, UI, SMTP, or legacy changes; M2-04 remains next. |
| 2026-09-08 | `M2-04` sync review + validation | Closed semantic-review gaps: terminal replay now locks readable terminal sessions, mixed-session batches fail at the Zod boundary, foreign mutation-ID collisions use a generic rejection, legacy set fallback is regression-tested, ordering uses explicit lowercase lexical comparison, and sync metadata RLS validates owned sessions and mutation rows. Targeted typecheck, lint, unit, repository, HTTP, RLS, and schema-drift gates are green; final non-API regression and PR delivery remain. |
| 2026-09-09 | Owner + GitHub | `M2-04` merge | PR #47 merged to `main` as `0546f7b`, after #43–#46 landed M2-00 → M2-03. `feat/m2-05-legacy-importer` cut from that tip. Recorded from git history at re-scan time, not from this session's actions — no work was performed on the importer. |
| 2026-09-11 | Agent (DSH, `pk:onboard`) | Brownfield re-ingest + gate audit | Re-scanned the repo against its own profile and corrected the drift rather than regenerating it. **Verified**: `typecheck` exit 0; `npm run lint` **exit 1** (24 errors / 2 warnings, four integration test files, and **no lint step in `test.yml`**); `npx vitest run tests/unit` **67 pass / 6 fail**, all six from `tests/unit/with-user.test.ts` needing live Postgres; legacy `npm run build` still exits 0 emitting **0 `.js` files**; `_journal.json` covers `0000`–`0003` while `0004`–`0006` are hand-authored; `playwright.config.ts` names an absent `tests/e2e`; Supabase stack stopped, Docker `29.7.2` reachable; local `main` ref stale vs `origin/main`. Clean on: zero `TODO/FIXME`, zero `: any` in `src/`+`lib/`, zero empty `catch {}`, `strict` + `noUncheckedIndexedAccess`, working tree clean, secrets ignored. **Corrected**: `PROMPTKIT.md` banner (mid-migration is now backend-vs-frontend, not unbuilt), §2 stack status and testing reality, §3 Node-resolution table (v18 only under a stripped environment), §3 commands (migrations/seeds/mutation exist; lint red; API suites outside CI; journal mixed-authority warning), §1–§8 here. **Added**: `docs/tasks/2026-09-11-intake-debt-index.md` — D1 lint gate absent, D2 non-hermetic unit layer, D3 phantom E2E config, D4 journal gap, D5 route suites outside CI, each with Gherkin AC and a fix shape, plus a non-findings list so the next intake does not re-run them. `DESIGN.md` skipped: already a real token profile with ADR-0004/0005 deviations, not a template. No commits, pushes, or `pk:tasks` issue filing performed — that is offered, not assumed. |
| 2026-09-11 | Agent (DSH) | Gate follow-through: D5 + D1 implemented | Ran the gates for real. Started the local stack (needed a widened file sandbox: the CLI writes `~/.supabase`), then found `npm run test:red` reporting 21 failures / 20 skips. Root-cause chain, each step disproving the last: `MIGRATION_DATABASE_URL` missing → whole files reported **skipped**, not failed (a `beforeAll` throw, so the "intentionally RED" framing had been hiding 13 suites that actually pass); with env loaded, `/api/sessions` + `/api/sync` returned blanket **HTTP 500**, which looks exactly like an M2-04 regression; the real cause was `.env.local` still holding `REPLACE_IN_M1-04` as the app-role password — a credential `supabase status` cannot supply because migration `0001` creates the role with its own literal. Supavisor had escalated to `ECIRCUITBREAKER`. **With the credential corrected: sessions 12/12 and sync 7/7 pass; `npm test` is 23 files / 196 tests green** — the first full local pass this repo has had, and evidence the merged M2 backend is sound. Implemented **D5** on branch `test/ci-gates-d1-d5` -> **PR #48** (CI runs `test:api`; env to job level; `scripts/preflight.ts` distinguishes env-broken from code-broken and compares the credential by SHA-256 prefix without printing it; `pending-handlers.ts` declares the 11 unbuilt-handler specs as counted, issue-attributed skips; `tests/unit/api/pending-handlers.test.ts` fails if a pending entry's route later appears; `fixtures.ts` throws at module scope so a missing credential can never read as a skip again; `.env.example` template corrected — it advertised a non-tenant-qualified username and pointed at `db:status`, which cannot answer). Implemented **D1** in the same PR (22 casts → `tests/integration/pg-error.ts` narrowing helpers rather than a fake error type, so a wrong SQLSTATE still fails; 2 unused bindings dropped; `--max-warnings=0`; CI `Lint` step). **Negative controls run for both new gates**: stripped env → API file fails loudly; scratch `const probe: any` → lint exit 1, removed → exit 0. Verification: lint 0/0, typecheck 0, `test:api` 20 pass / 12 skip, 4 edited security suites 32/32. Found but not fixed: **D6** `next dev` rewrites tracked `tsconfig.json` during API runs (reverted); **D7** `pg`'s default generic leaves the integration suites on *inferred* `any` rows — real strictness work, filed rather than smuggled into a lint commit. **Branch topology**: the two gate branches were combined onto `test/ci-gates-d1-d5` as two commits and opened as **PR #48** — a `package.json` conflict (adjacent `lint` and `test` script lines) resolved by hand as the union of both, `test.yml` auto-merged cleanly, and the combined branch re-verified at lint 0 / typecheck 0 / tree clean. SHAs were deliberately not quoted: one branch had already moved under them when it was rebased to drop an accidentally-included commit, which is the same reason `docs/STATE.md` §1 refuses to pin `main`. **On merge, refresh the docs**: `PROMPTKIT.md` §3's lint and API-suite paragraphs and §3/§5 here describe `main`, which stops being true the moment these two land; and the M2-05 importer will want D4 resolved first if it needs a migration at all. |
| 2026-09-11 | Agent (DSH) | Post-merge gate refresh | #48 and #49 merged. Local `main` fast-forwarded (0 unique commits), `feat/m2-05-legacy-importer` re-pointed at it. **Verified, not assumed**: `npm run lint` exit 0 on merged `main`, and both push-triggered `main` Actions runs green (4m32s, 4m40s) — which retires the last evidence caveat from #48: the `Lint`, `Preflight` and `Run API route-handler suites` steps have now executed on the default branch, not only on a PR branch. Corrected prose written mid-flight: `PROMPTKIT.md` §3 lint bullet (RED → exit 0, warning-fatal, gated) and its API-suite bullet (outside the gate → inside it, pending handlers declared individually), plus STATE §1/§3/§5/§7 wording about unmerged branches; debt-index D1/D5 rows now read CLOSED. Docs only, no behavior change. **Next**: M2-05 — check D4 before any `db:generate`; its 5 specs are declared pending against #40, so the last task is deleting that entry. |
| 2026-09-11 | Agent (DSH) | `M2-05` implementation | Built the legacy importer end to end on `feat/m2-05-legacy-importer` and deleted the `importLegacy` declared-pending entry; the anti-rot guard was **observed failing at the moment the route appeared**, which is the control working rather than the test being annoying. **No migration was needed** (D4 never entered): `import_batches` ships in `0000` with RLS from `0003`, and its `unique (user_id, source_fingerprint)` is the idempotency key. Dispatched a subagent to inventory the legacy `localStorage` **write sites** instead of trusting the RFC, and three code decisions came out of that: (1) real browsers key pull day's collapsed checkbox as `""`, not the `"undefined"` the RFC records — and because `BooleanMapSchema` requires `z.string().min(1)`, **a genuine browser payload failed validation entirely**, which would have reported real history as malformed; the sentinel is now stripped before parsing and the loss is reported, and the RFC row carries an erratum. (2) legs writes a complete DOM snapshot to `checkboxStates` while `state.*` is sparse, so the snapshot wins. (3) push's `timestamp` is the *last save*, not the session start, and `phaseCompletion` is dead data that is never assigned `true`. It also confirmed `userStats` was never written at all (the dashboard derived streaks from day-of-week and `Math.random()`), and that no legacy payload captured weight, reps, RPE, or actual rest — so those columns stay NULL and the report says so rather than backfilling them from plan templates. Two fabrications this module refuses: a session from a payload recording no interaction (pull saves during load paths, so an all-`false` payload is a page visit), and per-set rows for pull day. **Atomicity**: `client_id` is derived from the fingerprint, so a concurrent twin collides on the unique index and replays the winner's report instead of doubling history; a batch that writes nothing raises rather than persisting an empty fingerprint, which would make every later retry replay nothing even after seeds were fixed. Verified: lint 0, typecheck 0, `npm test` **25 files / 225 tests**, `test:api` **25 pass / 7 skip**, `test:mutation` exit 0, and the new seams measured separately (22 domain, 9 persistence). The persistence spec includes a forced mid-transaction failure proving rollback and a live-session-unchanged check, because "no irreversible deletion in the server path" is otherwise an absence claim nobody can read off a diff. **Trap, second occurrence in this repo**: a `from './types.js'` specifier inside `lib/` passes `tsc` *and* vitest while Turbopack cannot resolve it, so every request to the new route 500s at compile time with the entire local suite green — M1-16's row above records the same bug in the M1-15 contract graph. Now a standing rule in `PROMPTKIT.md` §6; the discovery route was `curl`, not the test suite. Also learned: the API import suite calls `seedExercises()` in `beforeAll` because **CI has no seed step** and the importer maps `ex1`…`ex6` onto seeded content — without that call the route fails as "no seeded content", a config problem dressed as a server error. `tsconfig.json` was rewritten by `next dev` during these runs (D6, still open) and reverted. |
| 2026-09-11 | Agent (DSH) | Post-merge refresh after #51 | PR #51 merged (issue #40 closed); local `main` fast-forwarded from 4-behind/0-ahead. **Verified on the merged tip rather than trusting the PR's own run**: `test:api:preflight` 4/4, `npm run lint` exit 0, `npm run typecheck` exit 0, `npm test` **25 files / 225 tests**, `npm run test:api` **25 passed / 7 declared-skipped**, and `main`'s own Actions run for that merge commit green at 5.1m — the fifth consecutive green run on the default branch, which is the point of the D5 gate rather than a coincidence. Corrected the prose that the merge invalidated: §1 milestone/branch/gate-status, §2 roadmap row **which still said `M2-05 importer active-but-unstarted`** and its `#40` task checkbox, §3 active-slice line plus the merged-surface list (now naming `lib/domain/import/` and `src/app/api/import/legacy`), §5 blockers and the D4 note, §7 (rewritten and renumbered 1–8), and `PROMPTKIT.md` §2's stack heading and §3's API bullet. Also fixed two things I had written myself hours earlier: §7 carried duplicated list numbering plus a broken parenthetical left by a clumsy in-place edit, and the D4 line still framed a trap as pending for a slice that had already landed — the honest wording is that **a trap never firing is not the same as it being disarmed**. `tsconfig.json` was rewritten by `next dev` for the third time this session (**D6**, still open); this time the diff was inspected rather than assumed — it is pure reformatting (arrays re-wrapped, one glob pattern appended), reverted, not committed. Nothing in this row is a behavior change: docs only, no source touched. **Next**: `#42`/M2-06, carrying two facts forward — API suites depend on seeded routine content that CI does not create, and `test:mutation` must be run with `.env.local` sourced. |

| 2026-09-11 | Agent (DSH) | `M2-06` merge + `pk:checkpoint` | PR #53 merged (`ce1c5d9`), issue #42 closed — **M2 complete**. Local `main` fast-forwarded, full gate set re-measured on merged main (lint/typecheck 0; `npm test` 24 files/217; `test:api` 7 files/40 passed/0 skipped; mutation exit 0; preflight green). §1/§2/§3/§5/§7 now describe the merged world, §3 records the "on merged main" warrant defect that existed while #53 was open, and §7 item 9 points the next session at M3 planning. Handed forward: prod-mode p95 measurement, process-local limiters, six superseded local branches awaiting your word, D3/D4/D6/D7 unfiled, issue #16 still deferred. |
| 2026-09-11 | Agent (DSH, `pk:plan`) | M3 Presentation RFC | Researched M3 inputs directly after three parallel inventory subagents all failed with no output (noted so the next session does not trust that pattern here). Findings that changed the plan: Realtime is **structurally unavailable** — 66 RLS policies are `TO app_authenticated`, one `TO public`, zero `TO authenticated`, and no table is in `supabase_realtime`; `GET /api/sessions/[id]` accepts `since` and discards it under a comment claiming M2-04 shipped deltas; `preferredUnit` exists as a column but nothing reads or writes it and no prefill code exists anywhere; the repo has **no** Tailwind/shadcn/Radix/TanStack installed; `tests/e2e/` does not exist. Measured contrast on the palette: `--accent-pull #fb6514` is 3.01:1 on white and **2.88:1 on `surface #f9fafb`** — it fails SC 1.4.11 on the app background, while `--accent-push` measures 4.84:1 (confirming ADR-0004's ≈4.8 claim) and `#ecf3ff` re-measures 1.12:1. Owner decided: poll-first sync channel, `--accent-legs #7a3ff2`, backend gaps as M3-00, Tailwind+shadcn+TanStack. Legacy keys inventoried (`pushWorkoutProgress`, `legsWorkoutProgress`, `pullDayProgress`, `userStats`, `guest_mode`) — the last two have no import path and are named rather than buried. Docs-only change; no gates re-run for it beyond `git diff --check`. |
| 2026-09-11 | Agent (DSH) | M3 RFC merged + grilling pass | PR #55 merged (`d146460`), local `main` fast-forwarded; ran the `pk:plan` §7 gate before any M3 code. **Grilling found four defects in my own RFC** and they are recorded in §8 of the spec rather than quietly fixed: (1) the outbox could not express session start — `lib/contracts/sync.ts` has no `session.start` op, so G-M3-1 described an impossible flow; decided that Start requires connectivity while everything after it stays offline-capable, a named deviation from the master RFC's G5; (2) item-level `applied[]`/`rejected[]` means FIFO is not a transaction, so any rejection now forces a full authoritative refetch instead of surgical rollback; (3) the 5 s cross-device SLA depends on M3-00's real `since` deltas as a **hard prerequisite**, and poll cadence must stay under ~40% of the 120/min budget M2-06 just shipped; (4) two tokens for one meaning was the wrong accent fix — `--accent-pull` is redefined to the measured-passing value and `#fb6514` becomes `--accent-pull-bright`, decorative only. Also found: **the `pk:grill` trigger has no workflow file here**, so the drill ran manually against `plan.md`'s standards. Docs-only change; `git diff --check` clean, no gates re-run. |
| 2026-09-11 | Agent (DSH, `pk:tasks`) | M3 decomposition | PR #56 merged (`a989317`), local `main` fast-forwarded. Created milestone #3 (M3: Presentation) and eleven slice cards in `docs/tasks/m3/` published as issues **#57–#67** — each with invariants, out-of-scope, Gherkin happy/negative/boundary scenarios, and an automated verification command; plus `docs/tasks/m3/README.md` with the dependency map. Recorded a deliberate deviation from the workflow's 1–4 hour sizing rule: these are one-PR-sized slices, matching how M2's #36–#42 were actually executed, because finer units would not be independently reviewable. §2 lists the slices, §3 points at the plan, §7 item 11 closed and item 12 added (start #57/#58). **No M3 code written.** Open house-keeping: milestones #1 and #2 are still `open` although M2 is complete and M1's only live item is deferred #16. |
| 2026-09-11 | Agent (DSH, `pk:checkpoint`) | M3-00/M3-01 started, checkpointed mid-flight | PR #68 merged (`a11d70c`), main CI success, `pk:tasks` done (milestone #3, issues #57–#67). Began #57/#58: wrote `lib/contracts/profile.ts` and extended the sessions contract with prefill + `SessionNotModifiedSchema` and the `since` rule. **A checkpoint caught the work being edited directly on `main`** — the four files moved to `feat/m3-00-m3-01-client-reads` and committed as `14b8be2`, contracts-only, explicitly labelled unverified. Found and avoided a genuine import cycle (`sync.ts` → `sessions.ts` → `sync.ts`) by hoisting the two scalar schemas into `common.ts`, which also put their bounds next to the matching CHECK constraints. Also caught a measurement bug of my own: the first typecheck run reported success through `npm run typecheck | tail`, where `$?` is `tail`'s status — re-measured with a real exit code, still 0. Working tree now clean; nothing user-facing exists. |
| 2026-09-11 | Agent (DSH) | M3-00/M3-01 (#57/#58) implemented | Finished the checkpointed branch test-first: contract unit specs (23 in `contracts.test.ts`), then `ProfileRepository` + `GET/PATCH /api/profile`, then `getSessionServerSeq`/`getPrefill` + `GET /api/sessions/prefill`, then the real `since` short-circuit with the stale discard and its false comment deleted — each API spec watched **RED against the absent route before green** (profile 7/7 failing; prefill failing exactly where the `[id]` shadow was predicted). **The committed contract was found broken mid-work**: `z.enum(['kg','lb'])` claimed to mirror the DB and the mirror was `('kg','lbs')` (schema `:29`, migration `0000:5`, live `pg_enum` query) — shipped as written it would 400 the only valid pound value and 500 the guessed one at the enum cast; corrected to the DB literal, pinned by unit + route specs, RFC §4.1 erratum + §8.7 recorded, §4 item 24 locked. A `not.toContain('500')` isolation assertion flaked once on random UUID hex on a full API run — replaced with a field-level assertion; the cited green is post-fix, and the earlier flaked run is recorded rather than quietly re-run until it passed. Also shipped `tests/unit/api/contract-graph.test.ts` (routes as contract adapters; bans local `z.` shapes and the deleted comment's return — it caught this agent quoting the forbidden string in its own doc comment). M3-00 card task 3 measured, not assumed: `EXPLAIN (ANALYZE, BUFFERS)` at 83 user-wide sessions / 40 target-day / 54 sets per session / 241 sessions + 4 489 set rows DB-wide — day lookup **0.049 ms, 3 shared buffers** via `session_history` (incremental sort), set lookup **0.111 ms, 5 buffers** via `set_natural_key`; **decision: no new index**, plans and rationale in the PR. Measured gates: lint 0, typecheck 0, set-config 0, unit 25/236, API 10/60. D6 fired twice (`next dev` rewrote `tsconfig.json` both directions: once before the API suites, once at typegen) and was reverted both times — still open, re-check before every commit. Delta bytes recorded from the assertion's own log: full=2 035 B, notModified=53 B (~38×). Two atomic commits, PR open closing #57/#58, stopping at review per protocol. |
| 2026-09-11 | Agent (DSH) | PR #69 merged — post-merge sync | Owner merged **#69 (`8d2b696`)**; CI `test` **pass (5m53s)** on the merged tree, so #69's locally-measured gates became actual gates rather than claims. Issues **#57/#58 auto-closed**; local `main` fast-forwarded. Closed GitHub **milestone #2 (M2)** — zero open issues, the housekeeping §8 had flagged; **milestone #1 deliberately stays open** (its one live item is deferred #16, custom SMTP — the tracker forbids describing it as complete). §1/§2/§3/§5/§7 updated to merged state; §7 item 13 queues **#59 (M3-02)**. Docs-only change; `git diff --check` clean, no code gates re-run. (Merged as **#70 (`7ff33af`)** — §1's row here was written by its author and held true.) |
| 2026-09-11 | Agent (DSH) | M3-02 (#59) implemented | UI foundation on `feat/m3-02-design-tokens` (branched from `1185f8f`, already in `main` via #70, so the PR carries only #59 work). **Ran the real `pk:design` workflow** (`.promptkit/workflows/design-system.md` — it *does* exist; the trigger with no file is `pk:grill`, and a mid-session chat claim got that backwards before being checked and corrected): its 44px touch-target gate reformed the vendored Button's `h-10/h-9` ramp down to `h-11/h-12` with no non-compliant `sm`, and its compositor-motion gate added the app-wide `prefers-reduced-motion` block. Tailwind v4 + vendored shadcn (hand-copied Button/Card/Badge — no CLI rewriting the token file; `components.json` still declares the registry for later `add`s). One `:root` in `globals.css` owns every literal (structural test: strip comments + `:root` → zero hexes remain); Outfit self-hosted via `next/font` (two woff2s in the build output, zero CDN); `@theme inline` maps only onto `var()` — **day accents get no theme slot, so an accent CTA is unnameable**, and they exist in exactly one component (`badge.tsx`) by test. `--accent-pull` picked by measurement, not taste: `#c2410c` (5.18:1 white / 4.96:1 page — clears the 4.5 badge-text bar; `#d9480f` at 4.11 rejected), `#fb6514` → `--accent-pull-bright` decorative; `--accent-legs #7a3ff2` + redefinition recorded in `DESIGN.md` with the measured table. The gate (`scripts/check-contrast.ts`) reads the shipped hexes: **26/26 pairs pass** printed by CLI exit 0, and Scenario 2's red state lives forever as an injected-palette negative control — the reverted pull fails with the historic **2.88:1** in its own message. The guard caught its author twice: raw substring scans counted the header comment *naming* #ecf3ff/#fb6514 as history, fixed to value-position (`codeOnly`) scans rather than by weakening the claim. `--outline #d0d5dd` (1.41–1.47:1) is deliberately **not** in the gate matrix: decorative boundary edging, components identified by label/fill/context under SC 1.4.11 — the decision is in the PR, the day any future component *needs* its border to identify it goes through the gate. Measured: lint 0, typecheck 0 (the `s`-flag TS1501 surfaced because `$?` was finally taken from the command, not `| tail` — the §8 self-inflicted trap, caught before shipping this time), unit **26 files / 247 tests**, API **10/60** — first full-suite run tripped the M2-06 latency guard (p95 **821.5 ms** vs 800 ceiling) three seconds after three production builds; passed standalone and on a second whole-suite run, both samples in the PR. `next:build` exit 0 with the legacy Vite build also 0 and its CSS bytes unchanged; D6 fired a **third** time (after the API suite) and was reverted pre-commit. First-load baseline for `/`: **595 457 B raw / 179 598 B gzipped** (CSS 28 517/6 550), summed from the prerendered HTML's own asset list. One commit, PR closing #59, stopping at review per protocol. |
| 2026-09-11 | Agent (DSH) | M3-03 (#60) E2E + a11y harness | Resumed after a checkpoint and found this checkout ahead of the conversation: #57/#58 (PR #69) and #59 (PR #71) had merged from a parallel session. Verified the inherited palette claims with independent luminance math before building on them (`--accent-pull #c2410c` = 5.18:1 on white / 4.96:1 on `#f9fafb`; `#fb6514` still 2.88:1 and correctly decorative-only; the `pg` diff was key reordering, not a bump; `layout.tsx` is not a client boundary, so the 179 KB First Load is the Next/React baseline rather than a provider leak). Shipped #60: 9 Playwright specs — the axe control that must both catch an injected `image-alt` violation and stay quiet once fixed, a guard that the suite is not silently pointed at a dev server, axe/`<h1>`/focus assertions on `/` and `/sign-in`, a Lighthouse a11y measurement (score 100; floor set to 90 because a placeholder page cannot earn 100 and demanding it would be a gate over nothing), and the first production-mode latency numbers. **The 200 ms SLA missed at p95 (272.8 ms) and §5 records the miss with its attribution rather than softening it.** Refactored `CookieJar`/`createClientFromCookieJar` into `lib/supabase/cookie-jar.ts`: they never used `cookies()`, but sharing a module with `createClient` meant importing the test jar pulled `next/headers` into Playwright's loader. CI gained a last-position E2E job with `--with-deps`, and the API step's comment was corrected — it still claimed `pending-handlers.ts` existed when #53 deleted it. Two of my own defects fixed in place: a `$?` read off `tail` instead of the build, and a test-file edit script that died on an unescaped apostrophe after its own earlier writes had landed. Gates: lint 0, typecheck 0, set-config 0, `git diff --check` 0, preflight 0, unit 26 files/247, API 10/60, E2E 9/9. `tsconfig.json` was rewritten by `next typegen` (D6, again) and reverted unstaged. |
| 2026-09-11 | Agent (DSH) | M3-04 (#61) dashboard | Shipped the first real screen: `/` renders today's system days from two new SQL-aggregated reads (`ContentRepository.listSystemDayPlans`, `WorkoutRepository.getSessionsOnDate`) with no counting done in the browser, and `/session/[id]` arrived as a read-only view because a card that links nowhere fails the card's own acceptance criterion. Weight display got one home (`lib/domain/units.ts`) — ADR-0005 leaves canonical kg untouched and rounds lb to the legacy single decimal, asserted as non-reversible because that asymmetry is the argument against ever writing a converted value. `currentUtcDate()` was extracted out of `POST /api/sessions` after the dashboard needed the same clock: a session is filed under the server's UTC date because the request contract refuses a client date, so the screen that lists today's sessions cannot afford a different definition of today. M3-03's `interactive: false` flag for `/` was flipped, which was the point of leaving it. Findings the slice surfaced: **`SessionStateSchema` is an unclosed `z.object({}).passthrough()` placeholder** (filed as #73; worked around with a view-boundary schema that throws rather than rendering `undefined`), and `schema-constraints.test.ts` had leaked a **system routine day** into the shared database since M1, which the dashboard rendered as a fourth "Test Push" card — fixed with an unconditional `afterAll` delete, and the E2E assertion changed from a count to an order so it can never be moved by someone else's fixture again. My own defects caught in the act: guessed `status`/`phase` enum values in the view schema (`abandoned`, `strength` — neither exists), now asserted in both directions by a unit test; a stale-closure `finally` in `StartButton`; off-by-one import depths under `[id]/`; `?limit=10` in a spec, rejected by the contract's own `.strict()` (400) — the gate working, not a test bug. Gates: lint 0, typecheck 0, set-config 0, `git diff --check` 0, preflight 0, unit 28 files/257, API 10/60, mutation 0, **E2E 14/14**, and `next build` reports `ƒ /` (previously `○`) with `/session/[id]` dynamic. `tsconfig.json` churned again (D6) and was reverted unstaged. |
| 2026-09-11 | Agent (DSH) | PR #74 merged — post-merge sync | Owner merged **#74 (`33d1eb7`)** = #61 (M3-04 dashboard). #61 closed; its 14 E2E specs, the interactive `/` a11y entry, and the Lighthouse relabelling landed as actual gates rather than local claims. Milestone #3 now carries #57–#61. |
| 2026-09-11 | Agent (DSH) | M3-05 (#62) outbox implemented | The milestone's risk centre, built as three files plus a seam: `Outbox` over an injected `OutboxStorage` (durability, per-session `seq`, idempotency-key lifetime, quota failure as a typed error), pure `reconcile` + `projectPending` (§8.2 partial application, and the refusal to drop an unconfirmed mutation), and `SyncEngine` (single in-flight drain, jittered backoff that gates *sends*, rejection → full refetch, §8.3 cadence arithmetic asserted as numbers rather than prose). 37 unit tests, no browser, no timers. Two claims withheld deliberately: `IndexedDBOutboxStorage` has never executed (the seam means the unit suite proves `Outbox`, not the adapter — #63's E2E is its first run), and `deviceId` has no owner yet, so the engine takes it as config. See §7 item 16. |
| 2026-09-11 | Agent (DSH) | API byte test given a real timing budget | `session-deltas.test.ts`'s byte comparison failed at **5021 ms** once under a loaded box (green twice in isolation, ports free). It sits behind `next dev`'s on-demand route compile and makes two requests, so vitest's 5 s default coupled a *size* assertion to machine load. One test now carries `ROUTE_BUDGET_MS = 20_000`; **no assertion changed**; suite re-run twice at 10 files / 60 tests. Same class as #61's `hookTimeout` fix, recorded for the same reason: a flake's real cost is that people stop trusting red. |
| 2026-09-11 | Agent (DSH) | `pk:checkpoint` after #83 (M3-08) merged | Closed the M3 ledger in §2 through M3-08 (#62 `df6db14`/PR #75, #63 `5cf3b7e`/PR #79, #64 `0278634`/PR #81, #65 `0adf233`/PR #83 — all CI green) and turned §3 from branch-awaiting-merge prose into merged fact. **Measured baseline right now, on `main`: lint 0/0, typecheck 0, `next:build` 0, unit 243 passed / 22 files, api + security 60 passed / 10 files, Playwright 37 passed (2.2m), Lighthouse accessibility 100 on authenticated `/history` and on `/sign-in`, `check-set-config.sh` and `git diff --check` clean.** Nothing is in flight; #66 (settings + legacy-import UI) is the next card and starts its own branch. Three things that must not be re-litigated by the next session: the timer seam stores absolute anchors and re-derives on read (no counter, ever — #64 killed `push-day-workout/app.js:311`); the progress screen never recomputes e1RM because its input type has no weight or reps field (`.strict()` enforces it, tests assert it); and history pages are cursor-paged because `SessionsListQuerySchema` has no date params — the `?from=`/`?to=` the #65 card assumed are **#82**, not a UI workaround. Open findings to respect: #76 (nothing produces `archived`), #77 (rejection code with no message), #78 (same-ms writes decided by a random UUID), #80 (one hardcoded fixture id set colliding under `fullyParallel`), #82. Housekeeping the owner still owes a yes/no: ~36 merged local branches, `/tmp/sync-latency.bak`, the unfiled doc-debt items D2/D3/D4/D6, and the missing `.promptkit/workflows/grill.md`. |
| 2026-09-11 | M3-10 (partial) | #67 SLA + keyboard + colour gates. Suite 61/0. G-M3-4 MISS recorded (see §5). Two races fixed in my own assertions. 5 items open (§7 item 21). |
| 2026-09-12 | Agent (DSH) | M3-10 finished: break-each-gate, the defect it caught, the exit record | Completed #67's five open items with evidence. Nine deliberate gate breakages fired and were restored (audit 9–14): 90 ms in the tap handler → G-M3-2 red at `p95 104.0ms`; one `page.mouse.click` in the keyboard flow → the guard threw at `runner-fixtures.ts:141` in 2.9 s; an empty `<Link>` → Lighthouse 95 + `link-name` (and the zero-width-space version scored **100** — recorded as a non-observation, Lighthouse accepts ZWSP as a name); `drain()` refusing at depth → the 15 s hang guard red with 34 identical badge polls; the alias re-point `var(--outline)` → the unit gate measured 1.47:1/1.41:1. Two injections found **holes** rather than confirmations, and both were fixed rather than filed: the colour-alone gate's differential text check passed a glyph-only build (`4ca87e5` added word-carrier assertions), and the contrast gate could not see alias re-points at all (`96b5202` made it resolve `var()` indirection, measure the alias layer — 35 pairs — and fail unmeasurable values with reasons; two permanent negative controls keep both behaviours honest). **Then the suite caught something unasked**: a full battery run breached G-M3-4's 15 s hang ceiling with the badge frozen at "60 waiting to sync" — root-caused via `pk:debug` to full-jitter backoff windows grown during the offline phase surviving reconnect (nothing cleared `nextSendAt` on `online`; the provider comment's "draining then is free" was conditional, not true), which re-explains the 4.7–9.7 s bimodality previously recorded as a server-side MISS. Fix + two-direction unit control in `9ca17cc`; **budget never moved**, and post-fix G-M3-4 measures 1643–1838 ms and prints PASSES. **And the audit trail closes on its own gate**: PR #86's first CI run went red on `legacy-parity.spec.ts` — not the app, not the assertion: the *test* assumed git history the runner's default shallow checkout does not have (`fatal: bad revision 'origin/main...HEAD'`). A parity gate that only executes on one machine had been 'green' on a half-truth. Fixed with ref resolution + a loud never-vacuous skip + `fetch-depth: 0` so CI really runs it (audit entry 18); full suite 61/0 locally after, CI re-watch is the final proof. Two load-induced timing flakes recorded with captures, budgets untouched (audit 17). Battery: preflight 0, lint 0/0, typecheck 0, unit 37/380, api 10/60, mutation 0, contrast 35/35, Playwright 61/0 on three consecutive final runs, Lighthouse 100 ×4 each. Wrote `docs/releases/2026-09-12-m3-exit-report-and-m4-handoff.md` (every deferral named with its file/measurement, including #73 sitting under a closing milestone — owner call) and refreshed PROMPTKIT §2/§3 to merged reality. `tsconfig.json` churned (D6), unstaged as ever.

| 2026-09-12 | Agent (DSH) | #73 closed: `SessionStateSchema` describes the session graph | The M2-01 placeholder is gone. Shape transcribed from `lib/domain/sessions/types.ts` as `mapSessionState` emits it (design spec `docs/specs/2026-09-12-73-session-state-contract.md`, not memory), `.strict()` on every object, `ExerciseKindSchema` + `RoutineExercisePhaseSchema` added to `contracts/common.ts` because a hand-copied enum is this issue's documented birth defect, and the `Date`-or-ISO coercion moved out of `lib/views/session-view.ts` into the contract — required, since the server components validate mapper output holding `Date`s and the runner validates the same columns as strings. `session-view.ts` is now the re-export §5 asked for (166 lines → 47), and `SessionView` stopped being a subset, which is why `tests/unit/state/fixtures.ts` had to grow: that fixture claimed to be "the server's view" of a session with no `clientId`, no `source`, no `serverSeq`, and no `updatedAt`. Producers are held to it: `validateOutgoing` in `contracts/envelope.ts` parses the outgoing body in `POST /api/sessions`, the full-session branch of `GET /api/sessions/[id]`, and `POST /api/sync` — throwing `ContractViolationError`, which is deliberately not a `ZodError` so a producer defect cannot be billed to the caller as a 400. Two drift classes injected and watched to fail (audit 19: 11 unit + 6 route tests red on a deleted `serverSeq`, 5 red on `kind:'cardio'`), and the routes-own-no-schemas gate fired on my own comment first — reworded, not loosened. Battery: lint 0/0, typecheck 0, unit 39/397, api+security 10/60, mutation 0, Playwright 61/0 (two prior runs carried one timing-gate flake each, both green solo, budgets untouched). Not verified: `SyncResponseData.state` has no runtime consumer, so its new strictness is enforced only server-side. `tsconfig.json` churned (D6), unstaged as ever.

| 2026-09-12 | Agent (DSH, `pk:checkpoint`) | **M3 closed — post-merge state sync** | PRs **#86** (issue #67, M3-10) and **#87** (issue #73) are merged; milestone #3 reads **open=0 / closed=19**. This is the convention those two merges trigger: the tracker described branches that no longer exist. **§1** milestone/working-branch/last-updated/gate-status now describe `main` with nothing in flight; **§2**'s M3 row is `[x]` and the #59/#60/#67 task lines read MERGED with their PRs and SHAs (#71 `3b0ffbf`, #72 `9f98f83`, #86 `8704c19`, #87 `2d5edfb`), with a row added for #73 so the milestone's 19 closed items are all visible; **§3**'s active-spec line, the retired-`pending-handlers.ts` claim and the M3-10 "in review" heading are corrected, and the Verification-Commands baseline is re-measured rather than inherited; **§5**'s Lighthouse bullet (the authenticated audit #67 built), #73 bullet, `--accent-legs` and package-manager "open questions", the D3 debt row, the "D2/D3/D4/D6/D7 open" list, the "unmerged findings from #63" heading, and the stale 23-file/196-test baseline are all corrected; **§7** items 5–21 lost their `awaiting merge` / `in review` tenses, item 22 is now the M4 start line, and **items 21–22 were moved back into §7** — a previous session appended them after the §8 table, so the file's own section numbering was lying. **§8** carries this row. No source touched, no gate weakened, `docs/tests/…-m3-verification-audit.md` left exactly as written. **Re-measured on merged `main` (`2d5edfb`), stack up**: lint 0/0 · typecheck 0 · `npm test` **39 files / 398 tests** · `test:api` **10 / 60 / 0 skipped** · Playwright **61 passed / 0 failed (3.1 m)** · `test:mutation` **exit 0**. Two numbers the record disagreed on, resolved by measurement rather than by preferring a document: audit entry 19 and §8's #73 row say **397** while PR #87's evidence table says **398** — the merged tree measures **398**, so the older figures stand as the branch-time reading and are not edited. And the `POST /api/sync` p95 carried forward here is the exit report's **234–282 ms**, not a narrower band: the CI figure is 222.0 ms and the first local one was 272.8 ms, so the miss is quoted as the full measured range with each run attributed. Housekeeping the owner still owes: **GitHub milestone #3 is still `state: open`** despite zero open issues (milestone #2 was closed the same way after M2), **39 merged local branches** (`git branch --merged main`, excluding `main` and this docs branch), and D6's `tsconfig.json` — which churned again during this sync's API and Playwright runs and is, by rule, left unstaged. |

| 2026-09-12 | Agent (DSH) | `M4-00` (#89) implemented: D4 settled as hand-authored, cascade shipped | Settled the p0 gate M4-20/M4-21 sit behind. **The decision was evidence, not taste**: `db:generate` was *run on purpose* on `793db53` and emitted a phantom destructive `0004` (`DROP INDEX routine_exercises_day_order`, re-`CREATE`s of shipped tables, NOT NULL relaxations) plus a journal rewrite — **exit 0** — while the applier (Supabase CLI, filename order) had been ignoring the journal all along and `drizzle.__drizzle_migrations` sat empty; journal-authoritative would mean fabricating snapshots drizzle later trusts. **Model (b) recorded**: ADR-0006; `db:generate`/`db:migrate` deleted from scripts, `out:` deleted from `drizzle.config.ts` (bare generate falls back to gitignored `./drizzle/` — measured), `supabase/migrations/meta/` deleted; `tests/unit/migration-authority.test.ts` gates all four re-introduction classes and was watched RED on each (#89 audit 4–5). **Cascade layer = the database**: `0007_auth_user_cascade.sql` adds `profiles_id_auth_users_fkey → auth.users(id) ON DELETE CASCADE` behind a guarded stranded-row cleanup (old local DB: 2 026 orphans; fresh `db reset` apply: zero), `tests/integration/auth-user-cascade.test.ts` executes deletion through the real GoTrue admin API (a role with zero `public.*` privileges — the cascade works anyway, measured, not quoted from Supabase docs) plus owner SQL, asserts the 23503 refusal, carries an in-transaction rolled-back negative control reproducing the leak first, and checks `supabase_migrations.schema_migrations` so a committed-but-unapplied migration is red; drop-the-FK became `test:mutation`'s sixth permanent control (5 of 6 red while broken). `schema-constraints.test.ts`'s synthetic profile learned to have an identity. Gates on this branch, twice: lint 0/0 · typecheck 0 · `npm test` **41/408** · api **10/60/0** · mutation exit 0 (6 controls) · Playwright pass 1 **61/0** ×2, pass 2 (against a fresh-volume DB) **60/1 → 61/0 → 61/0** — `timers.spec.ts:224`, an undocumented third member of the load-sensitive family, went red in the full suite and on its first solo, then green on four solos and two more full runs; event log = audit entry 11, budgets untouched, the red reported not smoothed · Lighthouse 100 on all four routes. One existing gate caught its own author mid-slice: `next build` typechecks test files, `vitest run` does not — TS2365 on a `count(*)` string, red before any spec ran, fixed not fudged (audit 10). The CI-parity question was closed by measurement, not presumption: deleting the volume and re-running `supabase start` applied and stamped `0000`–`0007` exactly as `db reset` had (audit Limits 2). Not verified: hosted-project FK privileges into `auth` (re-assert at first production migration). D6 churned as always, unstaged. |

| 2026-09-12 | Agent (DSH) | `M4-16` (#105) implemented: the sync answer narrows to four fields, and the mock that invented a fifth dies with it | Executed the owner's ratified **drop**, not the wiring alternative. `SyncResponseData.state` is deleted from `lib/contracts/sync.ts`, from `SyncApplyResult` (was `Omit<SyncResponseData,'state'> & { state: SessionState }`, now the contract's own type), and from the seam that existed only to fill it: `SyncStore.getState()` → `currentServerSeq()`, so `workout-repository.ts` reads one column of a row its transaction already holds `FOR UPDATE` instead of mapping sets, tasks and the routine plan a fourth time to serialize a copy no client parsed. `.strict()` is what turns a deletion into a live gate, and it was watched: **re-adding the field to the schema** made typecheck name four files and 5 unit controls in three guard files go red; **making the producer keep emitting it** made `validateOutgoing` answer 500 four times (redacted, as designed) with 4 API specs red; **removing `.strict()`** took the two controls that exist to refuse an unknown key down with it (`expected true to be false`, and the fixture builder stopped throwing); **deleting the builder's `.parse`** red three fixture specs; **pasting the original fabricated mock back** red the scan control while `tsc --noEmit` stayed *clean* — the measurement that makes that scan load-bearing rather than tidy; and **`void envelope.data?.state` in `provider.tsx`** failed the source guard by filename, which is the read side of "no consumer existed" being checked instead of asserted. Every re-aimed claim moved to the route that actually promises it — `api/sync.test.ts` counts the four keys **on the bytes** and re-reads stored state through `GET /api/sessions/[id]` — and its new spec executes the deployment claim instead of asserting it: a literal batch written the way the previous build's outbox writes one posts 200, three applied, one refused `INVALID_MUTATION`, `serverSeq 3`, with the graph read back from the authoritative route. The e2e fabrication at `session-runner.spec.ts:174` is now `tests/e2e/sync-fixtures.ts`, which `.parse`es every body through `SyncResponseDataSchema` at build time, and its `reason` was corrected from `'ILLEGAL_TRANSITION'` — a string no path in `lib/domain/` emits — to `CONFLICT`, the code `rejectionReason` returns for a lifecycle refusal. With the original mock pasted back in, **`tsc --noEmit` is clean** and ESLint fires only incidentally on the newly-unused import, so the scan control added in `sync-response-fixture.test.ts` (no spec's code may contain `clockSkewMs`, a required response field no request carries) is the one gate that fails for the right reason. One red in an early full-suite pass turned out to belong to this branch, and chasing it is why the row is long: re-aiming an assertion at `GET /api/sessions/[id]` also moved that route's *first* request — under `next dev`, an on-demand compile — inside a spec's 5 s budget, measured at **2 039 ms** against **587 ms** for the same read once warm. The fix is a warm-up request in `beforeAll`, where `vitest.config.ts` already says infrastructure startup belongs, and no budget or expectation moved; the spec now runs **521 ms**. `sla.spec.ts:144` (G-M3-4) went red in that same early pass and green solo at median **1 752 ms** of its 5 000 ms budget, which is §7 item 22's contention family, not this change. Gates, with the whole ledger rather than the flattering half of it: lint 0/0 · typecheck 0 · `check-set-config.sh` 0 · preflight green · `npm test` **42/419** (was 41/408) · api **10/61/0** (was 60) · mutation exit 0 with all 6 controls CAUGHT · Playwright `--workers=1` **61/0**. Eleven full batteries ran on this branch; the two counted ones are passes J and K, back to back and last, 61/0 in 5.8 m and 6.0 m with Lighthouse 100 on four routes. The nine before them produced five reds and one invalidation, each recorded in §5 or §7 item 22 with its solo re-run: one was **this branch's** (the re-aimed sync spec absorbing a cold route compile inside a 5 s budget, fixed by moving the compile into `beforeAll`, not by widening the number); three were timing gates in specs already documented as load-sensitive or newly named into that family; one was a GoTrue admin-API 500 from a shared fixture's `cleanup()`; one pass was invalidated by a corrupted generated `.next/dev/types/validator.ts` that this session's own `pkill` tore mid-write. `POST /api/sync` in the e2e latency spec read p50 **191.4 / 192.8 ms** across the branch's counted passes against **199.5 ms** on a same-box control run of `main` — one control sample, so that is direction, not delta, and it is the only performance claim this row makes. CI in the same shape, and reported the same way: PR #116's first `test` job passed lint, typecheck, the set-config guard, preflight, **42/419** and **10/61**, then went **1 failed / 60 passed** in e2e on `a11y.spec.ts:102` — PROMPTKIT §3's own documented phase-advance seam, the `Resting`-instead-of-`Stretching` string — and a re-run of that exact SHA returned **61/0**. The counted pair above is still local; the job is the gate that decides, and its status on the final tree is what the checks page says. Two environment findings, reported not smoothed: `session-runner.spec.ts:111` now hits that cleanup 500 at **2 workers and at 1** — §5's #80 bullet carries both and says plainly that `--workers=1` keeps the *other* collision out, not this one; and all four **Lighthouse** specs die inside `chrome-launcher`'s WSL branch, which overwrites `process.env.TEMP` from a regex scan of `$PATH` — the origin of the Windows path `lighthouse.spec.ts`'s comment still calls unidentified — so these runs took a `PATH` with `/mnt/*` entries removed, disclosed in the PR with the file left byte-identical and the mechanism filed in §5 as its own card's work. Not done and not hidden: **no 7th `test:mutation` control**, because that harness mutates DDL only and a source-mutation control is a different tool (the injections above are its substitute, run by hand and quoted); and the pre-deploy queue is proven at the route and at the client seam, **not** in a browser holding an old IndexedDB. `tsconfig.json` churned (D6) and is, as always, unstaged. |
| 2026-09-12 | Agent (DSH) | `M4-16` (#105) merged + post-merge gate refresh | PR #116 auto-merged into `main` as `6043990` at 11:52:54Z and #105 closed with it, on two consecutive green `test` jobs against the final tree `10dae9a` (the job, then a deliberate re-run of the same SHA) — after one red there on `a11y.spec.ts:102`, which is §7 item 22's family and is kept in PR #116's CI table rather than edited out. The whole documented sequence was then **re-measured on merged `main`**, because #116's numbers were #116's branch: lint 0/0 · typecheck 0 · set-config 0 · preflight green · `npm test` **42 files / 419 tests** · `test:api` **10 / 61** · `test:mutation` exit 0 with all 6 controls CAUGHT · Playwright `--workers=1` **61 / 0** in 6.0 m — all green on `6043990`. §3's Verification Commands block and PROMPTKIT §2 now carry those values with that SHA on them (PROMPTKIT's line read 416 tests until this run, and §3's e2e duration loses its naked "61 passed (3.1 m)" because that was a default-worker measurement this box no longer reproduces clean). Nothing in this refresh is code: two prose files, no `.ts`, no config, no gate. |
| 2026-09-12 | Agent (DSH) | `#80` implemented on a branch: fixture identities are minted per seeding call | Cut from `main` @ `b33c642` as `fix/m4-080-per-run-fixture-ids` (`8b5d974`) because #100's card names #80 as its blocker and says land it first. `seedSessionFixtures` created rows for a fixed id set and deleted that same set **twice** — in `cleanup()` and, as crash-recovery hygiene, on its way in before it seeded — so under `fullyParallel: true` with no worker cap one file's *setup* destroyed a sibling's rows mid-measurement (#60's `request 18: status=404`). Eleven identities are now minted per call and returned as `SessionFixture.ids`, and the module-scope `ids` export is **gone**, so a caller cannot reach an identity it does not own. Two consequences the card did not name, found while doing it: (a) `exercises.slug` and `routine_days.slug` are both `NOT NULL UNIQUE`, so per-run ids with fixed slugs would have relocated the collision onto the natural key and left the bug standing — the slugs carry the same per-run suffix; (b) the by-id pre-clean was silently doing crash recovery, and nothing repeats a random UUID, so leftovers would now accumulate forever — replaced by a sweep by slug marker bounded to rows older than **2 h**, a judgement measured against this box's slowest full battery (~10 min) rather than picked, and the residue it still permits is named (`exercises`/`routine_days` are inserted with `owner_user_id = NULL`, so #89's `auth.users → profiles → rows` cascade cannot reach them; everything user-owned in a run's footprint does go with its user). New control `tests/integration/api/fixture-isolation.test.ts` asserts the invariant at the seam the failure surfaced (authenticated `GET /api/sessions/[id]`) in **both** directions — a sibling tearing down, and a sibling *seeding* — and was watched failing: restoring the fixed constants makes the second seeding call die on `exercises_pkey` (`Key (id)=(33333333-…) already exists`), so the file goes red at its `beforeAll` before any assertion is reachable; that breakage also caught a defect in my own control, whose `afterAll` dereferenced never-assigned handles and printed `TypeError: Cannot read properties of undefined` over the real cause, so it now tracks which handles exist. Measured on the branch: `test:api` **11 files / 64 passed** (was 10/61; the +1 file and +3 tests are the control), `npm test` **42 files / 419** unchanged, `test:mutation` all 6 controls CAUGHT, and battery pass `80passA` green end to end in documented order with e2e **61 passed (6.2 m)** at `--workers=1`. Two lines in that log are read as pre-existing rather than as mine: `/api/sync` p50 **208.6 ms** printing **MISSES** against the documented 200 ms budget (this box's known range, #92's subject, enforced ceiling 800 ms untouched) and `[WebServer] ⨯ Error: The destination stream closed early.`, which appears in `mainpost.log` and in #105's counted pass K and so on green `main` runs too — noted here so #100 inherits it as an observation and not as a surprise. Explicitly **not** claimed: that the suite is now quiet. Per-run ids make the row-identity class of the contention family unreachable; whether the family then disappears is #100's five-consecutive-full-battery criterion, `session-runner.spec.ts:111`'s `Could not clean up M1-16 test user (500)` is still unexplained because `fixtures.ts`'s user cleanup discards GoTrue's body, and `sync-latency.spec.ts` keeps `mode: 'serial'` with its comment rewritten to say the reason changed to measurement isolation. No SLA, budget, threshold, or assertion moved; `tsconfig.json` left dirty and unstaged (D6); PR opens only after a second green pass. |
| 2026-09-12 | Agent (DSH) | `#100` executed: the contention family renamed, three causes fenced, and the evidence chain made observable | Rebased onto merged `main` (`dac6b44`, #80's PR #119) and shipped on `test/m4-100-contention-fences` → **PR #120**. Root cause of the largest member is arithmetic, not scheduling: the subtitle is server truth by design (`runner.tsx:459`, `:1155-1160`), so a phase may lag one `POLL_INTERVAL_VISIBLE_MS` cycle, and eleven assertions waited inside Playwright's 5 s default — a window shorter than the interval. `expectPhase` derives its window from the imported constant (`2 × poll + 2 s`) and a guard fails if the label union disagrees with `PHASE_LABEL` or if any spec bypasses the helper. Second cause: clocks never summed from their own declared waits — G-M3-3 (55 s of permitted waiting in a 30 s default, 25.6 s measured), plus `describe`-scoped `setTimeout` silently not reaching tests outside the `describe` (2 Lighthouse audits, 3 `session-runner` specs, one at 17.9 s = 60 % of its clock, which timed out at CI's 2 workers). Third: `trace: "on-first-retry"` was unreachable since it was written because `retries` defaults to 0 — no trace had ever existed for any incident in this project's history; now `retain-on-failure` + JSON durations, which is where every number in this row comes from. `100q3`'s red reclassified a whole family: `Could not clean up M1-16 test user (500)` is a **teardown throw**, previously filed against a different spec name, i.e. one episodic 500 blamed on whoever owns the fixture — our helper discarded GoTrue's response body, so `describeGoTrueFailure` now surfaces it and the 500 is nameable rather than fixed. Gates on the shipping tree: lint 0 · typecheck 0 · set-config 0 · preflight 0 · unit **45/430** · api **11/64** · mutation 6/6 CAUGHT+RESTORED · Playwright `--workers=1` **61 passed** five times consecutively with **zero solo re-runs**, the earlier five discarded when a clock changed because a spec's allowed runtime is behaviour. Uncapped at CI's real 2 workers on a 1.9× oversubscribed box: 4 red — the 50 ms paint gate missed twice (55.1/73.2 ms; CI reads 16.8–19.4 ms, so load-sensitive not parallel-broken; #92/#96), the clock bug since fixed, and the new 10 s label window exhausted because the poll beneath it is starved under contention. **No SLA, budget, threshold moved; CI's `--workers` not capped; no silent retry added** (retries would have made the old trace setting work *and* turned every flake green — a guard exists to keep them off). Harness work with its own receipts: full e2e output and durations preserved per pass, `ERR_CONNECTION_REFUSED` counted and labelled as a harness event, and a lock so two passes cannot kill each other's server (proved by a refusal at exit 75). Three claims of mine were wrong in the flattering direction and are corrected in place: `dashboard.spec.ts:125` explained from its title rather than its body (withdrawn), a 24.4 s green treated as a win when my own fence had eaten 81 % of its clock, and `100s5`'s p95 199.1 ms recorded as MISSES when it **met** the 200 ms document by 0.9 ms. `tsconfig.json` dirty and unstaged (D6). |
| 2026-09-12 | Agent (DSH) | `#100` merged + post-merge gate refresh | PR #120 merged into `main` at `324d4b7` (2026-09-12T19:49:39Z), closing #100. **Re-measured on merged `main` with the stack up and the box quiet** (`nproc=4`, load 1.03 → 2.92): `npm run lint` exit 0 · typecheck 0 errors · `check-set-config.sh` exit 0 · preflight green · **`npm test` 45 files / 430 tests** · **`test:api` 11 files / 64 passed / 0 skipped** · Playwright **61 passed** at that tree, which is five consecutive counted batteries on `05a6b0d` beneath two markdown commits. `find`-recounted **56 `.test.ts` files** (30 unit, 26 integration; was 52 at `6043990`), so §3 and PROMPTKIT §"counts" now read the same numbers as this row. Two counts were corrected rather than inherited: `gh issue list --milestone "M4"` returned 0 open cards through a **title mismatch**, and the GraphQL re-query gives the real board state — **M4 open=26 / closed=4**, M3 and M2 closed and clean, **M1 still `[OPEN]` with 1 open issue** (the neglect question the owner owes). Nothing was left pending in #100's name: the four things it could not explain are cards or ledger rows now — **#121** (G-M3-2's `n=17`, where `p95` *is* the maximum, 50 ms goal untouched), **#122** (`chrome-launcher`'s WSL `PATH` scan, which is why every Lighthouse figure in the ledger needed a stripped `PATH`), `dashboard.spec.ts:125` and `100run1`'s vanished server (both open in `docs/rca/m4-100-contention-ledger.md`, with the harness now detecting the signature and holding a lock), and the GoTrue teardown 500 which is nameable but unfixed. Next card is the owner's pick from the 26 open M4 items; #103 remains gated by #109. `tsconfig.json` churned (D6) and is, as always, unstaged. |
| 2026-09-13 | Agent (DSH) | `#90` merged + post-merge STATE refresh, including a retraction of my own | PR #126 merged into `main` at `e26ecfa` (2026-09-12T23:43Z), closing #90. **Re-measured on the merge commit** (stack up, `nproc=4`, load 1.05 at start): lint 0 · typecheck 0 · `check-set-config.sh` 0 · unit **45 files / 430 tests** · API **11 files / 64 passed / 0 skipped** — unchanged from `324d4b7`, the expected result for a branch whose `src`/`lib` diff was 0 lines. §3 now carries the instrument's first merged-main reading instead of a branch number, and that is where the news is: the 4 rps configuration that read **p50 181.3 ms** on the branch tree reads **p50 230.9 ms / p95 359.0 ms / max 441.8 ms over 81 accepted requests with zero rejections** on `e26ecfa` — so my framing that "the typical request meets the budget and the tail does not" **failed to replicate and is retracted** in `docs/perf/2026-09-12-m4-90-load-harness-design.md`. What survives both runs is weaker: p95 misses in both, and the median sits **at** the documented number (~181–231 ms), so #92 inherits a floor *and* a tail. The two p95s are not comparable either — the harness's own tail guard fired on the main run (`only 4 observation(s) above it`), which is exactly what that guard exists to say. §5's #90 bullet, §7 item 22's new **(d′)** clause, and this row were all written from measurements taken after the merge rather than pasted from the PR; the §3 history sentence and residue items (a)–(e) are untouched (45 insertions, 2 deletions, both deletions re-wrapped anchor lines). Still open and still named: **50 rps sustained is unmet on this 4-core hardware** (best offered 43.6 rps at a 256 in-flight cap, verdict `INCONCLUSIVE`), four 500s in one baseline have no captured body (that run predates the per-status sampler), and the sampler does not record `Retry-After`. Two process notes: the goal that drove #90 exhausted its 12 configured rounds while waiting on this merge and could not be resumed without raising its cap, so the refresh was done as a direct instruction; and my first attempt at the doc edit used an anchor that ended mid-sentence, which silently truncated a paragraph — caught in `git diff`, reverted, redone as a pure 13-line insertion. `tsconfig.json` churned (D6) and is not staged. |
| 2026-09-13 | Agent (DSH) | `pk:checkpoint` after #90 — STATE synced, handover generated | Phase 1 (workspace): on `main` `0740513`, #127 merged, no open PR, `git status` showing only `tsconfig.json` (D6, never staged), 54 local branches. Phase 1 (tests): re-measured on `e26ecfa` before this — lint 0 · typecheck 0 · `check-set-config.sh` 0 · unit 45 files/430 · API 11/64 · e2e 61 passed · CI green on #126's final SHA and on #127. Phase 3 (hygiene): the secret scan's three hits are prose (`task-(b)`, `pk:tasks`), `.env.local` is gitignored, only `.env.example` is tracked, the §4-item-16 control injection left **0 residue files** in `src/`, no debug probes. Phase 2 (invariants locked by this session, recorded in §5/§7 and `docs/perf/`): percentiles over **accepted responses only** — a rejection is fast by construction and including one flatters a gate; the **load denominator travels with every timing verdict**; `ceil(0.95n) − 1 = n − 1` for n ≤ 19 so a small-n "p95" is a maximum, and the harness now counts observations above the percentile instead of trusting the label; **no rate, budget or CI worker count moved to fit a measurement**; the in-process `pg.Pool` is not observable from outside the server process, so DB-side counts are labelled as what they are rather than passed off as pool queue depth; **retries stay off** because a red must mean red. Phase 4: §1's live fields refreshed (25 open / 6 closed, `main` at `0740513`, nothing in flight), §7 item 23 gained the session-status sub-bullet, and a copy-paste handover prompt was produced in-session. One self-correction recorded rather than deleted: this session's "the typical request meets the budget and the tail does not" **failed to replicate** on the merge commit and is retracted in `docs/perf/…-design.md`.
| 2026-09-13 | Agent (DSH) | `#121` merged — G-M3-2 p95 denominator pinned so one tap cannot decide the 50 ms gate | PR #129 → `eb11342`, closing #121. Pinned the sample count to 100 round-robin taps (denominator no longer machine-dependent), required ≥60 samples (fail closed, never four), and added the `aboveP95` degeneracy guard in `tests/e2e/latency-helpers.ts` so a `p95` that collapses to the maximum fails loudly. The 50 ms goal and the nearest-rank method are unchanged; the triplicated percentile math moved into the shared helper and is reused by `sync-latency` and `session-runner`. **Control watched failing** (forcing `degenerate: false` turned the unit test red, then reverted). Re-measured on merged `main` (`eb11342`): CI `test` job **success** (lint 0 · typecheck 0 · `check-set-config.sh` 0 · preflight · `npm test` · `test:api` · `test:e2e` 61 passed); locally lint 0 · typecheck 0 · `check-set-config.sh` 0 · unit `latency-percentile.test.ts` 4/4. No budget, goal, or threshold moved. |
| 2026-09-13 | Agent (DSH) | `#125` merged — shed `getUser()` hop → 503 `SERVICE_UNAVAILABLE` (not 401) | PR #131 → `2b1c37d`, closing #125. A network blip / GoTrue 429 / 5xx during `supabase.auth.getUser()` is a server-side, retryable condition, not an absent session, so `requireUserContext()` now returns 503 with a `Retry-After` header and logs the cause, while genuine 4xx auth rejections keep the 401. Local GoTrue returns `error: {status: 400, "Auth session missing!"}` for a missing session, so the mapping discriminates on status (`status === 0 || 429 || >= 500` → 503; else 401) rather than on error presence alone. `serviceUnavailableError()` factory + optional `retryAfter` added to `envelope.ts`; `route-error.ts` emits `Retry-After`. **Control watched failing** (mapping the hop to 401 turned require-user Scenario 4 red, then reverted). Re-measured on merged `main` (`2b1c37d`): CI `test` success (lint 0 · typecheck 0 · `check-set-config.sh` 0 · preflight · `npm test` · `test:api` · `test:e2e` 61 passed); locally `npm test` **46 files / 435 tests**. No rate, budget or threshold moved. Residual (out of scope): the client runner/outbox must treat 503 as retry, not sign-out — #63/#94. |

23. **M4 STATE OF PLAY — 2026-09-12 checkpoint. Read this before planning anything.**
    - **SESSION STATUS after `pk:checkpoint` 2026-09-13** — four cards have landed since the line above was
      written, all through their own PRs: **#105** (PR #116), **#80** (PR #119), **#100** (PR #120),
      **#90** (PR #126). The ones that change how M4's remaining cards should be read:
      * **#90 put a real instrument on `POST /api/sync`.** `npm run perf:sync` measures a production build
        with percentiles over accepted responses only, the load denominator printed with every verdict, and
        `pg_stat_activity` for concurrency (the app's `pg.Pool` is only reachable inside the server process —
        `lib/db/client.ts:8` — so no proxy stands in for its queue depth). **It did not establish the 200 ms
        @ 50 rps figure: this 4-core box cannot deliver 50 rps to a route this slow** (best offered 43.6 rps,
        verdict `INCONCLUSIVE`), and that gap is recorded as unmet rather than reworded. What it did establish
        is that **the median sits *at* the budget (~181–231 ms) and the p95 misses it**, so #92 inherits a
        floor *and* a tail — a claim this file made twice and corrected once, when the branch's "median is
        inside the budget" failed to replicate on the merge commit (`docs/perf/2026-09-12-m4-90-load-harness-design.md`).
      * **Two findings #90 surfaced and deliberately did not fix, now the cheapest high-value work on the
        board:** **#125** (a shed `supabase.auth.getUser()` hop is reported to clients as `UNAUTHENTICATED`
        with the cause discarded on both sides — 93.6 % of one run, 30/30 users later accepted on the same
        cookie, 1003 rejections produced an 8-line log). **It sits upstream of every load number in §3**, so
        any further perf work is sampling a filtered minority until it is decided. And **#121** (the 50 ms
        paint gate's `p95` *is* its maximum for any n ≤ 19 — `ceil(0.95n) − 1 = n − 1` — which has now gated
        CI red on branches that change no shipped code) — **resolved via PR #129**: the sample denominator is pinned to 100 round-robin taps, the gate requires ≥60 samples (fail closed, never four), and `latencySummary` adds an `aboveP95` degeneracy guard so a `p95` that collapses to the maximum fails loudly. The 50 ms goal and the nearest-rank method are unchanged; the triplicated percentile math moved to `tests/e2e/latency-helpers.ts`.
      * **#100's residue is still open by name** in item 22's list above: (a) `dashboard.spec.ts:125`
        unexplained, (b) `100run1`'s vanished server unnamed, (c) the GoTrue teardown 500 nameable not fixed,
        (d′) #90's narrowing of the `/api/sync` story, (e) the paint gate.
      * **Unowned rulings the owner still owes** (this session did not act on any of them): the
        `/tmp/m4plan` worktree, the `docs/m4-spec-plan` branch, **54 local branches** (six from this session),
        whether **M1's still-open milestone with 1 issue** is neglect, and whether `pk:plan` for M4 is
        retrofitted — the third bullet below still stands: **no M4 spec exists.**
    - **All 7 deferred spec decisions are RATIFIED**, recorded as owner-decision comments on each
      issue (durable on GitHub, not just here): #93 accept process-local limiter + ADR · #96 outbox
      depth **and** age · #105 **drop** `SyncResponseData.state` (fix the fabricated
      `tests/e2e/session-runner.spec.ts:174` mock in the same change) · #112 accept the 4 s poll +
      ADR (G-M3-3 passes *because* `POLL_INTERVAL_VISIBLE_MS=4000`, not because the engine is fast) ·
      #109 **build body measurements properly** (real table/contract/import of legacy `userStats`) ·
      #103 follow #109 then delete + **flip** `legacy-parity.spec.ts:95` · #107 **no work** until
      #94/#95 telemetry exists.
    - **NEW DEPENDENCY EDGE (not in the original wave plan):** #103 is now gated by #109. Deleting
      legacy before the `userStats` import strands it *by accident* instead of by decision.
    - **NO M4 SPEC EXISTS.** `pk:plan` was skipped when M4 was decomposed (STATE §7 item 22 wanted it
      first); the attempt to run it **failed with zero output**. Do not assume a spec is on disk —
      the 7 calls were settled by direct owner judgement instead. If anything needs architecture
      beyond those 7, `pk:plan` is still owed.
    - **Orphan artifacts to clean (owner call, nothing depends on them):** worktree `/tmp/m4plan` and
      empty branch `docs/m4-spec-plan` from the failed agent (`git worktree remove /tmp/m4plan
      --force && git branch -D docs/m4-spec-plan`). Also: ~39 merged local branches to prune;
      **milestone 1 is still open on #16** (M1's deferred exit item, never closed).
    - **Numbers that must not be trusted from prose:** `/api/sync` p95 has **three conflicting ranges
      on `main`** — audit `202.9–288.3`, handoff `234–282`, STATE `364.5–413.9` ms. Verdict agrees
      (200 ms missed); conditions were never recorded. Reconciliation is a required first step of
      #92 (see its comment). And the RFC's SLA is "200 ms **@ 50 rps**" while **every number ever
      measured is sequential** — #90 is the epistemic center of M4.
    - **Known flakes:** `timers.spec.ts:277`, `sla.spec.ts:282` are documented; **`timers.spec.ts:224`
      is an undocumented third load-sensitive spec** found during #89 (audit entry 11) — deliberately
      NOT added to PROMPTKIT's list because that list's "all green solo" claim would then be false.
      Owned by #100.
    - **Suggested next implementables** (decided, independent, in flight): **#92** next (the floor-and-tail p95 gap; #125 sat upstream of every load number in §3 and is now resolved), then **#93**/**#96** remain queued. **#121 shipped** via PR #129 (paint-gate p95 denominator pinned); **#125 shipped** via PR #131 (shed `getUser()` hop → 503 `SERVICE_UNAVAILABLE` with `Retry-After`, cause logged, verification not loosened).
      #109 is the largest newly-authorized scope.
    - **Locked invariants reaffirmed by #89:** hand-authored SQL is authoritative (ADR-0006) —
      `db:generate`/`db:migrate` are **deleted**, `supabase/migrations/meta/` removed, and
      `tests/unit/migration-authority.test.ts` fails CI on any re-introduction. Never generate a
      migration; never stage `tsconfig.json` (D6).
    - **Addendum, same day, after this checkpoint was written: #105 is merged.** PR **#116** →
      `6043990` — the first of the seven ratified decisions to be executed rather than carried — plus
      PR **#117** → `89ce24d`, which re-measured §3's gates on merged `main` instead of trusting
      #116's branch table. So the "suggested next implementables" line above is now **#93 or #96
      first**. #116's CI record is one red followed by three greens, the red on `a11y.spec.ts:102`,
      and the load-sensitive family named here grew: two more local names (both solo-green, §7 item
      22) and one that fired in CI. The orphan-artifact line above still stands — those worktree and
      branch deletions were not performed by this session, and `docs/m4-spec-plan` plus `/tmp/m4plan`
      are still there.
