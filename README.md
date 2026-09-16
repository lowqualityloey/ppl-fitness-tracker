# PPL Fitness Tracker 💪

A Push-Pull-Legs workout tracker: guided sessions (pre-workout checklist → warm-up → main
workout → cool-down), absolute-deadline rest and stretch timers, optimistic set logging
reconciled through a durable outbox, personal records from Epley e1RM, history, per-exercise
progress, body measurements, versioned JSON export, an offline shell, and magic-link auth —
on Next.js 16, PostgreSQL (Supabase) with row-level security on every table.

This repo spent 2026-09 as a migration with two stacks coexisting. That ended with
**#103 (M4-14, 2026-09-16)**: the legacy vanilla-JS estate — the root `index.html`
dashboard, `ppl-workout-dashboard/`, the three day folders, `SECURITY_IMPROVEMENTS.md`,
and `vite.config.js` — **is deleted**. `tests/e2e/legacy-parity.spec.ts` now fails if any
of it reappears or if any app source writes one of its five `localStorage` keys again.

## Getting started

Prerequisities: Node ≥ 20.9 (nvm default v24.20.0), Docker, the Supabase CLI, npm.

```bash
npm install
cp .env.example .env.local        # fill in the values PROMPTKIT.md §3 documents
npm run db:up                     # project-scoped Supabase stack (never a foreign one)
npm run db:seed && npm run db:seed:stretches
npm run next:dev                  # http://localhost:3001
```

Sign-in is email magic-link; in local development the link is printed by GoTrue — see
`PROMPTKIT.md` §3 for the measured traps before blaming the app.

## Commands

| Command | What it does |
| :--- | :--- |
| `npm run next:dev` / `next:build` / `next:start` | the app, port **3001** |
| `npm run typecheck` | `next typegen` + `tsc --noEmit` (never bare `tsc`) |
| `npm run lint` | `eslint --max-warnings=0 .` — warnings fail |
| `npm test` | unit + DB-backed integration (needs the stack up) |
| `npm run test:api` | route-handler suites against a real boot server |
| `npm run test:e2e` | Playwright battery vs a **production** build (axe, contrast, Lighthouse, parity) |
| `npm run test:mutation` | proves the RLS suite can fail (M0 discipline, still live) |
| `npm run db:up` / `db:down` / `db:seed` | the local Supabase project |

`npm run dev`, `build`, and `preview` are the retired legacy Vite scripts: they have no
inputs anymore and fail immediately. #104 (M4-15) removes them; do not wire anything to
them in the meantime.

## If you are coming from the old app

Your old workouts live in **this browser's** `localStorage`, not in the deleted files.
Sign in, open **Settings → Import from the old dashboard**, and the importer will read
whatever this browser still holds, build a per-session report, and leave the source
untouched. Repeating the import is fingerprint-idempotent. The import is the retirement
plan for the legacy keys: it reads them, never writes them, and the five key names will
stay inert once every browser that holds them has imported (or aged out).

## Layout

```
src/            Next.js App Router: screens, route handlers, client islands
lib/            domain engines, repositories, contracts (Zod), logger, import
db/             schema (Drizzle) + content seeds (exercises, stretches)
supabase/       hand-authored migrations (ADR-0006) + local config
scripts/        CI-executed gates: contrast matrix, mutation check, sw manifest
tests/          unit · integration (+api) · e2e (Playwright) — the gates live here
docs/           specs, task cards, STATE.md (the live position), ADRs, releases
```

The authoritative project state is `docs/STATE.md`; engineering conventions and measured
machine facts are in `PROMPTKIT.md`; design tokens and their contrast gate are in
`DESIGN.md`.
