# Project Architectural Profile (`PROMPTKIT.md`)

> **Instructions for AI**: Read this file during every session. Adhere strictly to the project domain boundaries, commands, documentation targets, and non-negotiable architectural rules defined below.

> **This project is mid-migration.** Two stacks coexist, and the split is no longer "built vs. unbuilt" on either side of the seam.
>
> - The *target* stack's **server side and its UI are both merged to `main`**: schema + migrations `0000`–`0006` (and `0007`, the auth→profiles cascade FK, **lands with #89 — after that merge this list reads `0000`–`0007`**), RLS on every table, magic-link auth, Zod contracts (including the session-state graph, as of #73), the sessions/profile/prefill/exercises/progress/sync/import APIs, `SessionEngine`, `ProgressionEngine`, and transactional conflict-aware sync (M1 complete bar deferred #16; M2-00 → M2-06 merged as PRs #43–#47, #51, #53; **M3-00 → M3-10 merged as PRs #69–#87 — the milestone is complete, open=0 / closed=19**).
> - The target stack is now a **working app**: `/` (dashboard), `/sign-in`, `/session/[id]` (the runner), `/history` + a one-session report + per-exercise progress, and `/settings` with the legacy-import dialog. What it still is not: **deployable**. Production email delivery (#16), telemetry/Sentry, the 50 rps load test, a service worker, volume/streak analytics, body-measurement import and data export do not exist — M4's list, with its measured starting facts in `docs/releases/2026-09-12-m3-exit-report-and-m4-handoff.md`.
> - The **legacy vanilla-JS app still runs unchanged** on port 3000 beside it and is still the thing `npm run build` builds (a build that emits zero JavaScript — see §2). M3 was required to run beside all of it and never wrote a legacy key; `tests/e2e/legacy-parity.spec.ts` measures that, and is built to fire when M4 deletes them.
>
> Do not describe unbuilt target-stack components as if they exist, and do not describe the merged backend **or the merged M3 UI** as if either were still a plan. See `docs/STATE.md` for the live position.

---

## 1. Project Overview & Domain

- **Project Name**: PPL Fitness Tracker
- **Domain / Purpose**: Push-Pull-Legs workout tracker. Guides a user through a structured gym session (pre-workout checklist → warm-up → main workout → cool-down), times rest and stretch intervals, logs completed sets, and keeps durable training history across devices.
- **Primary Users**: Single user per account — a beginner-to-intermediate lifter following a PPL split. Explicitly **not** multi-tenant; no coaches, teams, or organisations (see `docs/specs/2026-09-08-spec-fullstack-migration.md` §2 non-goals).
- **Repository**: standalone, `main` branch. Lives on WSL at `/home/heyloey/personal/ppl-fitness-tracker`.
- **Submodule**: `.promptkit` → `github.com/lowqualityloey/better-promptkit`

---

## 2. Active Technology Stack

### Legacy stack (currently running, being replaced)

- Vanilla JavaScript (ES6+, no framework, no TypeScript), Vite 5 as dev server and static bundler
- Four independent static pages: `index.html` (dashboard) + `push-day-workout/`, `pull-day-workout/`, `legs-day-workout/`
- Persistence: `localStorage`, three divergent keys (`pushWorkoutProgress`, `pullDayProgress`, `legsWorkoutProgress`)
- No tests, no backend, no auth
- **Known broken**: `npm run build` exits 0 but emits **zero JavaScript**. All four `<script>` tags are classic scripts, so Vite neither transforms nor copies them and leaves the original `src` in the output HTML. Every page in `dist/` 404s on its script and is inert. Do not treat a successful `build` exit code as evidence of a working build.

### Target stack (v1 — **M3 COMPLETE: 19/19 closed on milestone #3, open=0**. M3-00…M3-09 landed 2026-09-11 as PRs #69–#85; #67 (M3-10, the verification gate) merged as **PR #86 (`8704c19`, 2026-09-11T19:23Z)**; #73 (the session-state contract) merged as **PR #87 (`2d5edfb`, 2026-09-12T02:00Z)**. Everything below is re-verified on merged `main`, not on a feature branch, 2026-09-12.)

- **Language & Runtime**: TypeScript `strict`, Node.js **≥ 20.9** (required by Next.js 16 — Node 18 is unsupported). nvm default is v24.20.0 LTS; see the shell footgun in §3.
- **Framework**: Next.js 16 (App Router), React 19 — ADR-0001. Live screens: `/` (dashboard), `/sign-in`, `/session/[id]` (the runner), `/history` + one-session report + per-exercise progress, `/settings` (+ import dialog). Route handlers: `src/app/api/{sessions,sessions/[id],sync,import/legacy,exercises,profile,progress}`; `src/middleware.ts` refreshes sessions. Runs on port 3001 alongside the legacy Vite server on 3000 (untouched until M4; `tests/e2e/legacy-parity.spec.ts` guards that no M3 code writes legacy keys).
- **Domain layer**: `lib/domain/{sessions,progression,sync,import,units}` (pure transition table, Epley e1RM, sync reducer, legacy planner, weight parse/ceiling), `lib/repositories/` (user-scoped, transactional), `lib/views/` (the read-side the screens render — no screen invents its own fetch shape), `lib/db/{client,with-user,auth-context}`, `lib/http/route-error.ts`, `lib/auth/`, `lib/supabase/server.ts`.
- **Styling & Design System** (M3-02, PR #71): Tailwind CSS v4 + shadcn primitives **vendored** under `src/components/ui/` (the CLI is not in the loop — copy-in, then the contrast gate owns them). Token layer in `src/app/globals.css`: `:root` literals from `DESIGN.md`, the shadcn alias block, and the `@theme inline` mapping. `scripts/check-contrast.ts` + `tests/unit/design/contrast.test.ts` measure every matrix pair (35 as of M3-10), **following `var()` indirection to the leaf** and failing on anything unmeasurable — the alias hole closed in `96b5202`, see audit entries 2/14.
- **State & Data Fetching**: client sync island under `src/app/state/` (M3-05, PR #75; wired through M3-06/07): IndexedDB-backed `outbox.ts`, `sync-engine.ts` (one in-flight batch, jittered backoff, visibility-aware polling at 4 s visible / 30 s hidden, reconnect drain — `notifyConnectivityRestored()` clears offline-grown windows, `9ca17cc`), `provider.tsx`, `reconcile.ts`, `timer-controller.ts` (absolute-deadline arithmetic), `unit-display.ts`, `device-identity.ts`, `audio-cue.ts`. Set-taps are optimistic with the server as sole truth; Server Actions remain unused (deliberate, spec §3.2).
- **Backend & Database**: Supabase — PostgreSQL **17.6** (measured on the local stack 2026-09-08; earlier drafts said 16), Supabase Auth (email magic link) — ADR-0002. **Realtime is not in use**: zero `.channel(`/realtime references in application code, and `npm run db:up` starts the stack with `-x realtime,...`, so the local stack does not even run it.
- **ORM**: Drizzle (`db/schema/index.ts`), connecting as a non-owner `app_authenticated` role — ADR-0003. `db/seed/` loads exercise and stretch content.
- **Validation**: Zod at every boundary (`lib/contracts/` — envelope, auth, sessions, sync, progress, exercises, legacy import). Since **#73** the session graph is one of those boundaries rather than the exception: `SessionStateSchema` is a `.strict()` description of what `mapSessionState` emits, `lib/views/session-view.ts` is a **re-export** of it, and the three producers (`POST /api/sessions`, `GET /api/sessions/[id]`, `POST /api/sync`) validate what they send through `validateOutgoing` in `envelope.ts`.
- **Testing**: Vitest — **51 `.test.ts` files** (counted with `find` on the #89 branch 2026-09-12): **26** under `tests/unit/`, **15** DB-backed under `tests/integration/` (13 at its root, 2 in `repository/`), **10** route-handler suites under `tests/integration/api/`. `npm test` runs the first two groups — **41 files / 408 tests**, stack up — because the API directory boots real servers; `npm run test:api` runs those **10 files / 60 tests**. **Playwright E2E exists and is the merge gate for anything user-visible** — 13 spec files / 61 tests (M3-03 harness, PR #72; grown by M3-06…10), run by `npm run test:e2e` in CI against a **production** build, including `lighthouse.spec.ts` (Lighthouse is a devDependency; the CI job installs browsers `--with-deps` for exactly this; it scores `/sign-in` plus `/history`, `/` and `/session/[id]`, the last three authenticated). Every latency claim this repo makes is quoted from these logs — see `docs/tests/2026-09-11-m3-verification-audit.md` and `docs/tests/2026-09-12-m4-089-break-each-gate-audit.md` for what each gate prints and how it was proven capable of failing. D3 is resolved.

---

## 3. Project Commands

### Legacy (work today)

- **Install**: `npm install`
- **Dev Server**: `npm run dev` (Vite, port 3000)
- **Build**: `npm run build` — runs, but see the known-broken note above
- **Preview**: `npm run preview`
- **Tests / Typecheck / Lint**: none exist

> Package manager is **npm** (`package-lock.json` present, no `packageManager` field). Do not run `pnpm` or `yarn` commands against this repo.

### Running commands in this environment — two footguns

**1. Always run inside WSL, never from PowerShell against the UNC path.** The repo lives on the WSL filesystem. Installing from Windows against `\\wsl.localhost\...` fetches the wrong platform binaries (win32 optional deps for esbuild/rollup, which then fail to load under Linux), and `cmd.exe` cannot use a UNC path as a working directory — it silently falls back to the Windows directory, so the build fails for a reason unrelated to the code.

**2. Node comes from nvm, and which shell you are in decides the version.** Re-measured 2026-09-11:

| Invocation | Resolves to |
| :--- | :--- |
| Interactive terminal | nvm default **v24.20.0** — correct |
| Plain `bash -c`, `bash -lc`, `zsh -lc` (this agent harness included) | **v24.20.0** — correct; the nvm `PATH` prepend is inherited from the parent process environment |
| `env -i bash -c 'node -v'` (stripped environment) | `/usr/bin/node` **v18.19.1** — too old for Next.js 16 |

So the earlier claim that *all* non-interactive shells get v18 was overstated: it only
bites when the environment is stripped or when a caller sanitises `PATH`. Still treat it
as live risk in CI-style sandboxes, systemd units, and cron. Cheap belt-and-braces form
for any automation that might not inherit the nvm `PATH`:

```bash
. "$HOME/.nvm/nvm.sh" >/dev/null 2>&1; cd /home/heyloey/personal/ppl-fitness-tracker && npm run next:dev
```

Verify before trusting a result: `node --version` must report ≥ 20.9. v18 means nvm was not sourced.

### Target (M3 complete, nothing in flight; commands and counts re-verified 2026-09-12 on merged `main` with the stack up)

Next.js 16 lives at the repo root alongside the legacy app (`PROMPTKIT.md` §4: no
monorepo, single `package.json`). It runs on **port 3001**, not 3000 — the legacy
Vite dev server keeps 3000, and both coexist until M4 decommissions the legacy
pages. Verified: both `npm run dev` and `npm run next:dev` running simultaneously,
each serving correctly, zero collision.

- **Dev Server**: `npm run next:dev` (port 3001; legacy `npm run dev` stays on 3000)
- **Build**: `npm run next:build` — emits real JS chunks under `.next/`, unlike the
  legacy `npm run build`, which is verified zero-JS (see the note above) and stays
  that way until M4
- **Start (production)**: `npm run next:start`
- **Test files that exist today** (re-counted 2026-09-12 on the #89 branch): **51 `.test.ts` files** —
  26 under `tests/unit/`, 15 DB-backed under `tests/integration/` (13 at its root, 2 in `repository/`),
  10 route-handler API suites under `tests/integration/api/` (plus `fixtures.ts` and `test-server.ts`
  helpers) — plus **13 `.spec.ts` files** under `tests/e2e/`. `npm test` (unit + DB integration) runs
  **41 files / 408 tests** **with the stack up** and fails `ECONNREFUSED` without it. The unit-layer
  split includes `tests/unit/with-user.test.ts`, which opens a real socket to Postgres — still an
  integration test filed in the unit layer (D2, unchanged, listed so the failure mode stays
  recognizable).
- **Unit + Integration Tests**: `npm test`
  (`vitest run --exclude 'tests/integration/api/**'`). **Requires the stack up**: run
  `npm run db:up` first, or every DB-touching file fails with `ECONNREFUSED`.
- **API suite**: `npm run test:api` (`vitest run tests/integration/api/`, also reachable as
  `test:red`). These **10** files stay out of `npm test` because they boot a real `next dev` server,
  but **CI runs this step separately, so the route handlers are inside the merge gate**.
  There are no declared-pending skips any more: `tests/integration/api/pending-handlers.ts` and its
  anti-rot guard were **retired in #42** once every M1 route had a handler. If a future slice parks
  a route behind a skip, bring that registry and its guard back together — skips are counted and
  issue-attributed and self-expiring, never hidden by a glob. Run `npm run test:api:preflight` first:
  when results look impossible it separates a broken environment from broken code.
  Measured 2026-09-12 **on merged `main` (`2d5edfb`)**: **10 files / 60 passed / 0 skipped**.
  `tests/integration/api/import-legacy.test.ts` calls `seedExercises()` in `beforeAll`, and why:
  **CI has no seed step**, and the importer resolves legacy `ex1`…`ex6` against seeded routine
  content, so without that call the suite fails for a reason unrelated to the code under test. Any
  future suite that depends on system content has to state the same precondition rather than hope
  some other file seeded it first.
- **Mutation check**: `npm run test:mutation` (`tsx scripts/mutation-check.ts`) — removes
  each control in turn and requires its named test file to go red: five RLS controls against the
  drift test plus, since #89, the **auth→profiles cascade FK** against
  `tests/integration/auth-user-cascade.test.ts` (drop → 5 of 6 red, measured; the restore
  re-validates against the live table). Needs the stack up, **and it is
  the only gate script that does not pass `--env-file-if-exists=.env.local`**: run bare it exits with
  `MIGRATION_DATABASE_URL environment variable required`, so source the env first
  (`set -a; . ./.env.local; set +a`). Verified exit 0 twice on the #89 branch 2026-09-12 — every
  control removed made its named file go red, and restoring it made it pass again.
- **E2E Tests**: `npm run test:e2e` (`playwright test`) — **13 spec files, 61 tests, and they are
  the CI merge gate.** `playwright.config.ts` boots its own **production** server
  (`npm run next:build && npm run next:start` on :3001; `reuseExistingServer: !process.env.CI`),
  so a leftover `next dev` on 3001 silently makes "production-build" latency numbers dev-mode
  fictions — that is what `harness.spec.ts` detects, and why a stale-server check is step zero of
  any measurement run. Two environment traps, both in
  `docs/tests/2026-09-11-m3-verification-audit.md` entry 16's preamble: the specs import
  `tests/integration/api/fixtures.ts`, so a missing `.env.local` kills the *whole run at
  collection*, and on a box without system libs Chromium needs
  `LD_LIBRARY_PATH=/tmp/pwlibs/ext/usr/lib/x86_64-linux-gnu` (CI: `--with-deps`). Lighthouse is a
  devDependency; `lighthouse.spec.ts` asserts **100** on four routes (`/sign-in` unauthenticated;
  `/history`, `/` and `/session/[id]` authenticated via `--extra-headers`) and prints each score
  line. Playwright writes its summary to **stderr** — capture `> log 2>&1`. Run the suite **twice**
  before declaring green: the 15 s hang ceilings in `sla.spec.ts` are load-sensitive by design.
  Known load-sensitive specs on this box, all green solo and in CI, none of whose budgets moved:
  `a11y.spec.ts:102`, `sla.spec.ts:69` (audit entry 17) and `timers.spec.ts:277`, `sla.spec.ts:282`
  (audit entry 19). **Documented protocol: a red *timing* gate gets a solo re-run before anyone
  believes it** — that is the convention, not a rationalization.
- **Typecheck**: `npm run typecheck` (runs `next typegen` first, then
  `tsc --noEmit`; **verified exit 0 on merged `main` 2026-09-12**, and verified to reject implicit `any`
  — strict mode is enforced, not just declared, with `noUncheckedIndexedAccess: true`
  also on). Bare `npx tsc --noEmit` fails on a fresh checkout with
  `Cannot find name 'LayoutProps'` — that type is generated into `.next/types`
  by Next.js itself and isn't present until `next dev`, `next build`, or
  `next typegen` has run once. `npm run typecheck` handles this; a bare `tsc`
  invocation will not.
- **Lint**: `npm run lint` (`eslint --max-warnings=0 .`) — **exit 0, verified on merged `main`,
  and enforced in CI** as the step immediately after `npm ci`. Legacy directories and `spikes/`
  are explicitly ignored, not linted; `no-restricted-syntax` plus `scripts/check-set-config.sh`
  ban direct `set_config` outside `withUser()`. This was red with 24 `no-explicit-any` errors in
  four `tests/integration/*.test.ts` files until D1 cleared them by **narrowing** through
  `tests/integration/pg-error.ts` (`unknown` → SQLSTATE/message, yielding `undefined`/`''` for
  non-database throws) instead of casting to a fake error type — so a spec expecting `42501`
  still fails when the driver throws something else. Warnings fail the build, so "lint clean" is
  citable evidence now, and a reintroduced `any` is a CI break. See D1 (closed).
- **DB migrations** — the **M4-00 / #89 / ADR-0006 authorship model, in one paragraph**:
  **migrations are hand-authored** SQL files in `supabase/migrations/`, applied **in filename order
  by the Supabase CLI** (`supabase start` / `supabase db reset` — CI's path), tracked in
  `supabase_migrations.schema_migrations`. drizzle-kit is **out of the migration loop**: `npm run
  db:generate` and `db:migrate` no longer exist, `drizzle.config.ts` declares no `out:` (with it
  unset, a bare `drizzle-kit generate` falls back to the gitignored `./drizzle/` scratch —
  measured), and `supabase/migrations/meta/` is gone: the old journal covered only `0000`–`0003`
  (two of its four entries lacked even snapshots) while the applier ignores journals entirely, and
  the pre-fix `db:generate` was watched emitting a phantom destructive `0004` **with exit 0** —
  evidence in ADR-0006 and the #89 audit entry 1. `tests/unit/migration-authority.test.ts` fails CI
  on any re-introduction (a drizzle-kit npm script, an `out:` in the config, a resurrected `meta/`,
  or a duplicate/gapped/mis-named version prefix). **To add a migration:** the next contiguous
  `NNNN_snake_case.sql`, hand-authored and idempotent (0001-style header, `IF NOT EXISTS` / `DO $$`
  guards — `db reset` re-applies the whole chain), Expand→Contract per STATE §4 item 12, RLS on
  every touched table per item 6, and a live-DB integration test that *executes* the artifact.
  `db/schema/index.ts` stays the runtime type view for drizzle-orm but now has no codegen link to
  the SQL — keep it in step by hand. `MIGRATION_DATABASE_URL` (direct 54322, **not** the pooler)
  remains owner-only per STATE §4 item 18.
- **Seeds**: `npm run db:seed` (exercises + routine associations),
  `npm run db:seed:stretches` (deduped stretch content). Both idempotent, both have
  verifying integration tests.
- **Local Supabase stack** (scaffolded 2026-09-08 by `M1-02`/#4): `npm run db:up`
  / `npm run db:down` / `npm run db:status`. `supabase` CLI is a devDependency
  (`2.117.0`, matching the M0 spike) rather than a global install, so
  `npx supabase ...` also works without a version mismatch. Requires Docker.
  Pooler enabled on port 54329 — `DATABASE_URL` connects through it, matching
  how the app connects in production; `MIGRATION_DATABASE_URL` connects
  directly to 54322 as the owner role. Copy `.env.example` to `.env.local` to
  get real local values (already done in this checkout).
  `app_authenticated` **exists** (created by `0001_app_authenticated_role_trigger.sql`,
  `M1-04`/#6), so `DATABASE_URL` authenticates once the stack is up. Verified attributes:
  `LOGIN NOBYPASSRLS NOSUPERUSER NOINHERIT`, owns nothing.
  **Stack state as of this file's last refresh (2026-09-12): running** — it was started to re-measure
  the gates on merged `main`; treat it as a question to ask (`docker ps`), not a fact to inherit. The
  2026-09-11 intake found it stopped (daemon
  `29.7.2` reachable) — start it with `npm run db:up` before running any DB-backed gate.

Node version note: `next build`'s Turbopack warns that it ignored
`package-lock.json` because `/home/heyloey` (this machine's home directory) sits
outside this git repository. Harmless — the warning is about lockfile *root
detection* for Turbopack's own caching, not about which lockfile npm actually
uses to install. If it becomes noisy, `turbopack.root` in `next.config.ts` can
silence it.

---

## 4. Monorepo & Workspace Topology

**N/A (Standalone Repository).** No workspace manager, no package graph. The target app is a single Next.js application at the repository root. If a monorepo is ever introduced, this section must be rewritten before any `--filter` command is used.

---

## 5. Documentation & Artifact Storage Paths

All artifacts generated by PromptKit workflows must be saved to these host project paths:

- **Architectural Decision Records (ADRs)**: `docs/adrs/` — 0001–0005 exist, see `docs/STATE.md` §6
- **Technical RFC Specs**: `docs/specs/` — active spec: `2026-09-08-spec-fullstack-migration.md`
- **Incident Post-Mortems (RCAs)**: `docs/rca/`
- **Technical Spikes & Benchmarks**: `docs/spikes/`
- **Design Tokens & UI Specs**: `docs/design/`
- **Data Models & Schemas**: `docs/data/`
- **Authentication & RBAC Matrices**: `docs/auth/`
- **API Contracts & Envelopes**: `docs/api/`
- **Test Strategy & Plans**: `docs/tests/`
- **Release Checklists & Reports**: `docs/releases/`

Design source of truth is `DESIGN.md` (a TailAdmin profile). Its brand voice and domain vocabulary do **not** apply to this project; only its tokens do. Two recorded deviations: ADR-0004 (focus ring) and ADR-0005 (day accents, light-only).

---

## 6. Non-Negotiable Architecture Rules & Guardrails

### General

- [ ] **Zero `any` / Loose Casting**: Strict TypeScript at all times. Use Zod schemas for boundary parsing.
- [ ] **No Business Logic in UI**: Presentation components only render props and dispatch intents; business logic lives in domain modules or service layers.
- [ ] **Database Invariants First**: Foreign keys, unique constraints, and check constraints live in the database schema, not just application code.
- [ ] **WCAG 2.2 AA Compliance**: All interactive elements must support keyboard navigation, visible focus rings, and proper ARIA labels. Status must never be conveyed by colour alone.
- [ ] **Deterministic Error Handling**: No silent `catch {}` blocks. Unified envelope `{ ok: boolean, data?: T, error?: AppError }`.

### Project-specific, derived from ADR-0002/0003/0005

- [ ] **Every query is user-scoped at the call site.** `WorkoutRepository` methods take `userId` as a required first positional argument. Never add a query helper that accepts an unscoped filter, and never read a user id from a request body or query param — only from the server-side session.
- [ ] **`set_config` is always transaction-local.** The third argument (`is_local`) must be `true`. A literal `false` or an omitted third argument leaks JWT claims onto the pooled connection and hands one user's identity to the next request. This is a Critical-severity FMEA row, not a style preference.
- [ ] **Every new table gets RLS.** `ENABLE` + `FORCE ROW LEVEL SECURITY`, plus four separate policies (SELECT / INSERT / UPDATE / DELETE). Never `FOR ALL`. A `pg_tables` drift test enforces this in CI.
- [ ] **Kilograms are canonical in storage.** Unit conversion happens at the display boundary only. Never write a converted display value back to `weight_kg`.
- [ ] **Timers store an absolute deadline.** `endsAt` timestamps, with remaining time derived from `Date.now()`. Never a decrementing `setInterval` counter — browsers throttle background timers to roughly once per minute, which is a live defect in the legacy modules.
- [ ] **Security headers are server-sent.** Never `<meta http-equiv>` for CSP, `X-Frame-Options`, or `X-Content-Type-Options`; browsers ignore the latter two in meta form entirely. No `'unsafe-inline'`.

### Three rules earned from this repository's own history

- [ ] **A security control does not exist until a test proves it runs.** `SECURITY_IMPROVEMENTS.md` in this repo documents an authorization system whose deny branch is unreachable, a second `AuthManager` that no page loads, and a `canAccessPhase()` that returns `true` unconditionally. Three documented layers, zero enforcement. Any authorization or isolation claim must ship with a merge-gating test that would fail if the control were removed.
- [ ] **Documentation describes what exists, not what is planned.** Two module READMEs in this repo advertise a React/Express/PostgreSQL/JWT/Cloudinary system that was never built. Aspirational docs are worse than absent ones. Mark unbuilt work as unbuilt, including in this file.
- [ ] **A green typecheck and a green test suite do not prove a route compiles.** A relative import written `from './types.js'` that points at a `./types.ts` file satisfies `tsc` (extension substitution is allowed), and satisfies Vitest, but Next's Turbopack cannot resolve it — so *every request to a route that imports it returns 500 at module load* while the entire suite stays green. This has happened twice: once in the M1-15 contract graph (fixed during M1-16) and again on 2026-09-11 in `lib/domain/import/`, where it cost a full API-suite run before the cause was readable. The rule: source under `lib/` and `src/` that Next compiles uses **extensionless** relative imports; `.js` specifiers belong in test files, which run under Node. Prove a handler exists by sending it one request — the API suite, or `curl` — not by typechecking it.
