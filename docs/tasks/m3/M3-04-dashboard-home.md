# feat(m3): dashboard route with day cards and keyboard-complete navigation

### Metadata
- **Local Task**: `M3-04`
- **Related Spec**: `docs/specs/2026-09-11-spec-m3-presentation.md` §6 M3-02, §2.1 G-M3-5/G-M3-6
- **Architectural Decisions**: ADR-0004, ADR-0005
- **Milestone**: `M3: Presentation`
- **Priority**: `#priority/p1`
- **Labels**: `area:ui`, `area:frontend`, `type:feature`
- **Kanban Status**: `To Do`
- **Depends on**: M3-02 (tokens), M3-03 (harness)

## User Story & Context
**As a** user opening the app at the gym
**I want** to see push, pull, and legs as three cards with today's state and start one without touching a mouse
**So that** the first screen of the new app is usable by the person the legacy UI excluded

The legacy app's own baseline: **zero `aria-*` attributes across 1032 lines** of push-day HTML. This is the
first screen that has to beat it measurably, and the first route in the Lighthouse-100 list.

## Technical Scope & Invariants
### Files and seams
- `src/app/page.tsx` (replace the 14-line placeholder), day-card and phase-summary components under `src/app/(dashboard)/`
- Reads: RSC through `lib/supabase/server` + `WorkoutRepository` for today's session state; `GET /api/exercises` for the public library. **No client-side data layer yet** — this screen is server-rendered.

### Non-negotiable invariants
- [ ] Identity comes only from `requireUserContext()` → `getUser()`. Nothing reads a cookie to decide who the user is (ADR-0003 A1.2).
- [ ] Per-user page is `no-store`; only system content is cacheable (M2-06 precedent).
- [ ] Day accents appear **only** on the badge and 2px card border; "Start workout" is primary blue on every day, including pull.
- [ ] Every day identity and completion state is colour **+ icon + text**; an axe scan must not be able to infer otherwise.
- [ ] `aria-current` on the selected day; focus order follows visual order; whole card is one link, not a div with an `onClick`.
- [ ] Sign-in state handled: unauthenticated visitors get the sign-in flow, never a broken card list or a 500.

### Out of scope
- The runner itself (M3-06). Import dialog (M3-09). History (M3-08). Any client-side cache.

## Implementation Tasks
- [ ] 1. Render today's three days with server-side data; empty state when no routine content is seeded.
- [ ] 2. Keyboard path: tab order, visible focus at ≥3:1, Enter activates.
- [ ] 3. Add the axe assertion for this route to the M3-03 helper and Lighthouse for `/`.
- [ ] 4. E2E: unauthenticated → sign-in; authenticated → three cards with today's status.

## Acceptance Criteria
### Scenario 1: Happy path
- **Given** an authenticated user with no sessions today
- **When** they open `/`
- **Then** three day cards render with badge, icon, and text state; tabbing reveals a visible focus ring; Enter on a card reaches the start flow

### Scenario 2: Negative & error
- **Given** the database is unreachable
- **Then** the user sees the canonical error state, not an unstyled stack trace, and nothing about the failure is disclosed beyond the standard envelope

### Scenario 3: Boundary
- **Given** a system with zero seeded routine days
- **Then** the screen renders an explicit empty state rather than three undefined cards

## Automated Verification
```bash
npx playwright test tests/e2e/dashboard.spec.ts
npm run lint && npm run typecheck && npm test
```

## Shipped note (2026-09-11)

Implemented on `feat/m3-04-dashboard`. Two things the card did not anticipate, both
recorded here because the card is the specification a future reader trusts:

1. **A second route came along with it.** The card's acceptance criterion "Enter on a
   card reaches the start flow" has nowhere to arrive: `/session/[id]` did not exist,
   and #63 (the runner) owns it. So #61 ships `/session/[id]` as a **read-only**
   session view — no ticking, no timer, no controls, and deliberately no disabled
   ones, because a greyed-out checkbox advertises a capability the app does not have.
   #63 replaces that route rather than sitting beside it; the path is reserved now so
   the card's link has a permanent target.
2. **`interactive: false` for `/` was flipped to `true`** in
   `tests/e2e/a11y.spec.ts`, which is the gate M3-03 (#60) left armed for this slice:
   the dashboard must now expose a focusable control and the first Tab must land on a
   real one.

Also surfaced while building it: `schema-constraints.test.ts` inserted a system
routine day (`owner_user_id IS NULL`, slug `test-push`) and never deleted it, so the
dashboard rendered a fourth card called "Test Push". Fixed in the same branch — the
leak had been present since M1 and was only visible once something displayed the
system-day list.
