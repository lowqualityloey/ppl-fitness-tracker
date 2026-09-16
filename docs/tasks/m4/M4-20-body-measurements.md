> **M4-20** · M3 named non-goal · `#priority/p2` · Derived from: handoff §3.4 bullet 4 ("**Body measurements / `userStats`** (M3-08/M3-09 out-of-scope): no contract models them; the settings screen says import does not cover them, which is honest but **not a plan**"); master RFC M4 territory; `docs/STATE.md` §7 item 22.

## Intent
As the owner, I want the `userStats` question answered with a plan: body measurements either get a modeled contract + storage + UI path, or the non-support becomes a written product decision — the current state is a screen apologizing for a hole nobody scheduled.

## What the record says — as executed (pk:grill + implementation, 2026-09-16)
- **F-1 (the mandated kind-diff, executed):** legacy `userStats` was never *written* by anything. `ppl-workout-dashboard/app.js:148` reads the key and fabricates `{streak, totalWorkouts, hoursTrained, lastWorkout, nextWorkout}` at render when absent; a **whole-estate sweep** of all six legacy JS files (dashboard + three day folders + auth) finds exactly one occurrence — the read — and zero `setItem('userStats')`. Stranded fields: **none**. The settings prose "(weight, height)" was factually wrong and is retired with the card it sat on. (Disclosure: the first sweep was directory-limited; the grill widened it.)
- **OC-1:** the model is the six ratified kinds (`body_weight`, `body_fat_pct`, `neck_cm`, `waist_cm`, `chest_cm`, `hip_cm`); no `height_cm` — height is profile, not a time series.
- **OC-2 (in-PR scope addition, owner-ratified):** this card fills the `ExportV1Schema.measurements` slot #110 reserved; same version, no bump.
- **OC-3 + G-1:** `GET` requires `from`/`to`, optional `kind`; `MEASUREMENT_RANGE_CAP = 2_500` derived (6 kinds × 366 worst honest year), breach is an explicit 400 naming the remedy; the pin refuses any kind set whose worst year exceeds the cap.
- **PD-A:** the spec's `lib/measurements/` service layer was not built — routes are adapters (profile precedent).
- **AC-2 amended by evidence:** the tenancy suite is repository-bound and cannot witness a policy-less table; the **drift suite** was the RED witness (`body_measurements: policy_count=0` captured), same file amended to four discrete policies, `supabase db reset` replayed the final form green — G-2's choreography, executed.
- **M4-14 dependency satisfied:** the key-retirement story is now "nothing was ever in it" — this section is the description M4-14 must cite; the ordering note discharged.

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

## Implementation record (PR branch `feat/m4-20-body-measurements`, 2026-09-16)
Six milestones, in-order commits: planning record + grill findings (G-1 cap derivation, G-2 RED-first choreography, G-3 server-echo posture, G-4 wave-gate evidence restated, G-5 prose traceability) → contracts + export-slot identity (import, not copy) → migration watched RED at drift then GREEN at full replay → repository + routes + 10-case API suite incl. 2,501-row honest-400 and raw app-role wall → settings panel replacing the apology card (e2e round-trip + axe; census stayed 16) → export fill both directions. Spec §8.1's ASSUMPTION-m4-001 gained its Resolution Evidence (design §2). Verification: `tsc` 0, `lint` 0, `test:mutation` green, `npm test` 618+/618+, `test:api` 81/81, `settings.spec.ts` 8/8, `next:build` clean.
