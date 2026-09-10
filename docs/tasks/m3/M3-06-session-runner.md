# feat(m3): session runner with optimistic sets, prefilled load, and phase navigation

### Metadata
- **Local Task**: `M3-06`
- **Related Spec**: `docs/specs/2026-09-11-spec-m3-presentation.md` §6 M3-03, §2.1 G-M3-1/G-M3-2, §8.1
- **Architectural Decisions**: ADR-0004, ADR-0005
- **Milestone**: `M3: Presentation`
- **Priority**: `#priority/p0` — the app's reason to exist
- **Labels**: `area:ui`, `area:frontend`, `area:perf`, `type:feature`
- **Kanban Status**: `To Do`
- **Depends on**: M3-00 (prefill), M3-04 (tokens), M3-05 (outbox)

## User Story & Context
**As a** user mid-session with chalk on my hands
**I want** weight and reps already filled in from last time so a set is one tap, and I want the tick to paint
instantly even when the network is down
**So that** logging costs nothing and never blocks the set

G6's whole premise: the legacy app recorded completion as a bare boolean, so history could not mean anything.
The new runner adds weight/reps without adding interaction, and the client must **mirror** the server's phase
transitions, never re-derive them.

## Technical Scope & Invariants
### Files and seams
- `src/app/session/[id]/page.tsx` (RSC shell) + `src/app/session/[id]/runner.tsx` (client island)
- TanStack Query for server-cache and invalidation; **outbox is the durability layer, the query cache is not** (RFC §3.3)

### Non-negotiable invariants
- [ ] **All mutations go through `/api/sync` with a client-generated `mutationId`.** No Server Action or direct repository write for session mutations: the outbox must be able to replay them after the page is gone.
- [ ] **Set-tap to local UI update < 50 ms**, measured on the production build over 100 taps, median and p95 (G-M3-2).
- [ ] Phase gating is asked, not assumed: the client mirrors `SessionEngine`'s legal transitions and lets the server refuse. A client-side gate that "helpfully" allows an illegal transition is a bug even when the server catches it.
- [ ] Prefill values render with provenance ("last: Aug 3, 80 kg × 8") and are **editable defaults, not committed values** — prefill must never write a set the user did not touch.
- [ ] Weight/reps are canonical kg on the wire; `UnitDisplay` owns conversion (M3-09 delivers the toggle, this slice must not hardcode kg in the UI).
- [ ] Query keys are namespaced by `userId`. A cache keyed `['sessions']` is a cross-account leak on a shared browser, and gets a test (RFC §5.1).
- [ ] Every completion state: colour + icon + text label. `aria-live` for "set 3 of 5 completed"; `aria-current` on the phase stepper.
- [ ] Out of signal: Start requires connectivity and says so; **finish is queueable** (`session.finish` is a sync op), so a workout completed offline still archives on drain.

### Out of scope
- Rest timers and audio (M3-07). History rendering (M3-08). PR celebration copy beyond a live-region announcement.

## Implementation Tasks
- [ ] 1. Failing E2E first: tick a set offline → survives reload → drains → server rows equal intent (row counts, not response codes).
- [ ] 2. Build the runner island: phase stepper, set rows, editable prefilled inputs, optimistic tick through M3-05.
- [ ] 3. Tap-latency measurement in the E2E with `performance.measure()`; fail the slice if p95 > 50 ms.
- [ ] 4. Rejection surfaces as item-level state ("server rejected set 2 — reload"), plus the forced refetch from M3-05.

## Acceptance Criteria
### Scenario 1: Happy path
- **Given** a started session with prefill from the previous session
- **When** the user taps set 1 complete
- **Then** the row is visually complete within 50 ms, no network call is awaited, and after drain the server holds one row at that `setIndex` with the tapped weight and reps

### Scenario 2: Negative
- **Given** a mutation the server rejects (illegal phase transition)
- **Then** the tick is un-done, the reason is announced to a screen reader, and the session state is refetched — no local state survives to disagree with the server

### Scenario 3: Boundary
- **Given** an already-archived session id in the URL
- **Then** the runner is read-only and says the session is archived, rather than accepting taps into a queue that can never apply

## Automated Verification
```bash
npx playwright test tests/e2e/session-runner.spec.ts
node --env-file-if-exists=.env.local node_modules/vitest/vitest.mjs run tests/unit/state tests/unit/components
npm test && npm run test:api
```
