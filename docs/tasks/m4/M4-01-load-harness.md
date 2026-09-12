> **M4-01** · Production verification · `#priority/p0` · Derived from: master RFC `docs/specs/2026-09-08-spec-fullstack-migration.md` §SLA table (`POST /api/sync` p95 **< 200 ms @ 50 rps**) and its M4 line ("load test against the `/api/sync` SLA"); handoff §3.1–§3.2; `docs/STATE.md` §5 ("the 50 rps condition §3 actually specifies is still untested") and §7 item 22.

## Intent
As the owner deciding whether this app is deployable, I want a **sustained 50 rps load test of `POST /api/sync` on a production build** so the SLA the RFC actually specifies — *p95 < 200 ms at 50 rps* — is finally measured, and so per-request cost and sustained connection-pool behaviour are no longer inferred from sequential traffic.

## What the record says (numbers quoted, not assumed)
- Everything M3 measured about that budget is **sequential**: 50 single-mutation POSTs, one at a time (handoff §3.1; `tests/e2e/sync-latency.spec.ts`, whose own comment says "the SLA condition is p95 < 200 ms *at 50 rps*, which is M4's work").
- Recorded sequential results span more than the handoff quotes: audit "final runs" table gives **p50 171.8–209.6 / p95 202.9–288.3 / max 216.4–344.8 ms across four runs** (handoff §3.1 quotes two of those runs as p95 234.2–282.1); M3-03's first prod run hit max 609.9 ms; PR #72's CI runner saw p95 222.0 ms. The enforced 800 ms ceiling (M2-06) holds everywhere.
- Pool behaviour: per-request cost is measured (+1.29 ms p50 direct / +1.98 ms pooled, ADR-0003 amendment); "sustained exhaustion is not" (RFC grill note, spec line 451; `STATE.md` §5). The spike reached 40 interleaved concurrent transactions on one container — "not a load test".
- The rate limiter is process-local (M4-04) and the per-user 120 req/min sync budget (M2-06) is *real* — a 50 rps driver using one user will be throttled, not load-tested. The harness must spread authenticated users or measure the limiter deliberately.

## Scope
- A load driver (script under `scripts/` or a dedicated suite) producing **50 rps sustained for a stated duration** against `next:start`'s production server with real auth sessions, recording per-request latency percentiles, HTTP status mix (incl. 429s from the limiter — counted, never hidden), and Postgres-side observations (pool waits/active connections) for the exhaustion question.
- The run's artifact lands in `docs/perf/` (per repo output-path convention) with the reproduction command verbatim.
- Deliberately **outside CI's merge gate** unless a cheap steady-state variant emerges; CI runner capacity is not this box (audit 17/19 lesson).

## Out of scope
Optimizing anything (M4-03), batch contention (M4-02), shared limiter state (M4-04). This card's product is **the number and the harness that prints it**.

## Acceptance criteria
```gherkin
Scenario: The documented condition is finally exercised
  Given a production build and the local stack up
  When the harness runs at 50 rps for the stated duration
  Then it prints p50/p95/max for POST /api/sync, the 429 count, and a PASS/MISS line against the 200 ms @ 50 rps SLA
  And the run is reproducible from one command sequence recorded in docs/perf/

Scenario: The harness can fail — watched, not assumed
  Given the harness
  When a deliberate slowdown (e.g. an artificial sleep injected in a scratch build) is applied
  Then the harness reports a MISS reflecting it
  And the injection is reverted and the restored build re-measured (STATE §4 item 16: every control ships with an exercised failure mode)

Scenario: Sustained pool behaviour is observed, not guessed
  When the run completes
  Then connection-level evidence (pool waits / max concurrent / errors) is captured next to the latency table
  And the ADR-0003 "scales with RTT" caution is confirmed or contradicted with data

Scenario: Negative — limiter interference is visible
  Given the driver hammers fewer users than the run demands
  When the 120 req/min per-user budget starts rejecting
  Then the report separates 429s from the latency percentiles instead of letting fast rejections flatter p95
```

## Automated Verification
```bash
npm run db:up
set -a && . ./.env.local && set +a
fuser -k 3001/tcp 2>/dev/null
npm run next:build && npm run next:start &        # the harness targets the production server
npm run load:sync        # or: npx tsx scripts/load-sync.ts --rps 50 --duration 300s   (exact form decided in-PR; it must be one command)
# the injection control is run and reverted per STATE §4 item 16
```

## Definition of done
A committed harness + a `docs/perf/` record of at least one full run **on this machine** whose numbers are quoted in `docs/STATE.md` §5 (replacing "the 50 rps condition is still untested"), the harness's MISS path observed firing, and the 200 ms SLA's status stated as measured. No budget is moved by this card — only measured.

## Dependencies
- Blocks: M4-02, M4-03 (their re-measurements ride this harness).
- Sibling: M4-05 (correlation ids make a load run diagnosable; land before deep-diving failures).
