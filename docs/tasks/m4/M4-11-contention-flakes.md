> **M4-11** · Test infrastructure · `#priority/p1` · Derived from: `docs/STATE.md` §7 item 22 ("Playwright contention flakes … 'contention' is the best available explanation, **not a proven one** … M4's load test is what decides whether any of these tails is real"); audit entries 17 & 19 (the four recorded incidents); `#80` (fixture id collision — a *known* co-cause, assigned to this milestone, not re-filed).

## Intent
As the person who must trust a red gate on this machine, I want the four recorded timing-gate flakes either **root-caused and eliminated** or structurally fenced — because "a flake's real cost is that people stop trusting red" (audit 17, verbatim).

## What the record says
- Four incidents, all green solo, none reproduced deliberately: `a11y.spec.ts:102` (keyboard-only, 30 s test timeout vs 15.1 s baseline), `sla.spec.ts:69` (G-M3-2 p95 64.8 ms once under a 4-worker loop), `timers.spec.ts:277` (CDP-freeze spec, "Warming up" at 5 s), `sla.spec.ts:282` (G-M3-3 ran out its 30 s *test* budget while printing a **passing** measurement — the wall clock, not the SLA, failed).
- The protocol in force (STATE §3/§7): solo re-run before believing a red timing gate; no budget moves without a re-run proving reality changed. That protocol must survive this card — the fix may not be "raise the budgets".
- `#80`'s hardcoded fixture ids are a proven collision source for one class (404s mid-measurement); it is the sibling, not the whole cause — CPU contention stands independent.

## Scope
- Land #80's per-run fixture ids first (see that issue's options; its author recommends option 1).
- Then: instrument the four specs' runs (Playwright reports/trace on failure), separate "test timeout" pressure from "measurement breach" pressure, and apply the *structural* fixes available: per-spec timeouts where the flow legitimately needs >30 s (G-M3-3's n=5 × 4 s poll math can *prove* 30 s is tight — raising a **test** timeout that a measurement's own arithmetic justifies is not moving a **budget**), pinning measurement specs to their own worker/profile so they stop competing, or (worst option, last resort) splitting the battery so measurement specs run serially.
- Exit either with each flake root-caused + a control that now catches the cause, or with a named, documented structural fence + a re-run record (e.g. N consecutive full-suite greens on this box) — and the residue labelled honestly if "contention" still isn't proven.

## Out of scope
The 50 rps server-side question (M4-01); any SLA/budget constant change; CI-side worker caps as a *silent* fix (CI is green; this is about the dev box that gates the truth).

## Acceptance criteria
```gherkin
Scenario: Red means red
  Given the fix and #80 landed
  When the full battery runs 5 consecutive times on this machine
  Then it is 100% green with zero solo re-runs needed
  And each formerly flaky spec's new structural protection is individually observed: with the protection reverted, its failure mode is provoked (or the record states why it cannot be)

Scenario: The budgets are untouched
  When the PR lands
  Then the diff contains no change to any SLA number (50 ms / 5 s / 4 s / 800 ms / 5 s-G-M3-4); test-timeout changes carry a per-spec arithmetic comment

Scenario: The honest residue
  Given a flake that resists root-cause
  When the card closes
  Then docs/tests records what was tried, what is fenced, and what remains unexplained — STATE §7's "not a proven one" sentence updated to the new epistemic status, not deleted
```

## Automated Verification
```bash
fuser -k 3001/tcp 2>/dev/null; npm run next:build
for i in 1 2 3 4 5; do npx playwright test --reporter=line; done   # five consecutive full runs
# per-spec solo controls as provoked; protocol (solo-before-believing) stays documented for non-flake reds
```

## Definition of done
STATE §7 item 22's flake bullet reads as history (fixed/fenced with evidence) or as a live, owned, *proven-bounded* caveat — never as a shrug.

## Dependencies
- Blocked by: `#80` (assigned to M4; do not re-file). Feeds confidence into M4-01/02's re-measurement discipline and every later card quoting "61/0".
