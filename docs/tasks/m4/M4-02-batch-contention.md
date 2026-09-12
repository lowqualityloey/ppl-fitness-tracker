> **M4-02** · Production verification · `#priority/p1` · Derived from: handoff §3.1 bullet 1 ("M4's load test must re-measure the drain **under contention** — 1.7–1.8 s is a solo number; server-side apply of a 60-mutation batch is the untested part"); `docs/STATE.md` §5 G-M3-4 bullet ("What M4 still owns") and §7 item 22.

## Intent
As an athlete whose 60-mutation queue drains into a server that is *also* serving my other devices, I want the batch-apply path measured under competition — because G-M3-4's post-fix 1643–1838 ms is a **solo** measurement (audit entry 16's table), and the client-side half of the drain was already proven to hide a real defect there once (entries 15, `9ca17cc`).

## What the record says
- G-M3-4 post-fix: 60-mutation queue → one `POST /api/sync` [200] → empty in **1643–1838 ms**, five runs, budget 5 s, ceiling never moved (handoff §1, audit 15/16).
- The pre-fix 4693–9660 ms MISS was a *client* backoff bug, fixed; but the audit is explicit that what remains untested is **server-side apply of a 60-mutation batch with competition** (§3.1).
- Batch bound is `MAX_BATCH = 200` (`sync-latency`/`sla` specs print it); the M2-04 apply runs in one per-session transaction (STATE §3).

## Scope
Using the M4-01 harness (or a focused variant): concurrent sync traffic (multi-user, plus at least one client pair draining overlapping 60-mutation batches) against the production build; measure server-side apply latency distribution for the batch itself (route timing, not browser wall-clock), and the client's G-M3-4 figure under that load.

## Out of scope
Changing any budget (locked by measurement — STATE §7 item 21: "budget stayed 5 s through the whole investigation"); changing batching semantics; fixing slowness found (that becomes M4-03 or a new issue).

## Acceptance criteria
```gherkin
Scenario: Contended batch apply is a measured distribution, not an extrapolation
  Given N concurrent authenticated sync streams including at least two 60-mutation batches
  When the run completes
  Then the record shows batch-apply server-side latency (p50/p95/max) and each client's end-to-end drain time
  And a verdict line: G-M3-4's 5 s budget holds under contention, or misses it — printed, not argued

Scenario: The measurement gate can fail
  Given the harness
  When batch application is deliberately slowed (injected sleep inside the apply transaction, scratch build)
  Then the contended drain is observed breaching the 5 s budget
  And the injection is reverted and re-measured green

Scenario: No silent budget erosion
  When results land
  Then every number moves no threshold: budgets stay 5 s / 800 ms ceiling; a miss files a follow-up issue instead of editing a constant
```

## Automated Verification
```bash
# via the M4-01 harness with the batch profile, e.g.:
npx tsx scripts/load-sync.ts --profile batch60 --contention
# plus the existing solo spec as the control that the fix path still works:
npm run next:build && npx playwright test sla.spec.ts -g "G-M3-4"
# protocol: a red timing gate on this box gets a solo re-run before anyone believes it (audit 17/19)
```

## Definition of done
A `docs/perf/` entry (same artifact as M4-01's run family) with the contended numbers, the injected-breach observation, and either "G-M3-4 holds under contention" as a measured sentence or a filed issue for every breach it found. `docs/STATE.md` §5's G-M3-4 bullet updated from "M4 still owns" to the answer.

## Dependencies
- Blocked by: M4-01. Informed by: M4-08 (typed row reads make server-side assertions trustworthy).
