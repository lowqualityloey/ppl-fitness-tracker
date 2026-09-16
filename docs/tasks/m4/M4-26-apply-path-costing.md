# M4-26 · Price the apply path — which leg of the contended 60-mutation drain actually costs the 5 seconds

> **M4-26** · Backend perf spike · `#priority/p1` · Derived from: **#164**, filed from the measured
> verdict of **M4-02 (#91)** — `docs/perf/2026-09-16-m4-91-batch-contention.md`, merged as `077c112`.
> #164 names three candidate workstreams and explicitly refuses to pre-commit to one ("options to
> evaluate under pk:plan/pk:perf — do not pre-commit"). This card is the pricing pass that lets the
> next card choose with numbers instead of taste. **Work Type: Research Work** — exception
> verification path (acceptance, evidence, review, verification); no TDD chain, no production code.

## Intent

The drain's cost has never been *decomposed*. Every number we own is end-to-end client latency:
the transaction, the lock wait, ~60 sequential store calls and the commit are one opaque
`p50 5 252.2`. That opacity is why #164 must list three workstreams — nobody knows which one the
seconds live in. A card that guesses wrong ships a large, risky refactor (batching ~420 round-trips
is not small) to fix a cost that might be a lock convoy, or pool starvation, or commit overhead.

## What the record says (measured 2026-09-16, run BUILD_ID `bvNR64rGCO_1U4bOs3gs5`)

- **Solo:** driver n=12/15, p50 1 649.7–1 737.4 ms, p95 ≤ 1 949.0 — HOLDS. Browser drain
  1 679–1 837 ms, inside M3's recorded 1 643–1 838 band.
- **Contended (~11 rps bystanders + two overlapping 60-mutation drains):** driver n=16,
  p50 5 252.2 / p95 6 123.8 — MISSES; browser drain **11 676 ms**; bystander syncs p50 896.2 /
  p95 1 074.6, paying 2–4× their solo cost.
- **The shape is already a clue and the spike must test it, not assume it:** a 6 500 ms sleep
  injected *inside* `applySync` under `lockSession` (`lib/repositories/workout-repository.ts`,
  the anchor `solo-control` triple used) landed client-side **~1:1** (8 206 − 1 649 = 6 556).
  So per-mutation server work is *not* hidden by anything client-side — but that says the pipe is
  honest, not where the 3.5 s solo→contended delta lives. Contention candidates the pricing must
  separate: (a) row-lock/`lockSession` serialization between the two batch streams,
  (b) pool exhaustion behind the bystanders, (c) the fan-out itself (per-mutation round-trips
  ×~60) growing super-linearly as WAL/lock traffic grows, (d) commit/fsync cost.
- Capacity context (#90's law): this box tops out near ~11 rps total; the contended condition is
  *ordinary* concurrent sync, not saturation — the miss is not a overload artifact.

## Scope

| | Change | Why this shape |
| :--- | :--- | :--- |
| **Deliverable** | One spike document `docs/spikes/2026-09-XX-apply-path-costing.md`: per-phase cost table (ms, with denominators) for a 60-mutation apply under **solo and contended** on the same venue, plus **one recommended workstream** from #164's list with a predicted effect ("contended driver p95 should move from 6 124 toward X"). | The recommendation is the card's product. A table without a pick fails AC-4; a pick without the table is the taste this card exists to ban. |
| **Instrumentation** | Either `pg_stat_statements`/server-side timing if the local stack exposes it, or a throwaway instrumented build (per-phase `performance.now()` around lock acquisition, per-store-call, commit) logging to stdout. **Never committed** — the control scripts' law applies: `git status` after the run must be clean. | Reuse of the committed instruments (`npm run perf:contention`, `scripts/perf/batch-contention-*.sh`) is mandatory; the spike adds measurement, not a new load generator. |
| **Venue** | Same local box, same `.env.local`/stack, same PATH/LD_LIBRARY_PATH quirks; disclosed as local in the artifact (the #90 rule: perf numbers live here, never in CI). | The comparison is solo-vs-contended on one instrument; portability is not the claim. |
| **Out of scope** | Production code edits (zero — `git diff main -- lib/ src/` must be empty at the end), budget moves of any kind, closing or editing #164's scope, implementing anything. | This card ends when the seconds are located. |

## Acceptance criteria

```gherkin
Scenario: The seconds are located
  Given a 60-mutation apply under solo and under the committed contended condition
  When the phase table is written down
  Then each phase (lock wait, per-mutation store calls in aggregate, commit, network/queue if
       separable) has an ms cost and an n, for both conditions
  And the contended total reconciles against the known 5 252–6 124 ms client band within one run's noise

Scenario: The recommendation is falsifiable
  Given the artifact's single recommended workstream
  Then it states the predicted contended driver p95 after the fix
  And M4-27's AC can be checked against that prediction without re-litigating the design

Scenario: The scratch code did not survive
  Given the spike is complete
  When git status and git diff main -- lib/ src/ run
  Then both are empty, and the instrumented build (if any) is gone from the tree

Scenario: The instrument still measures
  Given the unmodified tree
  When scripts/perf/batch-contention-solo-control.sh's baseline leg alone is re-run
  Then it lands back inside the recorded solo band (p50 ≈ 1 650–1 750 ms), proving the venue
       did not drift while the spike was running
```

## Verification

```bash
# the venue, unchanged:
npm run perf:contention -- --duration=45 --label=solo --batch-users=1 --bg-users=0
npm run perf:contention -- --duration=45 --label=contended
# final hygiene:
git status --porcelain && git diff main --stat -- lib/ src/
```

Handoff: recommend to **#164**; owner ratifies the workstream in a one-line comment there;
**M4-27** (`docs/tasks/m4/M4-27-contention-drain-fix.md`) is the implementation card and must not
start before that comment exists.
