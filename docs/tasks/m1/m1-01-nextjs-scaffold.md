### Metadata
- **Related Spec**: `docs/specs/2026-09-08-spec-fullstack-migration.md` §3, §6 (M1)
- **Architectural Decision (ADR)**: `docs/adrs/0001-nextjs-16-react-19.md`
- **Milestone**: M1: Contracts & Seams
- **Priority**: `#priority/p0` (Blocker — everything else in M1 builds on this)
- **Labels**: `area:infra`
- **Depends on**: none

---

## User Story & Context

**As a** developer starting the target-stack build
**I want** a Next.js 16 + React 19 + TypeScript-strict scaffold at the repository root
**So that** every subsequent M1 task has somewhere to land code, with the lint/typecheck/test tooling already wired to fail loudly on drift.

The legacy vanilla-JS app (`push-day-workout/`, `pull-day-workout/`, `legs-day-workout/`, `index.html`) keeps running unmodified during the migration — see `PROMPTKIT.md` §4, no monorepo, single Next.js app at the repo root, coexisting with the legacy static pages until M4 decommissions them.

---

## Technical Scope & Invariants

### Files & Endpoints Touched
- New: `app/`, `next.config.ts`, `tsconfig.json` (target stack — do not touch the legacy `vite.config.js`)
- New: `.eslintrc` / `eslint.config.js`, `vitest.config.ts` or equivalent, `playwright.config.ts` (config only, no tests yet — M1-16 adds the first ones)
- Modify: `package.json` — add scripts, do not remove the legacy `dev`/`build`/`preview` scripts (still needed until M4)
- Modify: `PROMPTKIT.md` §3 — fill in the "Target (do not invoke until M1 scaffolds them)" command table with real, verified commands

### Non-Negotiable Invariants
- [ ] **TypeScript strict**: `"strict": true` in `tsconfig.json`, zero `any` per `PROMPTKIT.md` §6
- [ ] **Node ≥ 20.9** enforced via `"engines"` in `package.json`; every command in this repo must be run through the explicit-nvm-source form documented in `PROMPTKIT.md` §3, not assumed
- [ ] Legacy `npm run dev` / `npm run build` / `npm run preview` continue to work unmodified after this change — this is the regression to check, not just the new scaffold
- [ ] No monorepo tooling introduced (`PROMPTKIT.md` §4) — single `package.json` at the root

### Out of Scope
- Supabase project creation and environment variables (M1-02)
- Any Drizzle schema or database code (M1-03)
- Tailwind/shadcn/design tokens (M3)
- Vitest/Playwright *test files* — this task wires the runners only; the first real tests land in M1-08 and M1-16

---

## Implementation Tasks
- [ ] 1. Scaffold Next.js 16 App Router with `--typescript --eslint` at repo root, verifying it does not collide with existing `index.html` / legacy directories
- [ ] 2. Set `tsconfig.json` to `strict: true`, add `noUncheckedIndexedAccess: true`
- [ ] 3. Wire Vitest (unit/integration) and Playwright (E2E) config, no test files yet
- [ ] 4. Add `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e` scripts alongside the existing legacy scripts
- [ ] 5. Update `PROMPTKIT.md` §3 "Target" command table with the commands actually verified to run
- [ ] 6. Confirm `npm run dev` (legacy) and `npx next dev` (target) can coexist without port or config collision

---

## Acceptance Criteria

### Scenario 1: Happy path — target stack builds and typechecks
- **Given** the scaffold is committed
- **When** `npx tsc --noEmit` and `npx next build` are run
- **Then** both exit 0 with no errors, and the build output contains real Next.js artifacts (unlike the legacy `npm run build`, which is documented in `PROMPTKIT.md` as emitting zero JS)

### Scenario 2: Regression — legacy app still works
- **Given** the scaffold has been added
- **When** `npm run dev` (legacy Vite script) is run
- **Then** it starts on its existing port and serves `index.html` and the three workout pages exactly as before

### Scenario 3: Strict mode actually strict
- **Given** a deliberately introduced `any`-typed variable in a throwaway file under `app/`
- **When** `npx tsc --noEmit` is run
- **Then** it fails with a strict-mode diagnostic — proving `strict: true` is enforced, not just declared

---

## Automated Verification Command
```bash
npx tsc --noEmit && npx next build && npm run dev -- --help >/dev/null
```
