# feat(m3): history and per-exercise progress views on the read endpoints that already exist

### Metadata
- **Local Task**: `M3-08`
- **Related Spec**: `docs/specs/2026-09-11-spec-m3-presentation.md` §6 M3-04, §2.1 G-M3-5
- **Architectural Decisions**: ADR-0003
- **Milestone**: `M3: Presentation`
- **Priority**: `#priority/p1`
- **Labels**: `area:ui`, `area:frontend`, `type:feature`
- **Kanban Status**: `To Do`
- **Depends on**: M3-02, M3-03, M3-04 patterns; **no backend work** — `GET /api/sessions`, `GET /api/sessions/[id]`, and `GET /api/progress/:exerciseSlug` all exist and are tested

## User Story & Context
**As a** user three months in
**I want** to see what I did and whether it is going up
**So that** the weight and rep columns M2 added are worth anything

The M2-06 progress endpoint returns a per-session e1RM trendline **computed from logged sets**, plus
materialised PRs, and is already `no-store` for a reason: it is per-user data, and an `s-maxage` on a
strength curve is a privacy bug waiting for a CDN.

## Technical Scope & Invariants
### Files and seams
- `src/app/history/page.tsx`, `src/app/history/[id]/page.tsx`, `src/app/progress/[exerciseSlug]/page.tsx`
- Reads via RSC through the existing repositories; the chart is the only client component

### Non-negotiable invariants
- [ ] No new server endpoints. If a screen seems to need one, that is a spec gap to raise, not a reason to query the database from the browser.
- [ ] Per-user pages `no-store`; the public exercise library may stay edge-cached (M2-06 precedent).
- [ ] The trendline is rendered from the endpoint's values — **the client must not recompute e1RM**. Two implementations of one formula is how a chart starts disagreeing with a PR.
- [ ] Imported legacy sessions have NULL weight/reps by design (M2-05) and must render as "recorded without load", never as 0 kg and never as a phantom strength drop.
- [ ] Charts are decorative (`aria-hidden`) with the same data available as a text/table summary; no insight is chart-only (G-M3-6).
- [ ] Traversal-shaped slugs are a 400 at the contract boundary and an unauthenticated 401 — the route must not re-implement either check client-side and call it security.
- [ ] Empty states are explicit for a new user: no sessions, no PRs, and a valid exercise with no data are three different messages.

### Out of scope
- Body measurements and `userStats` (no contract exists; RFC §5.4). Volume and streak analytics. Export.

## Implementation Tasks
- [ ] 1. History list: by day with phase badges, keyboard navigation, `?from=`/`?to=` paging through the existing contract params.
- [ ] 2. Single-session view reusing the archived state, showing "no load recorded" where applicable.
- [ ] 3. Progress chart + equivalent table; assert both derive from one source array.
- [ ] 4. Lighthouse 100 on `/history`; axe assertions per route.

## Acceptance Criteria
### Scenario 1: Happy path
- **Given** a user with 12 archived sessions on bench-press
- **When** they open `/progress/bench-press`
- **Then** the trendline shows 12 points matching the endpoint exactly, PRs show `bestE1rm` and `achievedAt`, and the text summary lists the same values

### Scenario 2: Negative
- **Given** an exercise slug the user cannot see (another user's custom exercise)
- **Then** the app shows the same not-found state as a nonexistent slug, because distinguishing them would be a disclosure

### Scenario 3: Boundary
- **Given** only M2-05 imported sessions, which carry no load
- **Then** history lists them, and the progress view states "no load data recorded" with an empty chart rather than a line pinned at zero

## Automated Verification
```bash
npx playwright test tests/e2e/history.spec.ts tests/e2e/progress.spec.ts
node --env-file-if-exists=.env.local node_modules/vitest/vitest.mjs run tests/integration/api/progress.test.ts
```
