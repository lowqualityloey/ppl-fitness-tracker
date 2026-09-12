> **M4-16** · Contract honesty · `#priority/p2` · Derived from: handoff §3.4 erratum ("What it *does* own are the two limits #73 disclosed and did not close — `SyncResponseData.state` has no runtime consumer, and `tests/e2e/session-runner.spec.ts:174` mocks that field in a shape the contract never had"); `docs/STATE.md` §7 item 22 ("**Fix the mock when you add the consumer, in the same change**").

## Intent
As the next person to touch sync reconciliation, I want the `state` field in the sync response to stop being a payload that is strictly validated on the producer, **fabricated by a consumer's mock, and read by no one** — either the client adopts server state from batches (killing a class of refetch races) or the field is deleted and the contract stops shipping bytes nobody parses.

## What the record says
- `SyncResponseDataSchema.state: SessionStateSchema` (verified at `lib/contracts/sync.ts:84`); producer validation via `validateOutgoing` ships on every full sync response (#73).
- No runtime consumer: the provider maps `applied`/`rejected`/`serverSeq` and refetches on rejection (verified 2026-09-12: no `.state` read in `src/app/state/`); STATE §5's #73 bullet says so.
- The mock at `tests/e2e/session-runner.spec.ts:174` sends `state: { session: {...} }` — **a shape the strict contract never had**, inert only because nothing parses it (verified on `main`). Its first real consumer makes it red; today "it evidences nothing" (STATE §7 item 22, verbatim).

## Scope (decision → implementation, one PR)
- **Option A — consume**: on applied-with-state responses, the client projects the returned `SessionState` instead of refetching on the happy path (rejection still refetches per §4.3/§8.2's rule, which #63's "another tab" spec pins). Reconcile the typed state with optimistic pending mutations exactly as `reconcile.ts` does with refetch results.
- **Option B — remove**: drop `state` from `SyncResponseDataSchema` and the producer payload; a contract narrowing is a breaking wire change — old clients (the shipped IndexedDB queue replays across deploys!) must not hard-fail: prove replay of a queued batch written by the previous build against the new server, in a spec.
- **Either way**: replace the `:174` fabrication with a fixture **derived from and parsed by** the contract (`.strict().parse` inside the fixture builder, so no future mock can invent shape — the #73 lesson applied to test data).

## Out of scope
#77 (rejection *messages* — assigned M4, different seam; if it lands first, this card's option A renders its message where relevant). Server apply semantics unchanged.

## Acceptance criteria
```gherkin
Scenario: The field is load-bearing or gone
  Given option A: When a batch applies cleanly, Then the UI reaches server truth without a refetch of that data (asserted by request-count: rejection keeps refetching, applied may not)
  Given option B: When the battery runs, Then no code path or schema mentions the removed field

Scenario: The mock cannot lie again
  When any e2e fixture builds a sync response body
  Then it passes through SyncResponseDataSchema.parse (or the new contract) at build time — an injected wrong-shape field is observed to throw in the fixture, captured in the PR

Scenario: Old queues survive deploys (option B only)
  Given a batch queued under the current contract
  When it POSTs to a server running the narrowed one
  Then it applies or is rejected *legibly* — never a 500, never a silent discard
```

## Automated Verification
```bash
npm test && npm run test:api
npx playwright test session-runner.spec.ts      # incl. the rejection-refetch control that must stay green
node --env-file-if-exists=.env.local node_modules/vitest/vitest.mjs run tests/unit/state/    # reconcile/sync-engine layers
```

## Definition of done
STATE §7 item 22's "two disclosed #73 limits" bullet is struck, both halves, with the same-change rule honoured (consumer + honest fixture together, or removal + replay proof + fixture rebuild).

## Dependencies
- Soft: after M4-11 (this card changes E2E sync specs; do it on a non-flaky base) and coordinated with #77 (assigned M4).
