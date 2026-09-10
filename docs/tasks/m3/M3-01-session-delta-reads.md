# feat(m3): implement real since deltas on session detail

### Metadata
- **Local Task**: `M3-01`
- **Related Spec**: `docs/specs/2026-09-11-spec-m3-presentation.md` §4.1, §8.3 (hard prerequisite of the poller)
- **Architectural Decisions**: ADR-0003
- **Milestone**: `M3: Presentation`
- **Priority**: `#priority/p1` — M3-05's polling SLA cannot be honestly claimed without it
- **Labels**: `area:backend`, `area:perf`, `type:feature`
- **Kanban Status**: `To Do`
- **Depends on**: nothing (parallel with M3-00)

## User Story & Context
**As a** client polling a live session every few seconds
**I want** an unchanged session to cost almost nothing to check
**So that** the <5 s cross-device SLA is met without transferring a full 8–15 KB session each time

`src/app/api/sessions/[id]/route.ts:31-32` currently reads:

```ts
// M2-01 accepts since for contract compatibility. M2-04 owns true deltas.
void parsedQuery.data.since;
```

M2-04 did **not** ship deltas. The comment is the most dangerous kind: accurate about intent, false about
reality. **Deleting it is the first task of this issue**, because a client written to believe it would poll
full sessions forever and never discover the difference.

## Technical Scope & Invariants
### Files and seams
- `src/app/api/sessions/[id]/route.ts`, `lib/repositories/workout-repository.ts` (`findSession` gains a seq short-circuit), `lib/contracts/sessions.ts` (`SessionDetailQuerySchema` semantics documented in the contract, not the route)
- `tests/integration/api/sessions.test.ts`, `tests/integration/repository/*`

### Non-negotiable invariants
- [ ] `workout_sessions.server_seq` is the only version token. Nothing may be derived from `updatedAt` or client clocks.
- [ ] **Unchanged ⇒ no session payload.** A `since` at or above current seq returns a tiny "no change" response carrying the seq. Semantics are fixed in the contract before implementation so no client can guess what "since" means.
- [ ] Changed ⇒ **full session**, not a patch. Diffs of set rows are out of scope for v1: an incomplete merge is a data-integrity bug, and a full read is what the offline outbox reconciles against (M3-05 §8.2).
- [ ] A `since` **above** the server's seq (client from the future, or another device archived it) is answered with the full current state, never an error.
- [ ] Per-user response stays `no-store`.

### Out of scope
- Realtime (RFC §3.4). Change-tracking tables. Any client polling code (M3-05).

## Implementation Tasks
- [ ] 1. Failing specs first: unchanged seq ⇒ no payload; changed ⇒ full; future seq ⇒ full; unauthenticated ⇒ 401.
- [ ] 2. Delete the stale comment and the `void` discard; wire `since` through to the repository.
- [ ] 3. Measure bytes-before/after in the PR description so the "polls are cheap" claim in RFC §8.3 is evidenced.

## Acceptance Criteria
### Scenario 1: Happy path
- **Given** a session at `server_seq = 7`
- **When** the client requests `?since=7`
- **Then** the response carries seq 7 and **no session body**, and is materially smaller than `?since=6`, which returns the full state at seq 7

### Scenario 2: Negative & error
- **Given** `?since=not-a-number`
- **Then** 400 `VALIDATION_ERROR`; **Given** another user's session id, **Then** 404/403 per the existing detail contract — never another user's payload

### Scenario 3: Boundary & concurrency
- **Given** `?since=99` against a session at seq 7
- **Then** the full current session is returned, because telling a client "you are ahead of me" would invite it to trust its own stale state

## Automated Verification
```bash
node --env-file-if-exists=.env.local node_modules/vitest/vitest.mjs run tests/integration/api/sessions.test.ts
npm test && npm run lint && npm run typecheck
```
