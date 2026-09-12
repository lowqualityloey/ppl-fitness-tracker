> **M4-20** · M3 named non-goal · `#priority/p2` · Derived from: handoff §3.4 bullet 4 ("**Body measurements / `userStats`** (M3-08/M3-09 out-of-scope): no contract models them; the settings screen says import does not cover them, which is honest but **not a plan**"); master RFC M4 territory; `docs/STATE.md` §7 item 22.

## Intent
As the owner, I want the `userStats` question answered with a plan: body measurements either get a modeled contract + storage + UI path, or the non-support becomes a written product decision — the current state is a screen apologizing for a hole nobody scheduled.

## What the record says
- Legacy `userStats` was **never written** by the legacy app (M2-05's inventory — the key exists in the five-key list because the parity scan proves the *old app owns the name*, and §8's 2026-09-08 row shows the dashboard invented everything else). Verified via audit entry 3's mechanism.
- Import explicitly excludes it and says so (G-M3-7's settings disclosure).
- Sequenced before M4-14's key deletion: whichever way this goes, it must not strand a key the deletion is about to retire. **Ordering note: if measurements survive, the import/retirement story of M4-14 must describe it — decide before deleting.**

## Scope
- Decision: model (table + Zod contract + `POST`/`GET` route + a settings form) or decline (rewrite the settings text to a policy sentence; delete the *idea* from prose).
- If modeled: Expand→Contract (STATE §4 item 12) under the M4-00 authorship model; new table ⇒ four discrete RLS policies, never `FOR ALL`, drift test covers it (item 6 — automatic once the table exists); repository takes `userId` first (item 5); no kg↔display coercion in storage (ADR-0005 — body measurements are their own unit story, decided in the contract, not smuggled through `units.ts`).
- Time-series shape (one row per measurement-date, not a mutable profile blob) so history exists the day it's wanted.

## Out of scope
Wearable integrations; body-fat derivation heuristics; syncing legacy keys that never had data.

## Acceptance criteria
```gherkin
Scenario: Decline is a decision
  Given option "no"
  When the card closes
  Then settings prose states the product policy (not an apology), STATE §1's "what does not exist" list keeps the line with a decision reference, and no schema shipped

Scenario: Model is a contract first
  Given option "yes"
  When the route ships
  Then contract, repository, RLS drift/tenancy suites, and route specs all cover the table — the tenancy suite is watched red before the policy exists (RED-first, this repo's M3 convention)

Scenario: Cross-user isolation by test, not by claim
  Given two fixture users
  When user A reads measurements
  Then B's rows are unreachable through route, repository, and raw app-role query — the same three-layer assertion shape as the sessions suites
```

## Automated Verification
```bash
npm run test:mutation && npm test && npm run test:api   # drift/tenancy cover a new table automatically
npx playwright test settings.spec.ts
```

## Definition of done
The word "not a plan" from §3.4 is false: one of the two outcomes landed with its tests or its prose.

## Dependencies
- Blocked by: M4-00 (authorship model, if schema). Ordering: precede or co-schedule M4-14's key retirement.
