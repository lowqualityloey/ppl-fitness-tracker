# Project State & Living Execution Tracker

## 1. Executive Summary & Current Position

- **Project Name**: PPL Fitness Tracker
- **Current Milestone / Epic**: **M2: Core Domain Engine — M2-00 foundation and M2-01 sessions API implemented; M2-02 next**
- **Overall Status**: ACTIVE <!-- Options: ACTIVE | PAUSED | STABILIZING | RELEASE_CANDIDATE -->
- **Target Release**: v1.0.0, no date committed
- **Current Working Branch**: `feat/m2-01-sessions-api`, with the M2-00 repository/runtime foundation merged to `main` and M2-01 sessions routes/fixtures implemented and validated locally.

> **Do not pin the current `main` SHA in this field.** It was tried three times and went stale three times, because the merge commit that lands the correction advances `main` past the value being recorded. Describe the state, not the hash. Run `git log --oneline -1` if you need the exact commit.
- **Last Updated**: 2026-09-08

**Where things actually stand.** M1 schema, RLS, auth, contracts, exercise/stretch seeds, and the M1-16 RED route baseline are on `main`. M2-00 adds a runtime app-role Drizzle client, verified auth-to-RLS context, session domain mappers, and a user-scoped `WorkoutRepository`; M2-01 adds the sessions API routes, deterministic fixtures, and focused route coverage on top of those seams. The legacy vanilla-JS app still runs unchanged alongside the target stack. Production email delivery remains intentionally deferred behind issue #16's provider and DNS decisions.

---

## 2. Milestone & Task Progress

### Milestone Roadmap

- [x] **Planning**: Spec written, six decisions resolved, ADRs recorded (Complete — 2026-09-08)
- [x] **M0**: De-risk spike — RLS enforcement proven through Drizzle (Complete — 2026-09-08, **gate lifted**)
- [/] **M1**: Contracts & Seams — code, contracts, seeds, RLS, auth, and RED baseline complete; production SMTP/delivery remains deferred under issue #16
- [/] **M2**: Core Domain Engine — formal plan and GitHub issues #36–#42 filed; M2-00 foundation committed in `223e2b8`, M2-01 sessions API/fixtures implemented and validated, with remaining domain engines queued
- [ ] **M3**: Presentation — shadcn + tokens, session runner, offline outbox, WCAG audit (Queued)
- [ ] **M4**: Hardening, telemetry, decommission the legacy static app (Queued)

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

### M2 Checkpoint — M2-00 Foundation & M2-01 Sessions API

Formalized 2026-09-08 in `docs/specs/2026-09-08-m2-core-domain-engine.md` with atomic task files under `docs/tasks/m2/`. Filed under GitHub milestone `M2: Core Domain Engine` as issues **#36–#42**; these are the canonical tracking numbers:

- [x] `#36` `M2-00`: runtime `DATABASE_URL` Drizzle client, shared DB/transaction types, verified auth-to-RLS context, session domain types/mappers, and user-scoped `WorkoutRepository` — implemented and committed in [223e2b8](https://github.com/lowqualityloey/ppl-fitness-tracker/commit/223e2b8); repository race/cursor/DSN review gates passed.
- [x] `#37` `M2-01`: deterministic API fixtures and `/api/sessions` route handlers wired to the repository — implemented and validated with 12 focused API integration tests plus five route-error unit assertions using owner-seeded data, tenant-qualified app-role RLS, authentication/validation errors, idempotent starts, pagination, mapped child state, and cross-user isolation.
- [ ] `#38` `M2-02`: `SessionEngine` lifecycle, phase gates, set/task mutations, and session completion.
- [ ] `#41` `M2-03`: `ProgressionEngine` e1RM calculations and personal-record materialization.
- [ ] `#39` `M2-04`: server-side sync transaction, mutation idempotency, sequence design, LWW/device metadata, and conflict handling.
- [ ] `#40` `M2-05`: `LegacyImporter` parsing, fingerprint idempotency, archive flow, and import report.
- [ ] `#42` `M2-06`: all M1 route-handler tests green, performance/security gates, and M2 integration hardening.

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
- **Active Task Spec**: `docs/specs/2026-09-08-m2-core-domain-engine.md`, with atomic task files in `docs/tasks/m2/` and GitHub issues #36–#42. The formal plan, issue breakdown, M2-00 foundation, and M2-01 sessions API gate are complete; M2-02 is the next implementation gate.
- **Key Source Files in Flight**: M2-00 runtime/auth/domain/repository files are committed in `223e2b8`. M2-01 now provides `src/app/api/sessions/`, deterministic API fixtures, shared route error translation, and route integration coverage without bypassing those seams.
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
- **Verification Commands** (all must run inside WSL):
  - Legacy dev: `npm run dev`
  - Target dev: `npm run next:dev` (port 3001)
  - Target tests: `npm run db:up` → `npm run typecheck` → `npm test` (18 non-RED files / 119 tests; `fileParallelism: false` because integration tests share fixture rows) → `npm run db:down`. The API RED suites remain intentionally excluded from `npm test` until M2 route handlers land. Repository integration tests require a tenant-qualified local Supavisor URL when using port 54329; direct app-role port 54322 also passes the full suite.
  - Spike, from `spikes/m0-drizzle-rls/`: `npm run db:up` → `npm run db:setup` → `npm test` (32 pass) → `npm run mutate` → `npm run db:down`. Needs Docker. Superseded by the real M1 suite above but kept for reference.
- **Known-broken, not yet in CI**: none from the former M1-06 RLS verifier; it was repaired and merged in PR #30. The M1 route-handler suites under `tests/integration/api/` are intentionally RED until M2 implements the missing handlers.

---

## 4. Locked Technical Invariants (Do Not Undo)

Derived from ADR-0001…0005. Changing any of these means superseding the ADR, not editing code.

> Items 3–6 and 13–16 were **verified empirically** by the M0 spike on 2026-09-08, not merely decided. Evidence: `docs/spikes/2026-09-08-drizzle-rls-enforcement.md`.

1. **Next.js 16 + React 19 + TypeScript strict.** Node ≥ 20.9. (ADR-0001)
2. **Supabase Auth owns identity.** `profiles.id` *is* `auth.users.id`; every domain FK points at `profiles.id`. No mirror table, no identity-sync webhook. (ADR-0002)
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

---

## 5. Known Blockers, Risks & Open Questions

### Blockers

**No immediate coding blocker.** M2-00 is implemented, reviewed, validated, and committed in `223e2b8`; M2-01 sessions routes and deterministic API fixtures are implemented and validated. M2-02 is the next active slice.

*Resolved 2026-09-08 — `M0-00`, Node runtime.* Initially filed as "WSL Node is 18.19.1, too old for Next.js 16." That was overstated. `~/.nvm/versions/node/` already contained v22.19.0 and v24.18.0, and the `PATH` prepend at `~/.zshrc:119-122` selects the highest, so the **interactive** shell was already on Node 24 and Next.js 16 would have run fine.

The real and narrower issue: **non-interactive shells resolve `/usr/bin/node` v18.19.1**, because zsh does not source `.zshrc` for non-interactive invocations and `.bashrc` contains no nvm block. That affects automation and agent-run commands, not the user typing in a terminal.

Actions taken: `nvm install --lts` → v24.20.0, set as nvm default (additive; `/usr/bin/node` untouched). `PROMPTKIT.md` §3 now documents the explicit-source command form that automation must use, plus an optional `~/.zshenv` fix that was deliberately *not* applied since it changes the user's environment rather than the repo.

**Standing caution**: `node --version` reporting v18 is the signal that nvm was not sourced. Check it before trusting any build result.

### Open Questions

- **`--accent-legs` has no assigned colour.** `DESIGN.md` offers no third accent that can be legitimately spent; `tertiary #667085` is reserved for disabled states, so reusing it would make disabled controls read as Legs day. One new hue must be added to `DESIGN.md` as a documented extension. *Blocks M3, not M1.*
- **Package manager for the target app.** Legacy is npm. Low-stakes; decide at M1 scaffold and record it in PROMPTKIT.md §3.
- **Dark mode deferred.** `DESIGN.md` ships no dark tokens. Light-only in v1 per ADR-0005, with tokens authored under one `:root` so adding a `.dark` block stays additive. Revisit immediately post-v1 — this app gets used in dim gyms at night.

### Technical Debt & Risks

- **Custom SMTP remains a launch blocker, not polish, and is intentionally deferred as issue #16.** Supabase's default sender allows 2 emails/hour from a shared generic address. On a magic-link-only app that is the entire front door. Do not claim production email delivery until an external provider, verified sending domain, SPF/DKIM, DNS, and the hourly synthetic monitor are in place.
- **Legacy `npm run build` emits zero JavaScript** and exits 0 while doing so. Verified 2026-09-08. Cause: classic `<script>` tags Vite won't process. Not being fixed — the legacy app is decommissioned in M4 — but do not mistake a green build for a working one.
- **Pull-day legacy set data is unrecoverable.** `saveProgress()` keyed checkbox state by `checkbox.id`, and the generated set checkboxes never had one, so all 17 collapsed into a single `"undefined"` key. Only aggregate counts survive the import. Accepted and documented in spec §4.5.
- **Drizzle migration metadata is incomplete.** `supabase/migrations/meta/_journal.json` currently omits SQL migrations `0004` and `0005`; reconcile the journal/snapshot before relying on future generated migrations or drift checks.
- **Auth/profile deletion is not physically cascaded.** `profiles.id` has no foreign key to `auth.users.id`, so Auth-user deletion does not automatically remove the profile row. Keep explicit cleanup in fixtures/import flows and evaluate a migration before production hardening.
- **Sync conflict metadata is not modeled yet.** Session delta/change-log sequencing, persisted `deviceId`, and deterministic LWW tie-breaking are absent from the current schema. True `since` deltas and device-aware conflict resolution remain deferred until that model is designed and tested.
- **`server_seq` remains a schema decision.** The current sequence representation has not been revisited for high-volume/bigint behavior; settle it as part of the formal M2 sync design rather than encoding assumptions in the route layer.
- ~~**Per-request transaction cost of ADR-0003 is unmeasured.**~~ **Measured 2026-09-08.** `withUser()` costs **+1.29 ms p50 / +1.87 ms p95** over an app-scoped autocommit `SELECT` on a direct connection, **+1.98 ms p50 / +2.35 ms p95** through supavisor in transaction mode. Four round trips instead of one, so it scales with RTT and will be worse from a region distant from the database. Affordable against the spec §2 SLA. *What remains open is narrower: pool exhaustion under sustained load. The spike reached 40 interleaved concurrent transactions on one container, which is not a load test. Still an M4 item.*
- **M0 findings are from the local stack, not a hosted project.** Roles and `auth.uid()` came from the stock Supabase image so behaviour should match, but two findings (the silently-discarded `GRANT` on `auth`, and the refusal to `ALTER` role attributes) are mediated by `supautils` and could differ on a hosted plan. Re-assert both during M1 against a real project.
- **The magic-link flow is still unproven.** M0 used the password grant to obtain real JWTs cheaply. The `sub` claim is identical either way, so the RLS conclusion is unaffected, but no part of the actual sign-in path has been exercised.
- **`node_modules` present but installed for verification only.** Installed 2026-09-08 inside WSL to confirm the build defect. Gitignored, safe to delete.

---

## 6. Recent Architectural Decisions (ADR Log)

| Date | Title & Scope | Decision Summary | ADR File |
| :--- | :--- | :--- | :--- |
| 2026-09-08 | Framework version | Next.js 16 + React 19 + TS strict. Requested "Next.js 14 + React 19" is not a valid pair — React 19 stabilised in Next 15, and 14 is EOL. | `docs/adrs/0001-nextjs-16-react-19.md` |
| 2026-09-08 | Auth provider | Supabase Auth, replacing the originally requested Clerk. Removes a vendor, the identity-sync webhook, the mirror table, and the custom RLS resolver function. | `docs/adrs/0002-supabase-auth-over-clerk.md` |
| 2026-09-08 | Authorization model | Both layers. App scoping authoritative, RLS under a `NOBYPASSRLS` non-owner role as backstop. **Confirmed empirically by M0 and amended (A1)**: `withUser` needs a second `set_config`, the app role gets nothing on the `auth` schema, `FORCE` does not stop the owner, role attributes cannot be re-forced by migration, and the cost is now measured. Decision unchanged. | `docs/adrs/0003-rls-defense-in-depth.md` |
| 2026-09-08 | Focus ring contrast | Override `DESIGN.md`. 2px `#465fff` (~4.8:1) replaces `#ecf3ff` (~1.1:1), which fails SC 1.4.11. | `docs/adrs/0004-focus-ring-contrast-override.md` |
| 2026-09-08 | Design tokens + set logging | One base palette plus three scoped day accents; light-only v1. Weight and reps in scope, nullable, prefilled from last session, kg canonical. | `docs/adrs/0005-design-tokens-and-set-logging.md` |

---

## 7. Next Immediate Actions (Queued)

1. **Implement `#38`/M2-02.** Build `SessionEngine` lifecycle, phase gates, set/task mutations, and completion on the validated M2-00 repository and M2-01 route seams; keep true sync deltas and device-aware conflict handling deferred to #39.
2. **Continue the dependency sequence `#38` → `#41` → `#39` → `#40` → `#42`.** Freeze SessionEngine write semantics before progression/sync/import and close each task's acceptance criteria before consuming its interface downstream.
3. **Keep schema-risk work explicit.** Reconcile the Drizzle migration journal mismatch before generated migrations; use Expand-Contract for any sync/device/change-log schema; retain the missing Auth/profile FK as a tracked hardening risk.
4. **Keep issue #16 deferred.** Custom SMTP/provider/DNS remains the separate M1 production-release blocker and must not block M2 coding or be described as complete.
5. **Preserve the M3 boundary.** Do not delete legacy source folders or begin UI/design-system implementation until M2-06 closes the backend/API hardening gate.

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