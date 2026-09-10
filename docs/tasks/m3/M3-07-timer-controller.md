# feat(m3): absolute-deadline rest and elapsed timers that survive a backgrounded tab

### Metadata
- **Local Task**: `M3-07`
- **Related Spec**: `docs/specs/2026-09-11-spec-m3-presentation.md` §3.2 (`TimerController`), §5.2 rows 1–2
- **Architectural Decisions**: ADR-0001
- **Milestone**: `M3: Presentation`
- **Priority**: `#priority/p1`
- **Labels**: `area:frontend`, `area:ui`, `type:feature`
- **Kanban Status**: `To Do`
- **Depends on**: M3-06 (the runner hosts the timers)

## User Story & Context
**As a** user who backgrounds the app between sets
**I want** the rest timer to be correct when I come back
**So that** I do not train against a clock that lied for three minutes

This module exists for one specific, documented defect: **every timer in all three legacy day modules
decrements a counter on `setInterval(…, 1000)`**, and browsers throttle background timers to roughly
one tick per minute — so a 90-second rest in a backgrounded tab finishes minutes late. Storing an absolute
`endsAt` and deriving `remaining` from `Date.now()` kills the class, not the instance.

## Technical Scope & Invariants
### Files and seams
- `src/app/state/timer-controller.ts` + unit specs with an injected clock; timer components inside the runner

### Non-negotiable invariants
- [ ] Deadlines are **absolute epoch instants**; no code path may hold a remaining-seconds counter as truth.
- [ ] Timers are **never synced** to the server and never enter the outbox (master RFC state table: "Timer deadlines — client only, never synced").
- [ ] `visibilitychange` recomputes remaining from `Date.now()`, and an elapsed-past-zero timer shows the overrun rather than silently resetting or freezing at zero.
- [ ] Audio unlock on first user gesture only (AudioContext cannot start untethered); a silent fallback when audio is unavailable is a supported state, not an error.
- [ ] Countdown announced via a `role="timer"` region with `aria-live` at a cadence that is informative rather than a screen-reader firehose; the finishing event announced exactly once.
- [ ] Cross-phase cancellation: advancing or finishing a session cancels any running timer; a leaked interval outliving its phase is a defect.
- [ ] Clock-injected so the background-tab case is a unit test, not an exercise in patience.

### Out of scope
- Persisting timer state across a full reload (deliberate: a rest timer is not worth outbox traffic). Server-side session duration (M2-04 owns `startedAt`).

## Implementation Tasks
- [ ] 1. Unit tests first: deadline arithmetic, `visibilitychange` recovery after a simulated 3-minute throttle, cancellation on transition, announce-once.
- [ ] 2. Implement `start(deadlineEpochMs) → { remaining$ }` and `cancel()`.
- [ ] 3. Wire to the runner with ARIA live regions; add the E2E that hides and reshows the page and asserts the displayed remaining time.

## Acceptance Criteria
### Scenario 1: Happy path
- **Given** a 90-second rest timer started at T
- **When** the tab is hidden from T+10 s and reshown at T+80 s
- **Then** it displays ~10 s remaining, not ~80 s and not a throttled wrong number

### Scenario 2: Negative
- **Given** the tab reshows at T+200 s
- **Then** the timer shows the finished state and announces completion **once**

### Scenario 3: Boundary
- **Given** a phase advance while a timer runs
- **Then** the timer is cancelled and no interval survives to write into the next phase's UI

## Automated Verification
```bash
node --env-file-if-exists=.env.local node_modules/vitest/vitest.mjs run tests/unit/state/timer
npx playwright test tests/e2e/timers.spec.ts
```
