# M4-01 (#90) — load harness design, and what is verified before any code is written

Status: **design, pre-implementation.** This file exists so the mechanism and the arithmetic survive a
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

1. **Connection-pool evidence** (AC scenario 3: pool waits / max concurrent / errors). Where the app's
   Postgres client exposes pool state — or whether `pg` metrics are reachable in the server runtime at all —
   has not been read yet. If they are not, the honest output is "not observable from this layer" plus what
   *is* observable (concurrent-request count from the driver, Supabase's own pool view if reachable), not a
   proxy presented as the thing itself.
2. Whether ADR-0003's "scales with RTT" caution can be **confirmed or contradicted** from these numbers
   depends on (1). The card asks for a verdict; if (1) comes up empty the verdict is "undetermined", and the
   reason is written down.
3. How long "sustained" is (the card says "a stated duration" without naming one). Proposal: **60 s**, which
   is ~3 000 requests at 50 rps — enough for a p95 to mean something at n≈3 000 and short enough to run
   repeatedly. Recorded here as a choice, so a later reader knows it was made rather than discovered.

## Out of scope, from the card

Optimizing anything (#92 / M4-03), batch contention (#91), shared limiter state (#93 / M4-04). And the
harness stays **out of CI's merge gate** by the card's own scope — CI runner capacity cannot hold 50 rps
honestly.

## Next actions (implementation, not design)

1. Read the db client layer for pool observability (resolves unverified item 1).
2. Write the driver as `scripts/perf-sync-load.mjs` with an `npm run perf:sync` wiring (one command sequence,
   per the AC), reusing the auth mechanism above rather than inventing one.
3. Baseline run on an **unmodified** production build; record it here with its denominators.
4. Watched-fail control (scratch sleep), revert, re-measure.
5. `docs/STATE.md` §3/§7 updates only from numbers measured on merged `main`, and the honesty law applies to
   the wording: no "meets the budget" without the accepted-rps line beside it.
