# Project State & Living Execution Tracker

## 1. Executive Summary & Current Position

- **Project Name**: PPL Fitness Tracker
- **Current Milestone / Epic**: **M2: Core Domain Engine — COMPLETE.** M2-00 → M2-06 all merged to `main` (PRs #43–#47, #51, #53; issue #42 closed). The milestone's last slice, M2-06 route hardening, merged as **PR #53 (`ce1c5d9`)**. **M3: Presentation** is next and has no task breakdown or issues yet — it needs `pk:plan` then `pk:tasks`.
- **Overall Status**: ACTIVE <!-- Options: ACTIVE | PAUSED | STABILIZING | RELEASE_CANDIDATE -->
- **Target Release**: v1.0.0, no date committed
- **Current Working Branch**: `docs/m3-rfc-grill` (PR pending) — the grilling pass over the M3 RFC, which found four defects in that document and amended it in place (§8). `main` is at `d146460` (PR #55 merged). Naming `main`'s SHA here is history for this pass, not a pin — see the rule below; it exists because this field has gone stale three times running, which is the argument for not maintaining it at all.

> **Do not pin the current `main` SHA in this field.** It was tried three times and went stale three times, because the merge commit that lands the correction advances `main` past the value being recorded. Describe the state, not the hash. Run `git log --oneline -1` if you need the exact commit.
- **Last Updated**: 2026-09-11 (M2-06 merged as `ce1c5d9`, issue #42 closed. Every number below was re-measured **on merged `main`** in this pass, not inherited from the branch run that opened PR #53.)
- **Gate status**: #48 (D5 route-handler coverage + D1 lint enforcement) and #49 (this intake
  record) are **merged to `main`**, and `main`'s own Actions runs are green (4m32s and 4m40s).
  `npm run lint` exits 0 there. Consequence for the text below: the gates are no longer pending
  but enforced — a PR that reintroduces an `any`, drops an env var, or leaves a stale
  pending-handler entry now fails in CI, so claims marked closed are backed by a gate.
  #51 (M2-05 importer) is merged on top of them, so the importer's 5 route specs are now
  gate-enforced on the default branch rather than only on a branch that claimed to pass.
  Still open as debt: D2, D3 (docs half closed), D4, D6, D7.

**Where things actually stand.** M1 schema, RLS, auth, contracts, exercise/stretch seeds, and the M1-16 route baseline are on `main`. M2-00 adds the runtime app-role Drizzle client, verified auth-to-RLS context, session domain mappers, and user-scoped repository; M2-01 adds the sessions API; M2-02 adds the pure lifecycle transition table, transaction-scoped set/task/phase/finish mutations, and rollback coverage; M2-03 adds pure Epley e1RM calculation and transaction-scoped personal-record recomputation with app-role ownership/rollback coverage; M2-04 adds bounded transactional sync, replay-safe mutation metadata, per-session sequencing/change rows, deterministic clock/device conflict resolution, and the authenticated `/api/sync` adapter.

**What does not exist yet, stated plainly**: any real UI (only a placeholder home page and the sign-in form — Tailwind/shadcn/tokens land in M3), the any E2E spec (`playwright.config.ts` names `tests/e2e`, which is absent), and production email delivery (issue #16, deferred). The legacy vanilla-JS app still runs unchanged alongside the target stack, and `npm run build` still emits zero JavaScript — re-verified 2026-09-11, not inherited from the old note.

---

## 2. Milestone & Task Progress

### Milestone Roadmap

- [x] **Planning**: Spec written, six decisions resolved, ADRs recorded (Complete — 2026-09-08)
- [x] **M0**: De-risk spike — RLS enforcement proven through Drizzle (Complete — 2026-09-08, **gate lifted**)
- [/] **M1**: Contracts & Seams — code, contracts, seeds, RLS, auth, and RED baseline complete; production SMTP/delivery remains deferred under issue #16
- [x] **M2**: Core Domain Engine — issues #36–#42 all merged (PRs #43–#47, #51, #53). **Complete 2026-09-11.**
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

### M2 Checkpoint — M2-00 Foundation, M2-01 Sessions API, M2-02 SessionEngine, M2-03 ProgressionEngine & M2-04 Sync

Formalized 2026-09-08 in `docs/specs/2026-09-08-m2-core-domain-engine.md` with atomic task files under `docs/tasks/m2/`. Filed under GitHub milestone `M2: Core Domain Engine` as issues **#36–#42**; these are the canonical tracking numbers:

- [x] `#36` `M2-00`: runtime `DATABASE_URL` Drizzle client, shared DB/transaction types, verified auth-to-RLS context, session domain types/mappers, and user-scoped `WorkoutRepository` — implemented and committed in [223e2b8](https://github.com/lowqualityloey/ppl-fitness-tracker/commit/223e2b8); repository race/cursor/DSN review gates passed.
- [x] `#37` `M2-01`: deterministic API fixtures and `/api/sessions` route handlers wired to the repository — implemented and validated with 12 focused API integration tests plus five route-error unit assertions using owner-seeded data, tenant-qualified app-role RLS, authentication/validation errors, idempotent starts, pagination, mapped child state, and cross-user isolation.
- [x] `#38` `M2-02`: `SessionEngine` lifecycle, phase gates, set/task mutations, terminal-state protection, and rollback-safe repository transactions — implemented and validated with pure transition tests plus app-role repository integration coverage; true sequence/device sync remains deferred to #39.
- [x] `#41` `M2-03`: `ProgressionEngine` Epley e1RM calculations and personal-record materialization — implemented with nullable/zero policy, edit-down recomputation, deterministic ties, app-role isolation, natural-key race handling, and rollback coverage; no schema migration or progress route introduced.
- [x] `#39` `M2-04`: server-side sync transaction, mutation idempotency, per-session sequence/change model, deterministic clock/device conflict handling, and authenticated `/api/sync` — implementation complete on `feat/m2-04-sync-conflict-model`; final validation and issue-scoped PR are next. Rate limiting remains explicitly deferred to #42 and true `since` deltas remain deferred until a later response contract.
- [x] `#40` `M2-05`: `LegacyImporter` parsing, fingerprint idempotency, archive flow, and import report — merged as PR #51. Per-key parsing with sibling isolation, content-addressed fingerprint replay, one-transaction archived-session writes, and an explicit loss report. "Archive flow" landed as **server-side non-destruction**: the endpoint has no delete path at all, and moving or clearing the user's original keys stays the client's step after it shows the report, which is the UI half queued in #42.
- [x] `#42` `M2-06`: all M1 route-handler tests green, performance/security gates, and M2 integration hardening — merged as **PR #53**. `POST /auth/signout`, `GET /api/exercises`, and `GET /api/progress/:exerciseSlug` shipped; the 120/min sync budget became an enforced control; batch-bound / duplicate-landing / latency gates added; the declared-pending registry was retired with its anti-rot guard because no route is pending any more. `test:api` is now 7 files / 40 passed / 0 skipped.

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
- **Active Task Spec**: `docs/specs/2026-09-11-spec-m3-presentation.md` (M3, status Draft — awaiting `pk:grill` then `pk:tasks`; `docs/tasks/m3/` does not exist yet by design). The completed M2 record is `docs/specs/2026-09-08-m2-core-domain-engine.md` with its task files in `docs/tasks/m2/`.
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
- **Merged M2 surface, for orientation**: `lib/domain/sessions/` (transition table + mappers), `lib/domain/progression/` (Epley e1RM + PR recomputation), `lib/domain/sync/` (reducer, `types.ts`), `lib/domain/import/` (legacy planner, `LegacyImporter`, `LegacyImportStore` port), `lib/http/route-error.ts`, `src/app/api/{sessions,sessions/[id],sync,import/legacy}`, migrations `0004`–`0006`. Every route handler above has specs that run in CI; the routes still missing are `#42`'s (signout, exercises, progress), declared individually in `tests/integration/api/pending-handlers.ts` as counted skips rather than hidden by a glob.
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
- **Verification Commands** (measured 2026-09-11 on `origin/main`; all must run inside WSL):
  - Legacy dev: `npm run dev` (3000). Target dev: `npm run next:dev` (3001).
  - `npm run typecheck` → **exit 0, clean** (`next typegen && tsc --noEmit`; never run bare `tsc`).
  - `npm run lint` → **exit 0**, 0 errors / 0 warnings, re-verified on merged `main`. It was
    exit 1 (24 errors + 2 warnings) until D1; the step now runs **in CI directly after `npm ci`**
    and the script is `eslint --max-warnings=0 .`, so warnings fail too. Reintroducing an `any`
    is a build break, not a style opinion. See D1 (closed).
  - `npx vitest run tests/unit` → **67 passed / 6 failed** with the stack down. All 6 are
    `tests/unit/with-user.test.ts` reaching real Postgres (`ECONNREFUSED :54322`). See D2.
  - Full gate, measured sequence that actually works (verified 2026-09-11 with the stack
    up): `npm run db:up` → `npm run test:api:preflight` → `npm run typecheck` →
    `npm test` → `npm run test:api` → `npm run test:mutation` → `npm run db:down`.
    Results, re-measured **on merged `main`** (`ce1c5d9`) with the stack up (2026-09-11), after PR #53 landed:
    **`npm test` 24 files / 217 tests green**; **`test:api` 7 files / 40 passed / 0 skipped**
    (from intake's 25/225 + 36 passed/7 declared-skipped: the pending-handler guard file retired with
    the registry, and the sync budget skip went live when the limiter was wired in); preflight green;
    **`npm run test:mutation` exit 0**; `check-set-config.sh` exit 0; lint and typecheck exit 0.
    *Correction on the record:* while #53 was open this block sat under a heading reading "on merged
    `main`" while carrying the branch's numbers. Same values, wrong warrant — the sentence was false
    until this merge, which is why re-measuring after merge is a step and not a formality.
    `npm run test:mutation` has been run here, and note the gap it exposed: that script is bare `tsx
    scripts/mutation-check.ts` with **no `--env-file-if-exists`**, unlike the test scripts, so it
    aborts with `MIGRATION_DATABASE_URL environment variable required` unless `.env.local` is
    sourced by hand. Needs `DATABASE_URL` +
    `MIGRATION_DATABASE_URL` on the process env — the npm scripts pass
    `--env-file-if-exists=.env.local` so npm loads them itself; on `main` you must source
    `.env.local` first, or DB-backed files fail or silently skip.
  - `npm run test:red` is an alias for `npm run test:api` (kept so older notes still resolve),
    and **CI runs the API suites as their own step**, so `tests/integration/api/` is inside the
    merge gate with the still-unbuilt handlers declared individually. See D5 (closed).

  - Repository integration tests need a tenant-qualified local Supavisor URL on 54329
    (`app_authenticated.pooler-dev`); the direct app-role port 54322 also passes the suite.
    The app-role password literal lives in migration `0001` — `supabase status` does **not**
    report it, which is how `.env.example`'s placeholder quietly broke this checkout.
  - Spike, from `spikes/m0-drizzle-rls/`: `npm run db:up` → `npm run db:setup` → `npm test`
    (32 pass) → `npm run mutate` → `npm run db:down`. Superseded by the real M1 suite, kept
    for reference.
- **Known-broken**: `npm run build` (legacy Vite) — **re-verified 2026-09-11**: exits 0 and
  writes **0 `.js` files**; `dist/index.html` still references the untouched classic script
  paths. By design until M4. The route-handler suites under `tests/integration/api/` remain
  excluded from `npm test` on `main`; those handlers largely exist now, so the exclusion is
  stale (D5) rather than an intentional RED baseline, and the 11 specs whose handlers
  genuinely do not exist are now declared individually on the gate branch.
- **Side effect to watch**: running the API suite boots `next dev`, which **rewrites the
  tracked `tsconfig.json`** (appends a generated-types include and reformats arrays). Revert
  before committing — it is formatter noise, not your change. See D6.

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

**No immediate coding blocker. M2 is complete:** M2-00 → M2-06 are merged, the last as PR #53
(`ce1c5d9`), and issue #42 is closed. Nothing in M2 remains. What the milestone left behind are two
named residual risks rather than absorbed ones: the **documented 200 ms p95 budget is unverified in
production mode** (dev-harness measurement: p95 268.8 ms, median 217.7, max 633.4 — the gate owns an
800 ms regression ceiling and is proven to bite at 200 ms, so the gap is visible rather than implied),
and the **rate limiters are process-local**, so N instances multiply the budget by N. A production-mode
measurement (`next:build` + `next:start`) is the natural M4/telemetry task. See the remediation list
below and `docs/tasks/2026-09-11-intake-debt-index.md.

*Resolved 2026-09-08 — `M0-00`, Node runtime.* Initially filed as "WSL Node is 18.19.1, too old for Next.js 16." That was overstated. `~/.nvm/versions/node/` already contained v22.19.0 and v24.18.0, and the `PATH` prepend at `~/.zshrc:119-122` selects the highest, so the **interactive** shell was already on Node 24 and Next.js 16 would have run fine.

The narrower claim that survived — "non-interactive shells resolve `/usr/bin/node` v18.19.1" — was **also overstated**, re-measured 2026-09-11: plain `bash -c`, `bash -lc`, and `zsh -lc` in this environment all resolve **v24.20.0**, because the nvm `PATH` prepend is inherited from the parent process. Only a stripped environment (`env -i bash -c 'node -v'`) falls back to `/usr/bin/node` **v18.19.1**. `PROMPTKIT.md` §3 is corrected accordingly; `~/.zshenv` was still deliberately not created — no repo-visible change is needed.

**Actions taken (2026-09-08, unchanged)**: `nvm install --lts` → v24.20.0 set as nvm default (additive; `/usr/bin/node` untouched), and `PROMPTKIT.md` §3 documents the explicit-source command form for automation. `~/.zshenv` was deliberately *not* created — it changes the user's environment rather than the repo.

**Standing caution**: `node --version` reporting v18 is the signal that nvm was not sourced. Check it before trusting any build result, especially in CI-style sandboxes, systemd units, and cron.

### Open Questions

- **`--accent-legs` has no assigned colour.** `DESIGN.md` offers no third accent that can be legitimately spent; `tertiary #667085` is reserved for disabled states, so reusing it would make disabled controls read as Legs day. One new hue must be added to `DESIGN.md` as a documented extension. *Blocks M3, not M1.*
- **Package manager for the target app.** Legacy is npm. Low-stakes; decide at M1 scaffold and record it in PROMPTKIT.md §3.
- **Dark mode deferred.** `DESIGN.md` ships no dark tokens. Light-only in v1 per ADR-0005, with tokens authored under one `:root` so adding a `.dark` block stays additive. Revisit immediately post-v1 — this app gets used in dim gyms at night.

### Technical Debt & Risks

**Remediation items — found by running, not reading (intake 2026-09-11).** Full cards with
Gherkin AC in `docs/tasks/2026-09-11-intake-debt-index.md`. **D1 and D5 are closed and merged** (PR #48, green on `main`).
D2, D3, D4, D6 and D7 remain open.

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
- **D3 · Playwright is configured for `tests/e2e/`, which does not exist** — zero E2E specs
  anywhere. Do not describe E2E as coverage. Docs-only half is closed; create the directory
  with its first spec in M3/M4.
- **D4 · `meta/_journal.json` covers migrations `0000`–`0003` only**; `0004`, `0005` and
  `0006` are hand-authored and unrecorded, while `drizzle.config.ts` still generates into
  that same directory. The next `db:generate` reasons from a stale snapshot. Choose and
  record one authorship model. M2-05 landed without touching migrations — `import_batches`
  already shipped in `0000` with RLS from `0003` — so this trap never fired, which is not the
  same as it being disarmed. It is still the item that can block the next schema-touching
  slice, and `drizzle.config.ts` still generates into the same directory.
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

**Baselines now on record** (stack up, Node 24.20.0): `npm test` 23 files / **196 tests
green**; `npm run test:api` 20 passed / 12 declared-skipped; `npm run lint` and
`npm run typecheck` exit 0.

Carried forward, still open:

- **Custom SMTP remains a launch blocker, not polish, and is intentionally deferred as issue #16.** Supabase's default sender allows 2 emails/hour from a shared generic address. On a magic-link-only app that is the entire front door. Do not claim production email delivery until an external provider, verified sending domain, SPF/DKIM, DNS, and the hourly synthetic monitor are in place.
- **Legacy `npm run build` emits zero JavaScript** and exits 0 while doing so. Verified 2026-09-08 **and re-verified 2026-09-11** (0 `.js` files in `dist/`). Cause: classic `<script>` tags Vite won't process. Not being fixed — the legacy app is decommissioned in M4 — but do not mistake a green build for a working one.
- **Pull-day legacy set data is unrecoverable.** `saveProgress()` keyed checkbox state by `checkbox.id`, and the generated set checkboxes never had one, so all 17 collapsed into a single `"undefined"` key. Only aggregate counts survive the import. Accepted and documented in spec §4.5.
- ~~**Drizzle migration metadata is incomplete.**~~ Superseded and widened by **D4** above: the journal omits `0004`, `0005` **and now `0006`**, which M2-04 added. Same root cause, larger gap.
- **Auth/profile deletion is not physically cascaded.** `profiles.id` has no foreign key to `auth.users.id`, so Auth-user deletion does not automatically remove the profile row. Keep explicit cleanup in fixtures/import flows and evaluate a migration before production hardening.
- **Sync conflict metadata is implemented in M2-04.** The additive migration now persists per-session sequences, mutation hashes/status, entity versions, and change rows with relationship-aware RLS. Legacy set/task rows use their stored client timestamp and zero UUID baseline until they receive sync metadata; true deltas remain deferred by contract.
- **`server_seq` is settled for M2-04.** It remains an integer per-session sequence, protected by the locked session row and unique change-log key; revisit width only with a future contract/volume requirement.
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
5. **Decide D4 (journal vs hand-authored migrations) before any `db:generate`** and record
   the chosen authorship model in `PROMPTKIT.md` §3; decide D7 (typed rows in the security
   suites) before M2-06 writes its negative controls.
6. **Keep schema-risk work explicit.** Retain the missing Auth/profile FK as a tracked
   hardening risk; keep `--accent-legs` unresolved-but-flagged since it blocks M3, not M2.
7. **Keep issue #16 deferred.** Custom SMTP/provider/DNS remains the separate M1 production-release blocker and must not block M2 coding or be described as complete.
8. **Preserve the M3 boundary.** Do not delete legacy source folders or begin UI/design-system implementation until M2-06 closes the backend/API hardening gate.
9. ~~**Plan M3 before writing any M3 code.**~~ **Done 2026-09-11:** `docs/specs/2026-09-11-spec-m3-presentation.md` records the RFC — goals with measurement methods, non-goals, deep-module seams (`Outbox`, `SyncEngine`, `TimerController`, `UnitDisplay`), FMEA, and six milestones M3-00…M3-05. Four decisions were settled with the Owner and are recorded in §2.4 of that spec.
10. ~~**Grill the M3 spec, then decompose it.**~~ **Done 2026-09-11**, manually: `pk:grill` is advertised in `AGENTS.md` but `.promptkit/workflows/grill.md` is absent from this installation. The pass found four defects in the RFC — recorded as §8 with two Owner decisions settled (Start requires connectivity; `--accent-pull` is redefined rather than duplicated).
11. **Run `pk:tasks` on the amended RFC.** Decompose M3-00…M3-05 into `docs/tasks/m3/` with Gherkin AC in M2's task-file shape, keeping §8.3's dependency facts: M3-00 blocks M3-03's poller, M3-01 blocks every screen, and no task may specify a screen against an endpoint that does not exist yet.
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