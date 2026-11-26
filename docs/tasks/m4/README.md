# M4 — Hardening, Telemetry & Decommission: task breakdown

Filed 2026-09-12 via `pk:tasks` against **milestone #4: M4: Hardening, Telemetry & Decommission**
(`gh api repos/lowqualityloey/ppl-fitness-tracker/milestones/4`).

**Source of requirements:** `docs/releases/2026-09-12-m3-exit-report-and-m4-handoff.md` (§3.1–§3.6,
including the §3.4 erratum), `docs/STATE.md` §1/§2/§3/§5/§7 (item 22 is the start line)/§8,
`PROMPTKIT.md` §2/§3, `docs/tests/2026-09-11-m3-verification-audit.md` (entries 11, 14, 15–19),
the master RFC's SLA table, M4 line and FMEA register, and `docs/tasks/2026-09-11-intake-debt-index.md`
(D2/D4/D6/D7 — named as M4's in STATE §5).

> **Process note:** `docs/STATE.md` §7 item 22 prescribes `pk:plan` (an M4 spec) *before* `pk:tasks`.
> The owner asked for the decomposition directly from the handoff, so cards whose resolution belongs
> in a spec — M4-04, M4-07, M4-16, M4-18, M4-20, M4-23, and the data-stranding call in M4-14 — are
> filed as explicit **decision cards** with both forks written and testable. M4's `pk:plan` should
> settle them before implementation starts. Sizing follows the M3 precedent (one-PR-sized slices, a
> deliberate deviation from the workflow's 1–4h rule).

## The board (26 new cards + 6 parked issues raised onto M4, per handoff §3.5 — the 25th and 26th
arrived later: #142 ruled in by M4's own spec §3.4 on 2026-09-14, #149 by an owner ruling during #142's
implementation on 2026-09-15)

| Slice | Issue | Card | Priority |
| :--- | :--- | :--- | :--- |
| M4-00 | #89 | Migration authorship model (D4) + auth-FK-cascade evaluation | p0 |
| M4-01 | #90 | 50 rps sustained load harness vs the `/api/sync` SLA | p0 |
| M4-02 | #91 | 60-mutation batch apply under contention | p1 |
| M4-03 | #92 | Close or re-document the 200 ms p95 gap | p1 |
| M4-04 | #93 | Rate limiter: shared state or written acceptance | p2 |
| M4-05 | #94 | Structured logs + correlation ids | p1 |
| M4-06 | #95 | Sentry, client + server, observed-to-fire | p1 |
| M4-07 | #96 | Outbox depth **and age** — surface or accept | p2 |
| M4-08 | #97 | Typed row reads in security suites (D7) | p1 |
| M4-09 | #98 | Hermetic unit layer (D2) | p2 |
| M4-10 | #99 | `tsconfig.json` churn (D6) | p3 |
| M4-11 | #100 | Contention flakes: root-cause or fence | p1 |
| M4-12 | #101 | ZWSP accessible-name structural gate | p2 |
| M4-13 | #102 | Contrast rows generated from `@theme inline` | p3 |
| M4-14 | #103 | Legacy modules + keys + READMEs deleted, parity scan **flipped** | p1 |
| M4-15 | #104 | Retire the zero-JS legacy build scripts | p2 |
| M4-16 | #105 | `SyncResponseData.state` consumer-or-drop + honest e2e mock | p2 |
| M4-17 | #106 | Stretch countdowns or remove misleading static seconds | p2 |
| M4-18 | #107 | Timer persistence — revisit on telemetry evidence | p3 |
| M4-19 | #108 | Volume/streak analytics from sessions only | p2 |
| M4-20 | #109 | Body measurements / `userStats` — plan, not apology | p2 |
| M4-21 | #110 | Versioned JSON export (the "never hostage" mitigation) | p2 |
| M4-22 | #111 | Service-worker shell: true offline reload (G-M3-1's gap) | p1 |
| M4-23 | #112 | Realtime-vs-poll-margin decision + ADR | p2 |
| M4-24 | #142 | CSP baseline on every document response — server-sent, nonce'd, Sentry-aware `connect-src` | p1 |
| M4-25 | **#149** | Lighthouse gate runnable on a WSL dev box — Node API, not chrome-launcher | p2 |
| M4-36 | **#77** | Rejection messages — the domain's own sentence on the wire | p2 |
| M4-37 | **#76** | The archived session's screen — no length, no mislabel, nothing to record | p2 |
| parked | **#78** | same-ms writes decided by random UUID | p2 |
| parked | **#80** | one hardcoded fixture id set (M4-11's precondition) | p2 |
| parked | **#82** | `?from=`/`?to=` contract decision | p3 |
| parked | **#84** | thousands-grouped weight parse ceiling | p3 |
| stays on M1 | **#16** | production SMTP — deliberately *not* re-milestoned (M1's deferred exit item; blocks deploy, tracked in the milestone description) |

**No duplicates filed:** the six parked issues were re-milestoned and cross-referenced, not re-derived
(handoff §3.5: "raise them, don't re-derive them"). M4-16 explicitly excludes #77's seam; M4-11 names
#80 as its blocker rather than absorbing it. **#77 left the parked list on 2026-11-24** — it became
M4-36. **#76 left it on 2026-11-26** — it became M4-37, and its filed premise ("no API path produces
`archived`") was measured false: `POST /api/import/legacy` has written `status: 'archived'` since
`3ecaf2f`, so the card became the screen-and-coverage work it was really about; it shipped in `773e59c`
and was **signed off and closed on 2026-11-26**, moving the board to `open=5 / closed=37` of 42. Four
parked issues remain.

## Dependency map (arrows = must-land-first)

```
#89 (D4 model) ─────────────► #109 (body measurements) ──┐
#89 ──► (any cascade migration inside #89 itself)        │
#90 (load harness) ──► #91 (batch contention) ──► #92 (p95 decision) ──► #112 (realtime, informed)
#90 ────────────────────────────────────────────► #92
#94 (logging) ──► #95 (Sentry) ──► #107 (timer-persistence evidence)
#142 (CSP baseline) ──► #95 (Sentry)   spec §9.3(1): merge BEFORE OR WITH #95 — its connect-src opens
                                      the Sentry ingest door before Sentry exists, so the retrofit that
                                      reintroduces 'unsafe-inline' under deadline cannot happen
#94 ──► (diagnosability input to) #90's deep dives; land alongside
#97 (typed rows) ──► (before assertions pile on) #91/#92
#98 (hermetic unit), #99 (tsconfig) — independent hygiene; cheap, do early
#80 (parked, fixture ids) ──► #100 (contention flakes) ──► #106 (stretch timers, if it adds timer specs)
#100 ──► #105 (sync-state field changes e2e sync specs; wants a non-flaky base)
#103 (legacy delete) ──► #104 (build scripts)   and   #109 decides *before* #103 strands userStats
#103, #104 ──► #111 (shell caches "the build"; settle what 'build' means first)
#93 (limiter) ↔ #90 (harness must not measure throttling as speed) ↔ #112 (poll budget arithmetic)
#101, #102, #108, #110 — independent; anywhere after gates are trustworthy (#100)
```

## Recommended implementation order (with risk per dependency)

**Wave 0 — foundations (parallel):**
1. **#89** (D4) *first schema-adjacent gate.* Risk if skipped: `db:generate` emits a migration from a
   stale snapshot and clobbers hand-authored `0004`–`0006` — silent, catastrophic, and three M4 cards
   (body measurements, cascade, maybe export) invite it.
2. **#97** (D7 typed rows). Risk: every M4 hardening assertion written on inferred `any` can pass
   vacuously inside the files that *are* the security gate.
3. **#98 + #99** (D2/D6 hygiene). Risk: low; the cost is that count-quotes and staging stay dirty.
4. **#80** (parked: per-run fixture ids). Risk: unpriced on everything measurement-shaped below it.

**Wave 1 — the observability spine + the number that gates everything:**
5. **#94 → #142 → #95** (logging → CSP baseline → Sentry), the order the M4 spec's §6 sets: #142 merges
   before or with #95, because a browser Sentry needs `connect-src` already open. Risk of doing these
   *after* the load work: #90's failure modes get diagnosed by timestamp-archaeology, and #107's evidence
   window never opens. Risk of doing #95 before #142: a policy retrofitted under a deadline is how
   `'unsafe-inline'` sneakily returns (§9.3(1)).
6. **#90** (50 rps harness). Risk: this is the milestone's epistemic center — everything #91/#92/#112
   say must come from a run, and the harness itself needs the #94 ids to be diagnosable.
7. **#100** (contention flakes, after #80). Risk: if the load verdict work (#91/#92) lands on a box
   whose reds can't be believed, measurements get retried-until-green — the exact anti-pattern STATE
   item 21 locks against.
8. **#101** (ZWSP gate). Independent; slot early — cheap, closes audit entry 11's named hole.

**Wave 2 — performance verdicts (all read from #90's artifact):**
9. **#91** → 10. **#92** → 11. **#112**. Risk chain: each card's AC is *evidence-dependent*; doing
   #92 before #90 means re-litigating sequential-run numbers against a concurrency condition they were
   never measured under (the 200 ms promise is "@ 50 rps"; #92's whole job is ending that mismatch).
   #112 before the data arrives risks paying the Realtime RLS-widening price for a margin nobody has
   watched erode.
12. **#93** (limiter). After #90, because the harness discovers whether single-user 50 rps is even
    reachable under the 120/min budget; the decision (shared store vs acceptance) needs that answer.

**Wave 3 — product truth (mostly independent, owner decisions):**
13. **#105** (state field + mock) — after #100 for a stable e2e base. Risk: touching it before #77
    lands re-derives rejection plumbing; coordinate, don't duplicate. **#77 landed first** (M4-36,
    2026-11-24), so #105's option A renders `message` where it renders a rejection.
14. **#96** (outbox age), **#106** (stretch timers), **#107** (timer persistence, after #95),
    **#102** (contrast rows). Risk: #106 adds timer specs — land it *after* #100 or it grows the flake
    surface it depends on.
15. **#108** (analytics), **#110** (export), **#109** (body measurements — hard-blocked by #89, must
    *precede or co-schedule* #103 or `userStats` strands undocumented). Risk: #109 after #103 makes
    the retirement story a lie; #108 without #103 tempts porting legacy fiction.

**Wave 4 — decommission last (it's safe, not urgent, and touches every doc):**
16. **#103 → #104 → #111.** Risk rationale: deleting the legacy app is trivially recoverable from git,
    but the parity-scan flip + prose rewrite + port reassignment is churn if done while #90–#92 are
    still measuring "the current prod shape"; and #111's precache must target the *final* script
    layout (#104) and the final auth-surface state. The stranding decision (#109's outcome) is the one
    hard predecessor on #103.

## Definition-of-done law (applies to every card)

A control does not exist until a test proves it runs (STATE §4 items 11/16): every new gate in M4 —
load-harness MISS path, flipped parity scan, ZWSP check, redaction, age display, typed-row compile
failure — must be **watched to fail** with the capture in its PR, and every budget number (200 ms,
5 s, 4 s, 800 ms) moves only per the STATE item 21 protocol (re-run proving reality changed, not wish).

## Reproduce the board

All 24 original issues were created 2026-09-12 with:

```bash
# per card: <body-file> | <title> | <labels> — e.g.
gh issue create --title "test(perf): stand up the 50 rps sustained load harness against POST /api/sync and record the SLA verdict" \
  --body-file docs/tasks/m4/M4-01-load-harness.md \
  --label "area:perf,type:test,priority/p0" \
  --milestone "M4: Hardening, Telemetry & Decommission"
# (exact title/label table = the TSV used at /tmp/m4-cards.tsv during filing; issues #89–#112)
# parked-issue assignment:
for n in 76 77 78 80 82 84; do gh api -X PATCH repos/lowqualityloey/ppl-fitness-tracker/issues/$n -f milestone=4; done
```

**#142 (M4-24) was filed 2026-09-14 the same way** — same milestone, `--body-file
docs/tasks/m4/M4-24-csp-baseline.md --label "area:backend,priority/p1,type:feature"`. It came from the
spec's §3.4 gap ruling (Owner: FILE), not from the handoff, and it is the board's only card with a hard
ordering edge into #95.

**#149 (M4-25) was filed 2026-09-15 the same way** — `--body-file
docs/tasks/m4/M4-25-lighthouse-local-bootstrap.md --label "area:infra,priority/p2,type:test"`. It came
from an owner ruling during #142's implementation (*file a card, keep that PR clean*), it blocks
nothing, and it is the board's only card about **where** a gate can be run rather than what it proves.
**New issues start at #150.**

**#164 was filed 2026-09-16 from #91's measured verdict** — the breach itself, deliberately *outside*
milestone #4, because promoting a breach to cards is `pk:tasks`' decision and #91's checkpoint refused
to make it. **It was decomposed the same day into M4-26/M4-27**: spike-then-fix, where M4-27 may not
start until the owner ratifies M4-26's workstream pick in a one-line comment on #164, and M4-27's
verification is the instruments #91 already merged. These two cards landed as a direct docs-only
commit on `main` — a recorded deviation from the #150 PR precedent (no runtime code in the tree; the
CI runner is not the arbiter of markdown). **New issues start at #168.**

**Same day, the sizing law fired before implementation even started**: #166's spike priced the
wall (pool/lock/commit excluded; the seconds are ~900–1 000 sequential round-trips inflating ×4.2),
so `pk:tasks` re-decomposed #167 by the spike's own seams — **M4-27 (#167) rewritten as slice A**
(per-mutation remap + progression dedupe, ~38 % of the wall, no budget claim) and **M4-28 (#168)
filed as slice B** (reserve/version/tail request-batching; its AC is the verdict: contended p95
< 5 000, and it carries `Closes #164`). #168 must not start before #167 merges. **New issues start
at #169.**

> Re-typed above from the milestone API (2026-09-15): the title is `M4: Hardening, Telemetry &
> Decommission` — a **comma**, not the colon this file's `--milestone` string carried, which would make
> a copy-paste of that block fail on a title that no longer exists anywhere.

> The card files in this directory are **untracked working-tree artifacts** until the M4 kickoff
> commit lands them (they were written before this decomposition merged, per the repo's M1 lesson that
> docs must be on `main` before issues cite them — issue bodies here therefore cite only already-merged
> documents; nothing 404s).
