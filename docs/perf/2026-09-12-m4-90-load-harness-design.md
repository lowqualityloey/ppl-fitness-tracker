# M4-01 (#90) — load harness design, and what is verified before any code is written

Status: **design + pre-flight code reading; no measurements yet.** This file exists so the mechanism and the arithmetic survive a
context break; nothing in it is a measurement result. Every claim below is either a `file:line` in this repo
or explicitly named as unverified.

## The number the harness exists to produce

`docs/STATE.md` §3's documented budget is **200 ms p95 for `POST /api/sync` at 50 rps**. The only gate that
touches that figure today **refuses to assert it**, and says why
(`tests/integration/api/route-hardening.test.ts:155-162`, constants at `:161-162`): the API suite boots `next dev`, which compiles
routes on demand and ships no minification, so "asserting 200 ms here measures the wrong artifact." It
asserts a `devHarnessCeilingMs = 800` regression ceiling instead and reports the dev-mode measurement into
STATE "so the production number stays a named open item rather than an implied one." That open item is #90's
product, and it is why #92 cannot be done honestly first.

Note also that the existing 50-sample sequential gate is **not** degenerate the way #121's paint gate is:
p95 over 50 sorted samples is index 46, a real percentile. #121's `n=17` had `p95 == max`. The new harness
must not import that failure shape — see "Report shape".

## What is already in this repo (verified, with sources)

| Need | Existing mechanism | Source |
| :-- | :-- | :-- |
| Production build + server | Playwright's own `webServer`: `npm run next:build && npm run next:start`, `url: http://localhost:3001`, `reuseExistingServer: !process.env.CI` | `playwright.config.ts:22-24` |
| Create N throwaway users | GoTrue admin API with the service-role key | `tests/integration/api/fixtures.ts:126-131` |
| Turn a user into an app session | `POST ${SUPABASE_URL}/auth/v1/admin/generate_link` with `{ type: 'magiclink', email }` → `/auth/confirm` → SSR session cookie | `tests/integration/auth-confirm.test.ts:47-53` |
| Hold and replay cookies against the app | `CookieJar` / `createClientFromCookieJar` | `lib/supabase/cookie-jar.ts`, imported at `tests/integration/api/fixtures.ts:3` |
| Deleting the users afterwards | admin delete per user, with GoTrue's response surfaced | `fixtures.ts:155-158`, `tests/integration/api/gotrue-failure.ts` |

**Consequence for the plan:** no new auth mechanism is required. If implementing the driver turns out to need
one, that is a finding to record, not a thing to improvise.

## The arithmetic the card's negative scenario depends on

The per-user sync budget is **120 requests/minute** (M2-06, cited in the card as "*real*"): **2 rps accepted
per user**. A 50 rps run therefore needs **at least 25 distinct users**, and 25 is the boundary where
rejection is guaranteed rather than possible — so the driver starts at **30 users** and records what the 429
count does as the user count moves (that sweep *is* the card's "fewer users than the run demands" scenario,
run deliberately rather than stumbled into). The app's rate limiter is **process-local** (M4-04), which on a
single `next start` process matches the per-user budget above; with more than one server process it would not,
and the harness must state how many server processes it measured.

## Report shape, and the one way it can lie

The AC says 429s must be **separated** from the latency percentiles "instead of letting fast rejections
flatter" them. A rejected request is cheap — it returns before doing ledger + upsert + PR work — so a run that
mixes them reports a *better* p95 while delivering *less* throughput. Therefore:

- Percentiles are computed over **accepted (2xx) requests only**, and `n_accepted` is printed next to them.
- 4xx (esp. 429) counted separately, **with the achieved accepted rps** printed against the 50 rps target. A
  run that "passed" at 12 accepted rps must be visibly that run.
- Offered load is closed-loop with pacing (per user at ~2 rps) *and* the achieved rate is measured rather than
  assumed; if offered ≠ achieved, say so in the PASS/MISS line.
- **Load denominator travels with the verdict** — `nproc` and `/proc/loadavg` before and after, per the rule
  established in `docs/rca/m4-100-contention-ledger.md`: a missing denominator makes a timing number an
  anecdote, and a recorded high load explains a red without disqualifying a green.
- PASS/MISS is against the **documented 200 ms**, and if it misses, nothing in the repo is edited to fit it.

## Control, watched rather than assumed (STATE §4 item 16)

Deliberate slowdown in a **scratch** build (an injected sleep in the `/api/sync` handler path); the harness
must report a MISS reflecting it; then revert, rebuild, re-measure, and record all three numbers here. A
harness nobody has watched fail is an anecdote generator — this is the same class of mistake #100 caught with
`trace: "on-first-retry"`, which had been unreachable since it was written.

## Unverified, and named as such before it becomes a claim

1. **Connection-pool evidence — RESOLVED by reading the code, and the resolution has a consequence.**
   `lib/db/client.ts:1,26` builds a real `pg.Pool`, and `DbHandle` **exposes the pool object itself**
   (`:8`), so `totalCount` / `idleCount` / `waitingCount` and the pool's `error` event are reachable
   *in the server process*. But the load driver is an external HTTP client: it cannot see that process's
   memory. Which leaves two routes, and only one of them belongs to this card:
   - **(chosen) Observe from the database side**, from the driver, using the app's own `DATABASE_URL`:
     poll `pg_stat_activity` (backends by state — `active` / `idle` / `idle in transaction`) and
     `pg_stat_database` (`numbackends`, and wait-event columns where the local build exposes them) at
     intervals across the run. This is the DB's own account of concurrency, needs no change to shipped
     code, and is reported as what it is: server-side connection state, not the app's pool queue depth.
   - **(rejected for this card) Sample `pool.waitingCount` inside the server** — that means exposing
     in-process state over some new surface (endpoint, log scrape, or a test-only import path). #90 is
     scoped to produce a measurement, not to add production observability, and inventing an endpoint here
     would pre-empt the `#94` structured-logging card. Recorded as a follow-up rather than smuggled in.

   So the AC's "pool waits / max concurrent / errors" is met as *max concurrent and errors from the DB's
   view*; if `pg_stat_activity` cannot answer a sub-question, the artifact says so instead of dressing up
   `n_accepted` as the answer.
2. Whether ADR-0003's "scales with RTT" caution can be **confirmed or contradicted** from these numbers
   depends on (1) — now narrowed: the DB-side view can speak to concurrency, and ADR-0003's "+1.29 ms p50
   direct / +1.98 ms pooled" comparison is about RTT-per-acquire, so the load run's `pg_stat_activity`
   backends-by-state plus the driver's own percentile set is the evidence for a verdict either way.
3. How long "sustained" is (the card says "a stated duration" without naming one). Proposal: **60 s**, which
   is ~3 000 requests at 50 rps — enough for a p95 to mean something at n≈3 000 and short enough to run
   repeatedly. Recorded here as a choice, so a later reader knows it was made rather than discovered.

## Out of scope, from the card

Optimizing anything (#92 / M4-03), batch contention (#91), shared limiter state (#93 / M4-04). And the
harness stays **out of CI's merge gate** by the card's own scope — CI runner capacity cannot hold 50 rps
honestly.

## Next actions (implementation, not design)

1. ~~Read the db client layer for pool observability~~ — done, see unverified item 1: `DbHandle.pool`
   exists but is in-process, so the driver polls `pg_stat_activity` / `pg_stat_database` instead.
2. Write the driver as `scripts/perf-sync-load.mjs` with an `npm run perf:sync` wiring (one command sequence,
   per the AC), reusing the auth mechanism above rather than inventing one.
3. Baseline run on an **unmodified** production build; record it here with its denominators.
4. Watched-fail control (scratch sleep), revert, re-measure.
5. `docs/STATE.md` §3/§7 updates only from numbers measured on merged `main`, and the honesty law applies to
   the wording: no "meets the budget" without the accepted-rps line beside it.

---

# Run log

## `smoke-intended` run — 2026-09-12, production build on :3001, local stack up

**It was not a smoke run.** `--users=3 --rps=6 --duration=5` were passed and **ignored**: `parseArgs` only
matches the space-separated form (`--users 3`), and npm hands over `--users=3`, so every setting fell back to
its default. The harness therefore ran the **full 30 users / 50 rps / 60 s** configuration unannounced, for
63.9 s, at load up to 15.19 on a 4-core box. Recorded first because a run whose parameters are silently not
the parameters you typed is the exact failure mode this card exists to catch, and because it means the
numbers below are a *maximal* run, not a pilot.

Server identity was checked, not assumed: `perf-start.log` prints **Next.js 16.3.4 / Ready** on :3001, so the
run measured this repo's build. (There is also an unrelated `next-server v15.0.0` process on this machine,
which did not own the port; flagged for housekeeping, not mine to kill.)

```
OFFERED      564 requests over 63.9 s = 8.8 rps (target 50.0)
ACCEPTED     n=548 → 8.6 rps achieved | p50=3182.4 p95=5278.4 max=8553.6 ms  (2xx only)
REJECTED     n=16 429=0 5xx=0 other=16 fetch_error=0
DB-SIDE      max_active_backends=14 max_total_backends=62 max_idle_in_transaction=10 observer_errors=0
STATUS       200:548 401:16
DENOMINATOR  nproc=4 load_before=1.42 1.21 1.21   load_after=15.19 5.19 2.59
VERDICT      MISS — p95 5278.4 ms vs the documented 200 ms at 50 rps
```

### Four findings, in the order that matters

**B — the closed loop can hide the very thing it is measuring, and this run proves it.** The driver issues
one request per user and waits, so per-user rate is capped at `1 / latency`: 30 users at ~3.2 s ≈ 9.4 rps —
and 8.8 rps is what was offered against a 50 rps target. **A sequential per-user pacer under-offers exactly
when the system is slow**, which is a load test that goes quiet on the interesting part. This must become an
open-loop scheduler (a global pacer firing at the target rate, many requests in flight, reporting max
in-flight), with the offered-vs-achieved line kept honest by printing both. Fixing the arg parser is the
smaller half of the same bug: I could not even run a small configuration.

**C — the strongest lead, and it is not in the route's code.** `max_idle_in_transaction=10` while 30 users
queue, and `lib/db/client.ts:26` builds `new Pool({ connectionString })` with **no `max`**, so it defaults to
pg's **10 connections**. Ten backends parked in `idle in transaction` with everything else waiting behind them
is ADR-0003's caution stated as an observation rather than a worry. It is also the first *mechanism* this
project has had for "why is `/api/sync` slow at concurrency" — the sequential numbers never showed it because
one request at a time never needs an eleventh connection. Explicitly **not** acted on here: changing the pool
is #92's territory, and this box's own load (15.19 on 4 cores, from the harness itself) means the absolute
milliseconds are local-stack-shaped. What transfers is the shape, not the number.

**D — 16 requests answered 401**, unexplained. Each of the 30 users has its own `CookieJar` and its own
session cookie, so the usual suspects (shared jar, overwritten session) do not apply. 2.8 % of requests
unauthenticated, arriving without any 429 or 5xx around them, is a real question about either cookie lifetime
under load or `requireUserContext`'s failure path. Left open, named, and *not* smoothed over: those 16 are
excluded from the percentiles, which is right for latency and wrong to forget.

**A — the arg-parser bug above**, plus the note that the harness's own verdict line worked correctly on a
tree it was never tuned against: it printed MISS without anything being edited to fit.

### What this run does **not** establish

It is not the baseline, because the configuration was not the one intended, the driver under-offered by 5.7×,
and the box was oversubscribed by the harness itself. The 200 ms question stays open. Sequence from here:
fix the parser, make the scheduler open-loop, then a short real pilot (small `--users`, small `--rps`), then
the baseline, then the watched-fail control. Until the control goes red on purpose, no number in this file is
evidence about the budget.
