> **M4-03** · Performance · `#priority/p1` · Derived from: handoff §3.1 bullet 3 ("Production `/api/sync` p95 **misses the documented 200 ms budget** … The 200 ms figure stayed *documented, not enforced*; the enforced 800 ms ceiling holds. This is the honest current state of the claim, not a regression"); `docs/STATE.md` §5 (attribution: ~14–19× p95 gap vs the no-auth `GET /api/exercises` baseline attributed to the authenticated write path — two `getUser()` round trips plus the per-user transaction); audit entry 16 and its "final runs" table.

## Intent
As the owner, I want the `/api/sync` 200 ms promise **settled**: either the code closes the gap, or the documentation stops promising what it does not enforce — because today the printed `MISSES` line is an admission that nobody has decided which side is wrong.

## What the record says (and one range correction)
- Sequential prod measurements: **p95 202.9–288.3 ms across four audit runs** (the handoff's "234.2–282.1" quotes only two of them), max up to 344.8 ms; the first-ever prod measurement (M3-03) saw p95 272.8 / max 609.9; PR #72's CI runner: p95 222.0. All above 200.
- The **condition attached to the number in the RFC is "@ 50 rps"** (spec §SLA table) and sequential runs never produced 50 rps — so strictly, both the promise and every "miss" are being compared outside their stated condition. M4-01 measures the condition; this card settles the promise.
- The enforced 800 ms ceiling (M2-06) holds on all recorded runs; the no-auth GET baseline is p95 7.2–16.9 ms on both machines, so the cost is authenticated-path-specific.

## Scope
- After M4-01 (and M4-02) data exists: choose with evidence — (a) remediate the authenticated path (candidate costs named by the record: per-request `auth.getUser()` round trips through the pooler, per-user transaction overhead — ADR-0003 says the GUC cost is measured (+1.29/+1.98 ms) and RTT-scaled; the two `getUser()` trips are the suspect), or (b) amend the documented SLA in the RFC + `PROMPTKIT.md`/`STATE.md` to the enforced reality with the measured numbers cited.
- If (a): the fix keeps RLS/`withUser` semantics intact (STATE §4 items 3–6, 13, 18 are not negotiable for latency).
- Either way the 200 ms ambiguity ends: `sync-latency.spec.ts` stops printing "MISSES vs documented" against a figure that is not enforced.

## Out of scope
The 50 rps harness itself (M4-01); the limiter model (M4-04); any budget increase without a re-run proving reality changed (locked protocol).

## Acceptance criteria
```gherkin
Scenario: The promise and the enforcement agree
  Given the M4-01/M4-02 measured distributions
  When this card closes
  Then either the production /api/sync p95 is at or under 200 ms with a gate asserting it,
  Or the documented SLA in the RFC, PROMPTKIT.md and docs/STATE.md quotes the measured value and the enforced 800 ms ceiling — with no surviving text claiming 200 ms as current

Scenario: A fix cannot buy speed with tenancy
  Given remediation option (a) was chosen
  When the change lands
  Then the tenancy, RLS, schema-drift, and mutation suites stay green unmodified, and no path bypasses withUser()/requireUser()

Scenario: Negative control
  Given option (a) and a new assertion/gate
  When the optimization is reverted locally (scratch)
  Then the gate is observed to go red — a budget control that has never fired is a decoration (STATE §4 item 16)
```

## Automated Verification
```bash
npm run test:api:preflight && npm run lint && npm run typecheck && npm test && npm run test:api && npm run test:mutation
npx tsx scripts/load-sync.ts --rps 50 --duration 300s     # M4-01 harness verdict line
npx playwright test sync-latency.spec.ts                  # prints p50/p95/max vs whatever budget now stands
```

## Definition of done
`docs/STATE.md` §5's "the four things whose measured reality differs from their prose" loses its first entry, with a measurement reference — not a relabelling — as the reason.

## Dependencies
- Blocked by: M4-01 (+ M4-02 for the batch picture). Feeds: the deploy-readiness narrative in `STATE.md` §1.
