> **M4-04** · Production hardening · `#priority/p2` · Derived from: handoff §3.1 last bullet ("**The rate limiter is process-local** (`lib/auth/rate-limit.ts`): N instances = N × every budget. Fine on one box, fiction on many. M4's multi-instance story needs shared state or documented acceptance"); `lib/auth/rate-limit.ts`'s own comment ("Do not treat process memory as a horizontally-scaled production control"); `docs/STATE.md` §5 ("the **rate limiters are process-local**").

## Intent
As the deployer, I want every rate budget in this app to either survive multiple server instances or be **explicitly accepted** as single-instance-only in writing — so nobody reads "120 req/min" as a production control when it is a per-process one.

## What the record says
- `AuthRateLimiter` is a sliding window in a `Map` in process memory (verified on `main` 2026-09-12: file comment says process-local outright). The legacy-import limiter (5/hour, M2-05) and the sync budget (120/min, M2-06) use the same module family.
- The poll cadence budget arithmetic (M3 spec §8.3, ≤40% of 120 req/min) assumes the limiter actually holds at 120 — under N instances it holds at N×120.

## Scope
One decision, implemented fully:
- **(a) Shared state**: replace in-memory storage with a shared atomic store reachable from the runtime role (the module already "hides storage behind one module so a shared atomic store can replace it"). RLS-legal, `DATABASE_URL`-only per STATE §4 item 18, or a written rationale for a side store.
- **(b) Documented acceptance**: v1 deploys single-instance; the constraint ships in `PROMPTKIT.md` §2/§3 and any deploy checklist, and the limiter's comment points at that decision.

## Out of scope
Changing any *budget value*; DoS posture beyond this app's stated single-user scale (spec §2 non-goals).

## Acceptance criteria
```gherkin
Scenario: (a) chosen — the control scales
  Given shared storage
  When two server processes enforce the same user's budget
  Then the combined allowance is the configured budget, not 2× it
  And an integration test proves that by crossing the limit from two contexts — and is observed red when the shared store is stubbed back to memory

Scenario: (b) chosen — the prose tells the truth
  Given single-instance acceptance
  When the card closes
  Then PROMPTKIT.md and the deploy notes state the N×120 consequence of a second instance in one sentence a reader cannot skip

Scenario: Existing behaviour is undisturbed
  Given either outcome
  When the current limiter unit specs run
  Then they pass with their semantics intact (same windows, same 429 envelope, retryAfter honest)
```

## Automated Verification
```bash
npm test                                  # limiter unit suites
npm run test:api                          # 429 envelope specs on real routes
# (a) additionally: the new two-process integration spec, e.g.
node --env-file-if-exists=.env.local node_modules/vitest/vitest.mjs run tests/integration/<shared-limiter spec>
```

## Definition of done
The sentence "the rate limiters are process-local" is removed from `docs/STATE.md` §5's residual list — because it stopped being true, or because it became a documented, owned limitation.

## Dependencies
- Independent; interacts with M4-01 (a 50 rps single-user driver hits the limiter; the harness design in M4-01 already records this).
