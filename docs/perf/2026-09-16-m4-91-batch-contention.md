# M4-02 (#91) — the 60-mutation batch under contention: measured, and it breaks

Status: **measured 2026-09-16 on the local venue; control run recorded below.**
No budget, threshold, or spec constant moved anywhere in this work — the card's own
guardrail, restated because the answer is a breach and a breach is exactly when a
number gets "tuned". The 5 s budget lives at `tests/e2e/sla.spec.ts:32` and is untouched.

## The question

§5's G-M3-4 bullet ended with the sentence this card exists to pay:

> What M4 still owns: this is a solo-machine number — re-measure the drain under the
> 50 rps load test, where server-side batch application has competition.

The solo record (post-fix, `9ca17cc`): online→empty **1643 / 1701 / 1711 / 1783 /
1838 ms**, budget 5 000 ms, PASSES. M4-01 (#90) established the box cannot deliver
50 rps sustained (best ~43.6 rps, verdict `INCONCLUSIVE`), so the re-measurement runs
at an intensity this 4-core machine *does* deliver cleanly: **two** batch clients
draining overlapping 60-mutation batches + **eight** background single-mutation sync
clients at 1.25 rps each — roughly 11 rps plus two 60-mutation streams, which the #90
ladder shows is inside delivered capacity. Less than the RFC's 50 rps, and named as
such: the contention class appears well below the ceiling, so "we could not reach the
condition" is not the finding — the condition is simply *busy*.

## The instrument

- `scripts/perf-sync-contention.ts` — the focused variant of the #90 harness. Batch
  clients are the *subject*; background clients are the *load*. Percentiles are computed
  over the batch class only; the bystander distribution is printed for attribution and
  never judged against the batch budget (mixing distributions is how a benchmark becomes
  a lie — the #90 lesson, and #121's `p95 == max` failure-shape avoided by reporting n).
- Batch shape follows `tests/e2e/sync-latency.spec.ts:105-117`: 60 mutations, one per
  request-slot at 1 ms stagger, `setIndex` cycling the three legal slots of the seeded
  3-set plan. The stagger matters: a constant `clientTs` makes `compareEntityVersions`
  break ties on a random `mutationId`, and half the batch would reject `STALE_CONFLICT` —
  the distribution would then measure the rejection path, not the apply path. Every run
  below confirms **applied = offered, rejected = 0** (2 040/2 040 and 1 140/1 140 in the
  judged legs), so every percentile is a real full apply.
- Budget honesty: `--budget-ms` exists so the control run can *prove the instrument
  detects a breach*. It defaults to 5 000, the spec's figure, labelled "read-only copy"
  on every printed VERDICT line. The spec file is not read by the driver, let alone edited.
- Orchestration: `scripts/perf/batch-contention-run.sh` (measure) and
  `scripts/perf/batch-contention-control.sh` (watched-fail control), same conventions as
  #90's `scripts/perf/control-run.sh`: anchor-asserted injection, reverted by the script,
  `git status` printed at the end, server kill by bracket-pattern because `pkill -f 'next start'`
  once SIGTERMed its own session (#122).

## The measurements

Venue: this 4-core box, production build (`npm run build`), `next start` on :3001,
BUILD_ID `bvNR64rGCO_1U4bOs3gs5` — recorded once and compared at each leg start
(`BUILD_ID_AT_START`) so "measuring the right artifact" is a check, not a hope.
`.env.local` sourced; Playwright via `LD_LIBRARY_PATH=/tmp/pw-libs/extracted/usr/lib/x86_64-linux-gnu`.
All requests 200 (`statusBreakdown=[[200,…]]` on every leg) — the #125 401-epidemic class
did not appear at this intensity.

| # | Leg | n | batch p50 | batch p95 | max | vs 5 000 ms |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 1 | harness SOLO (1 batch client, no bg) | 12 | 1 737.4 ms | 1 945.0 ms | 1 945.0 ms | HOLDS |
| 2 | harness CONTENDED (2×batch60 + 8×bg) | 16 | 5 252.2 ms | **6 123.8 ms** | 6 123.8 ms | **MISSES** |
| 3 | harness leg overlapping the browser (2×batch60 + 8×bg, chromium co-tenant) | 19 | 6 693.8 ms | 12 203.2 ms | 12 203.2 ms | MISSES |
| 4 | **Playwright G-M3-4 drain UNDER contention** | 1 | online→empty **11 676 ms** | — | — | **MISSES by 6 676 ms** |
| 5 | Playwright G-M3-4 drain SOLO control (quiet server) | 1 | online→empty **1 757 ms** | — | — | PASSES |

Bystander cost, leg 2: single-mutation syncs ran **p50 896.2 / p95 1 074.6 ms** under
this load, against the sequential production band of ~203–413 ms recorded by #92 in
RFC §3 — the batches cost the bystanders roughly 2–4× too. The contention is not a
myth the batch clients invented for themselves.

Denominators and venue truth: leg 1 ran at load1min 2.73; leg 3's driver at load1min
14.56 on four cores (the browser is itself a co-tenant — that is item 33's venue, not a
mystery). `wallS` is printed with every leg; `BATCH-APPLIED offered/applied` with every
verdict; non-200 responses would be excluded from percentiles and named in the status
breakdown. Two harness legs report n=16 and n=19 batches — small samples, and the
`n=1` p95 caveat from #90 applies: at n=16 the p95 is the 15th order statistic. What is
knowable beyond the printed percentiles: p50 5 252 means at least half the contended
batches already exceeded the 5 000 ms budget on their own, so the breach is
distribution-shaped and not carried by a single outlier. One script bug was found and
fixed during this session, and it cuts against the numbers rather than for them: the
driver originally computed its deadline *before* minting the fixture users, so legs 1–3
ran ~4 s short of nominal (wall 40.6 vs 45). That only under-offers load — the fixed
clock (deadline after setup) is what the control legs below run.

## What answers the card's three conditions

1. **Server-side latency under load, batch apply + client drain:** leg 2 (server-side,
   via HTTP round trip) and leg 4 (client drain, in the real browser). Both breach.
2. **The instrument can observe a breach:** proven twice — once deliberately, by the
   injected control (below), once accidentally by reality: the un-instrumented box
   breached at ~11 rps.
3. **No budget changes:** `git diff main -- tests/e2e/sla.spec.ts lib/ src/` is empty on
   the branch; the only `5_000` on the branch is the driver's read-only copy, printed as
   such.

## Prose-vs-reality: the §5 "well under a second" phrase

The §5 bullet (the `9ca17cc` root-cause narrative) says "the batch applies in well under
a second". Measured here through the actual production path — auth validation included,
60 real `set.upsert` writes in one transaction — the solo server round trip is **p50
1 737 ms**, and the browser's solo drain (**1 757 ms**, leg 5, inside M3's recorded
1 643–1 838 band) sits ~20 ms above it. The drain *is* the server apply, to within the
request-loop overhead; there is no hidden second second in the client. The 2026-09-12
sentence was making a point about where the *missing* time had been (the backoff window,
not the apply) and it survives that purpose, but as an absolute claim about apply time it
is contradicted by this measurement, and is recorded here as contradicted rather than
re-litigated. The budget it argued for keeping — 5 s — also survives: solo clears it with
3 s of margin. Contention is what eats the margin.

## The watched-fail control (AC-2)

Two parts, and the first one produced a finding that reshaped the second:

**Contended control** (`scripts/perf/batch-contention-control.sh`, sleep 6 500 ms injected
inside the `applySync` transaction at `workout-repository.ts:564`, rebuilt, measured,
reverted, rebuilt, re-measured):

| Leg (contended, 2×batch60 + 8×bg) | batch p50 | batch p95 | browser drain |
| :-- | :-- | :-- | :-- |
| baseline, UNMODIFIED build | 8 218.7 ms (n=7) | 12 528.4 ms | — |
| injected 6 500 ms | 8 942.4 ms (n=6) | 10 581.3 ms — driver_exit=1 | 8 964 ms, `[G-M3-4] MISSES` (spec still under its 15 s hang ceiling → green) |
| restored (revert + rebuild) | 5 389.7 ms (n=10) | 6 295.0 ms | 10 549 ms, `[G-M3-4] MISSES`, driver p95 11 060.7 on its streamed leg |

The baseline leg MISSED on an unmodified build — an unplanned but welcome independent
re-confirmation of the headline finding (at small n, fresh-boot: the first batches also
carry pool/JIT warm-up, which inflates it relative to the 45 s leg; read it as "reality,
not the injection, is already breaching"). That is precisely why the injected sleep is
indistinguishable from reality inside the contended medians (8 942 vs 8 218), and why
"revert and re-measure green" cannot be satisfied in the contended config on this box:
the card wrote that scenario assuming contended-is-usually-green, and the measurement
says otherwise. AC-2's discrimination therefore runs in the SOLO configuration, where
unmodified is green (~1.7 s) and a 6.5 s apply cannot hide:

**Solo control** (`scripts/perf/batch-contention-solo-control.sh` — 1 batch client, no
background; driver verdict line + Playwright G-M3-4 drain at each point):

| Leg (solo) | batch p50 | batch p95 | browser drain | driver_exit |
| :-- | :-- | :-- | :-- | :-- |
| baseline, unmodified build | 1 649.7 ms (n=15) | 1 949.0 ms | `[G-M3-4] PASSES`, online→empty 1 837 ms | 0 |
| injected 6 500 ms | 8 206.4 ms (n=4) | 8 490.3 ms | `[G-M3-4] MISSES by 3 358 ms`, online→empty 8 358 ms | 1 |
| restored (revert + rebuild) | 1 543.6 ms (n=16) | 2 195.7 ms | `[G-M3-4] PASSES`, online→empty 1 679 ms | 0 |

This is the discrimination the contended legs could not provide: injected − baseline =
8 206 − 1 650 = **6 556 ms** against an injected sleep of 6 500 ms — the slowdown lives
beneath `lockSession` yet arrives in the client-observed latency almost exactly 1:1,
which is the proof that the instrument attributes to apply rather than to queueing in
front of it. Reverted, the same configuration is green again (p50 back under 1.7 s,
spec PASSES). AC-2 satisfied: deliberate slowdown → breach observed on both instruments
→ revert → green re-measured.

Injection hygiene, same as #90's control: anchor-asserted python edit (`assert s.count(anchor) == 1`),
reverted by the script (`git checkout --`), never committed; post-revert status printed
as `0 entries`; final `git status` on the control run showed only the session's own
staged-pending files. The control script's "must be green again" expectation line was
updated in-comment afterward to the truth above; measurement logic was not touched after
execution.

## Card deltas, named rather than smoothed

The card's Automated Verification block references `scripts/load-sync.ts --profile
batch60 --contention` and `npm run next:build` — both stale: the #90 harness landed as
`scripts/perf-sync-load.ts` (no profile flag; this card's variant is the separate
`scripts/perf-sync-contention.ts`, so M4-01's 200 ms @ 50 rps verdict semantics stay
intact), and #104 (M4-15, merged 2026-09-16) retired the `next:*` aliases — `npm run
build` is the real build. The protocol line was honored: every leg printed its own
denominator, and the solo Playwright control (leg 5) is exactly the "solo re-run before
anyone believes it" the audit demands — it shows the contended red belongs to contention
(11 676 ms under load vs 1 757 ms solo, both on the same build, same box, minutes apart).

## Verdict and follow-up

**G-M3-4's 5 s budget HOLDS solo and MISSES under contention** at an intensity this box
delivers without rejection (~11 rps + two batch streams): harness batch p95 6 123.8 ms,
browser drain 11 676 ms. The contention class is real and it is not exotic — two users
syncing at once while a handful of others tap is *normal usage*, and the card's
alternative world ("the budget was never realistic under load") is the one we measured.
Budget untouched. Per #91's DoD the breach opens a **new** follow-up issue —
**#164** (filed 2026-09-16, remediation scoped there, not here; #92 is closed and this is
not its re-opening).

## Reproduce

```bash
bash scripts/perf/batch-contention-run.sh          # ~9 min, needs the local stack + a build
bash scripts/perf/batch-contention-control.sh      # ~18 min, injects and reverts a scratch edit
npm run perf:contention -- --duration=45 --label=contended   # just the contended leg
```

Deliberately not in CI: shared runners are not the venue (#90's law — shapes transfer,
milliseconds are machine properties), and the shape transferred fine: the breach is
distribution-shaped, not machine-snowflake-shaped. A quieter-but-still-contended box
would shift the magnitudes, not the direction — the margin is 3 s solo and gone at 2
batch clients.
