# Project Architectural Profile (`PROMPTKIT.md`)

> **Instructions for AI**: Read this file during every session. Adhere strictly to the project domain boundaries, commands, documentation targets, and non-negotiable architectural rules defined below.

> **This project is mid-migration.** Two stacks coexist. The *legacy* stack is what currently runs; the *target* stack is what is being built. Nothing in the target stack exists yet as of 2026-09-08. Do not describe target-stack components as if they are implemented. See `docs/STATE.md` for the live position.

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

### Target stack (v1 — scaffold exists as of 2026-09-08, M1 in progress)

- **Language & Runtime**: TypeScript `strict`, Node.js **≥ 20.9** (required by Next.js 16 — Node 18 is unsupported). nvm default is v24.20.0 LTS; see the shell footgun in §3.
- **Framework**: Next.js 16 (App Router), React 19 — ADR-0001. **Scaffolded** (`M1-01`/#3): `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `src/app/` with a placeholder home page. Runs on port 3001 alongside the legacy Vite server on 3000.
- **Styling & Design System**: Tailwind CSS v4, shadcn/ui, tokens derived from `DESIGN.md` — ADR-0005. **Not yet added** — this lands in M3, not the M1 scaffold; `src/app/globals.css` is currently a bare reset.
- **State & Data Fetching**: Server Actions + Route Handlers; `useOptimistic` for set-tap; client outbox in IndexedDB
- **Backend & Database**: Supabase — PostgreSQL **17.6** (measured on the local stack 2026-09-08; earlier drafts said 16), Supabase Auth (email magic link), Supabase Realtime — ADR-0002
- **ORM**: Drizzle, connecting as a non-owner `app_authenticated` role — ADR-0003
- **Validation**: Zod at every boundary
- **Testing**: Vitest (unit + integration), Playwright (E2E, including an offline-session flow)

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

**2. Non-interactive shells resolve the wrong Node version.** Node is managed by nvm. The `PATH` prepend that selects it lives in `~/.zshrc`, which zsh only sources for *interactive* shells. `~/.bashrc` has no nvm block at all. So:

| Invocation | Resolves to |
| :--- | :--- |
| Interactive terminal | current nvm default (v24.20.0) — correct |
| `bash -lc` / `zsh -lc` | `/usr/bin/node` **v18.19.1** — too old for Next.js 16 |

Automation must therefore source nvm explicitly. **Use this form for every node/npm command:**

```bash
wsl.exe -d Ubuntu -- bash -c '. "$HOME/.nvm/nvm.sh" >/dev/null 2>&1; cd /home/heyloey/personal/ppl-fitness-tracker && npm run dev'
```

Verify before trusting a build: `node --version` must report ≥ 20.9. If it reports v18, nvm was not sourced.

*Optional permanent fix (user's environment, not the repo):* creating a `~/.zshenv` with the same `PATH` prepend as `~/.zshrc:119-122` would make all zsh invocations resolve correctly, since `.zshenv` is sourced for every shell including non-interactive. Not applied — the explicit-source form above works without touching dotfiles.

### Target (scaffolded 2026-09-08 by `M1-01` / issue #3 — verified commands)

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
- **Unit / Integration Tests**: `npm test` (Vitest; passes with exit 0 and no tests
  until `M1-16`/#18 adds the first ones — this is intentional for the RED phase, not
  a gap)
- **E2E Tests**: `npm run test:e2e` (Playwright; no spec files yet)
- **Typecheck**: `npm run typecheck` (runs `next typegen` first, then
  `tsc --noEmit`; verified to reject implicit `any` — strict mode is enforced,
  not just declared). Bare `npx tsc --noEmit` fails on a fresh checkout with
  `Cannot find name 'LayoutProps'` — that type is generated into `.next/types`
  by Next.js itself and isn't present until `next dev`, `next build`, or
  `next typegen` has run once. `npm run typecheck` handles this; a bare `tsc`
  invocation will not.
- **Lint**: `npm run lint` (ESLint flat config, `eslint-config-next`; legacy
  directories and `spikes/` are explicitly ignored, not linted)
- **DB migrations**: `npx drizzle-kit generate` / `migrate` (owner role,
  `MIGRATION_DATABASE_URL`) — not yet scaffolded, lands in `M1-03`/#5
- **Local Supabase stack** (scaffolded 2026-09-08 by `M1-02`/#4): `npm run db:up`
  / `npm run db:down` / `npm run db:status`. `supabase` CLI is a devDependency
  (`2.117.0`, matching the M0 spike) rather than a global install, so
  `npx supabase ...` also works without a version mismatch. Requires Docker.
  Pooler enabled on port 54329 — `DATABASE_URL` connects through it, matching
  how the app connects in production; `MIGRATION_DATABASE_URL` connects
  directly to 54322 as the owner role. Copy `.env.example` to `.env.local` to
  get real local values (already done in this checkout).
  **`app_authenticated` does not exist until `M1-04`** — `DATABASE_URL` will
  fail authentication until then. That's expected, not a setup bug.

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

### Two rules earned from this repository's own history

- [ ] **A security control does not exist until a test proves it runs.** `SECURITY_IMPROVEMENTS.md` in this repo documents an authorization system whose deny branch is unreachable, a second `AuthManager` that no page loads, and a `canAccessPhase()` that returns `true` unconditionally. Three documented layers, zero enforcement. Any authorization or isolation claim must ship with a merge-gating test that would fail if the control were removed.
- [ ] **Documentation describes what exists, not what is planned.** Two module READMEs in this repo advertise a React/Express/PostgreSQL/JWT/Cloudinary system that was never built. Aspirational docs are worse than absent ones. Mark unbuilt work as unbuilt, including in this file.
