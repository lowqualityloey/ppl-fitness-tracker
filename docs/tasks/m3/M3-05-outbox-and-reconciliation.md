# feat(m3): durable offline outbox and server reconciliation

### Metadata
- **Local Task**: `M3-05`
- **Related Spec**: `docs/specs/2026-09-11-spec-m3-presentation.md` §3.2, §4.3, §8.1, §8.2, §8.3
- **Architectural Decisions**: ADR-0003, ADR-0005
- **Milestone**: `M3: Presentation`
- **Priority**: `#priority/p0` — this is where "offline-capable" is actually won or lost
- **Labels**: `area:frontend`, `area:data`, `type:feature`
- **Kanban Status**: `To Do`
- **Depends on**: M3-01 (cheap deltas are a hard prerequisite of polling, RFC §8.3)

## User Story & Context
**As a** user whose phone loses signal mid-set
**I want** every tap saved durably on the device and replayed without duplicating or losing a set
**So that** the workout I did offline is the workout that lands on the server

The outbox — not the components — is the milestone's risk centre. Everything else is recoverable; a lost set
is not.

## Technical Scope & Invariants
### Files and seams
- `src/app/state/outbox.ts`, `src/app/state/sync-engine.ts` (both **pure of DOM** where possible: IndexedDB and clock injected), plus unit specs that run in the existing Vitest node pool

### Non-negotiable invariants (RFC §4.3, each with a named test)
- [ ] **Durable before acknowledged**: a tap is not reported "saved" until IndexedDB holds it. Optimistic *UI* may precede that; a *promise* may not.
- [ ] **`mutationId` is generated once at enqueue time** and survives drain, retry, tab close, reload. A lost response is never a reason to mint a new id.
- [ ] **FIFO is not a transaction.** Item-level `applied[]`/`rejected[]` means mutation 2 can land while mutation 1 is refused. Never assume all-or-nothing (RFC §8.2).
- [ ] **Any rejection forces a full authoritative refetch** of that session. Surgical rollback is explicitly forbidden: it is how a client ends up asserting state the server never accepted.
- [ ] **One in-flight batch per user.** Two concurrent drains is a self-inflicted race; the 429 budget exists but is not a design goal.
- [ ] **Backoff is jittered and limiter-aware**: polls + writes stay under ~40% of the 120 req/min budget shipped in #42, with a slow poll whenever the page is hidden and an immediate poll after each own-write response (RFC §8.3).
- [ ] **`session.start` is not queueable.** The sync contract has four ops and none starts a session (RFC §8.1). Start requires connectivity; if it fails offline the user is told plainly rather than given a phantom session.
- [ ] **Mutations are stored with canonical kg**, never display-unit values, so a unit change while queued cannot corrupt the payload.
- [ ] `localStorage` is never the queue, and the five legacy keys are never written.

### Out of scope
- Runner UI (M3-06). Timers (M3-07). Realtime (deferred, RFC §3.4). Conflict resolution logic: the server's `server_seq` and M2-04 rules decide, the client only obeys and refetches.

## Implementation Tasks
- [ ] 1. Contract-style unit tests first, against an injected IndexedDB stub and injected clock: durability-before-ack, id reuse across reload, backoff sequence, single-in-flight.
- [ ] 2. Implement `Outbox` then `reconcile(baseSeq, serverState, pending)` as a **pure function** — RFC §3.3 rejects a separate `Reconciler` class.
- [ ] 3. Wire rejection → refetch; wire `pending$` to a visible queue count (rendered by M3-06).
- [ ] 4. IndexedDB schema version, and an explicit `QuotaExceededError` path that degrades to "online only" with a visible reason.

## Acceptance Criteria
### Scenario 1: Happy path
- **Given** an open session and a working network
- **When** the user ticks a set
- **Then** the row updates immediately, the mutation is in IndexedDB, and the drain removes exactly that `mutationId` after `applied[]` names it

### Scenario 2: Negative
- **Given** the network is off
- **When** the user ticks five sets and reloads
- **Then** all five are still pending after reload, in enqueue order, and the UI says "5 waiting to sync" rather than implying they are saved server-side

### Scenario 3: Boundary & concurrency
- **Given** a batch whose response is lost after the server applied it
- **When** the outbox drains again with the **same** ids
- **Then** the server reports them applied (idempotent), the session's set row count does not change, and a rejected item triggers exactly one authoritative refetch

## Automated Verification
```bash
node --env-file-if-exists=.env.local node_modules/vitest/vitest.mjs run tests/unit/state/
npx playwright test tests/e2e/offline-session.spec.ts   # lands in M3-06; the plumbing is here
```
