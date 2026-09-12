> **M4-23** · Performance posture decision · `#priority/p2` · Derived from: handoff §3.1 bullet 2 ("**G-M3-3's margin is a 4 s poll interval, not engine speed.** p95 4503 vs 5000 ms budget means any real slowdown eats it. Poll cadence is pinned by the §8.3 limiter arithmetic (120 req/min per user, polls ≤ 40%) — so the fix is not a shorter poll. **It is Realtime, and Realtime is a privilege decision**: the browser's role has no SELECT policy on application tables (spec §3.4), so enabling it widens RLS and needs its own tenancy gate. **Deferred by owner decision; M4 owns whether to revisit.**").

## Intent
As the owner, I want the cross-device <5 s promise to stop being one bad deploy away from failing: today it passes *because the poll interval is 4000 ms and the budget is 5000* (handoff §1 G-M3-3: "margin is the poll itself"; audit final table: p95 4388–4451 ms). Either buy headroom with Realtime — at a security price this repo should set its own gate on — or accept and *monitor* the margin with the promise restated honestly.

## What the record says
- Realtime is structurally absent, by evidence, not assumption: zero `.channel(`/realtime references; `npm run db:up` starts with `-x realtime`; 66 RLS policies target `app_authenticated` / one `public`, **zero** `authenticated`, and no table is in `supabase_realtime` (`PROMPTKIT.md` §2; STATE §8's 2026-09-11 `pk:plan` row).
- Enabling it means the browser's role reads application tables under a *new* policy surface — the tenancy gate pattern (M0/M1's mutation-tested suites) must cover any such policy; this is exactly how RLS got widened before, and the same discipline applies: assert what the new role can see, cross-user, with an exercised failure mode.
- Shortening the poll collides with the §8.3 budget arithmetic (≤40% of 120 req/min) — pinned by design (M3 spec), so the decision space really is {Realtime, accept, accept-with-hybrid (poll coarser, wake on focus?)}.

## Scope
Decision card with teeth: a written ADR (new file `docs/adrs/0006-…` — supersedes nothing, records the privilege trade-off), and if Realtime is chosen, its implementation carries its own tenancy gate + a G-M3-3 re-measurement with the *poll* no longer the margin; if acceptance is chosen, `sla.spec.ts` and STATE/PROMPTKIT restate the budget's dependency, and M4-05's telemetry watches the margin instead.

## Out of scope
Web Push; multi-user presence (spec §2 non-goals).

## Acceptance criteria
```gherkin
Scenario: The privilege decision is made on paper first
  When the card closes
  Then an ADR exists stating: the RLS widening considered (policies, role, tables), the §8.3 arithmetic, the measured p95 (4388–4451), and the chosen posture with its revisit trigger

Scenario: If Realtime ships, tenancy precedes traffic
  Given Realtime enabled for any application table
  When the merge gate runs
  Then a mutation-tested tenancy suite covers the new policy path (cross-user subscribe rejected, watched red when the policy is loosened as a control) — no browser channel may see what no SELECT policy allows

Scenario: If acceptance ships, prose matches math
  Given the 4 s floor stands
  When docs are updated
  Then no document calls G-M3-3 "fast" without the poll-floor sentence beside it, and the spec's §8.3 rationale cites this decision
```

## Automated Verification
```bash
# decision-only close: the ADR path exists and is linked from STATE §6
# implementation branch additionally:
npm run test:mutation && npm run test:api
npx playwright test sla.spec.ts -g "G-M3-3"   # margin re-measured under the chosen mechanism
```

## Definition of done
"M4 owns whether to revisit" becomes a revisit with a recorded answer; `STATE.md` §5's four-prose-vs-reality list loses its G-M3-3 entry one way or the other.

## Dependencies
- Informed by: M4-01 (load data), M4-05 (margin monitoring option). Coordinated with: M4-04 (limiter model changes what budgets mean).
