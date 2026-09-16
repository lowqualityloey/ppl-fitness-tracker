# Architectural Decision Record (ADR): Cross-Device Propagation Stays Poll-Driven; Realtime Is Declined for Margin, Not Ignored

- **Status**: Accepted — decided by the repository owner on 2026-09-16 during M4-23 (#112); pre-ratified in the M4 spec ("#112 is *ratified*: keep the 4 s poll, write ADR-0007")
- **Deciders**: Repository owner, Agent (opencode)
- **Date**: 2026-09-16
- **Technical Story**: `docs/tasks/m4/M4-23-realtime-decision.md` (#112); M3 exit report §3.1 bullet 2 (`docs/releases/2026-09-12-m3-exit-report-and-m4-handoff.md`); M3 spec §8.3 (`docs/specs/2026-09-11-spec-m3-presentation.md`); M4 spec lines on #112 (`docs/specs/2026-09-14-spec-m4-hardening-telemetry-decommission.md`)

---

## Context and Problem Statement

The product promise "a change on device A reaches device B in under 5 s" is asserted by
`tests/e2e/sla.spec.ts` **G-M3-3** against a 5 000 ms p95 budget. The measurement passed M3 and
has passed every full e2e battery since — but it passes *because* `POLL_INTERVAL_VISIBLE_MS` is
4 000 ms: **the budget's margin is the poll period itself, not engine speed.** Measured history:
p95 **4 388–4 451 ms** across the M3 audit's final table; n=5 median 4 353 / p95 4 503 ms recorded
at M3 exit (handoff §1); **4.42 s** re-measured after #92 (STATE §5). Every CI run since then has
held the margin (e.g. the post-#161 and #162 batteries, both 81/81 including `sla.spec.ts`).

A pass whose headroom is a single constant is "one bad deploy away from failing" (the card's
Intent). The honest fork is: buy real headroom with Supabase Realtime — at a privilege price — or
keep the floor and *say so in the architecture, not just the test comments*.

## The RLS Widening Considered

Enabling Realtime is not a transport swap; it is the first browser-readable application-table
policy surface in this repository.

- **What would be opened**: the original fan-out design (fullstack spec) subscribes the browser to
  `session_sets` rows filtered by `session_id`. Supabase Realtime authorization runs as the
  `authenticated` role, so `session_sets` would need a SELECT policy for it — and any table with a
  policy is a table the browser can now query directly, not just watch.
- **What stands today, by evidence**: 66 RLS policies target `app_authenticated`, one targets
  `public`, **zero** target `authenticated`; no table is in `supabase_realtime`; `npm run db:up`
  starts the local stack with `-x realtime` (it is not even running); zero `.channel(` references
  in application code. The server reads and writes through API routes as `app_authenticated`
  (ADR-0003's defense-in-depth model); the browser never talks to PostgREST.
- **What the card's AC-2 would demand of any future implementation**: a mutation-tested tenancy
  suite for the new policy path — cross-user subscribe rejected, watched red when the policy is
  loosened as a control — *"no browser channel may see what no SELECT policy allows."* That AC is
  hereby recorded as a standing constraint that survives this decline.
- **What the decision would amend**: the fullstack spec's §3.4 rule that the browser's role holds
  no SELECT policy on application tables — a deliberate privilege posture, not an oversight.

## The §8.3 Arithmetic Considered

Cadence is pinned by limiter budget, not taste: `POST /api/sync` is rate-limited to **120 req/min
per user**, shared with the user's real writes, and the M3 grill's rule (§8.3) keeps polls plus
writes under **~40 %** of that budget, with slow-poll when hidden and poll-after-own-write. A
shorter visible poll (2 s ≈ 30 req/min) breaches the rule; therefore "just poll faster" is not an
available option, and §8.3's rationale now cites this ADR.

## Decision Options

1. **Realtime now** — declines. The widening above buys latency headroom nobody is currently
   failing without: G-M3-3 has gone red exactly zero times in CI since the venue exists. It pays
   the privilege price for a margin the poll already provides.
2. **Shorten the poll** — excluded, §8.3 arithmetic (above).
3. **Accept the 4 s floor and monitor the margin** — **chosen.** The floor becomes named
   architecture: the promise is *poll-period-plus-latency by design*, the budget is honest about
   that, and the existing instrument watches it — `sla.spec.ts`'s G-M3-3 prints the propagation
   distribution on every full e2e battery, which runs on every PR. No new telemetry is invented:
   #95's sink covers error arrival, not latency, and inventing a dashboard nobody reads would be
   the unfalsifiable kind of "monitoring".

## Consequences

- **Prose matches math, with teeth.** `STATE.md` §5's prose-vs-reality list loses its G-M3-3 entry
  (its Definition-of-done half): the 4 s margin is no longer a gap between claim and mechanism,
  because the mechanism is now the ratified claim. `tests/e2e/sla.spec.ts` carries a pointer, not
  a loosened budget: **`G_M3_3_BUDGET_MS` is untouched by this decision.**
- **Revisit triggers** — any of these reopens the question, with this ADR as the input:
  1. G-M3-3 goes **red in CI**, or prints p95 ≥ **4 800 ms** on two consecutive merges to `main`
     (headroom under 4 % twice is the floor being eaten by latency, not noise);
  2. any change to `POLL_INTERVAL_VISIBLE_MS`, hidden-page cadence, or the 120 req/min limiter
     budget — the §8.3 arithmetic is a contract; re-derive it before moving either side;
  3. any product need for *sub-poll* propagation (presence, live co-training, push) — that is a
     feature argument for Realtime, which the margin argument was not; AC-2's tenancy-gate
     discipline then applies as written;
  4. payload growth beyond the 8–15 KB full-session band §8.3 measured — polling cost is
     cadence × size.
- **Structurally absent stays structurally true**: `db:up` keeps `-x realtime`, zero
  `authenticated` policies remain, and `PROMPTKIT.md` §2's "Realtime is not in use" gains the
  words *by decision* with a link here. A future implementation PR must reverse each of those
  three facts visibly, never silently.

## What This ADR Supersedes

Nothing. It *answers* the owner deferral recorded in M3 spec §8.3 and handoff §3.1 ("M4 owns
whether to revisit") — the revisit this file is — and it discharges the M4 spec's pending marker
("Keep 4 s poll; decide by ADR-0007 → ADR pending").
