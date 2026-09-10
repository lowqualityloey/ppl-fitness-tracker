# M3 — Presentation & Client Integration: task breakdown

**Source spec**: `docs/specs/2026-09-11-spec-m3-presentation.md` (grilled 2026-09-11; §8 amendments are binding)
**Milestone**: `M3: Presentation` (#3) · **Issues**: #57–#67 · **Created**: 2026-09-11

| Slice | Issue | Title | Priority | Depends on |
| :-- | :-- | :-- | :-- | :-- |
| `M3-00` | [#57](https://github.com/lowqualityloey/ppl-fitness-tracker/issues/57) | Profile endpoints + session prefill reads | p1 | — |
| `M3-01` | [#58](https://github.com/lowqualityloey/ppl-fitness-tracker/issues/58) | Real `since` deltas on session detail | p1 | — |
| `M3-02` | [#59](https://github.com/lowqualityloey/ppl-fitness-tracker/issues/59) | Tailwind/shadcn foundation + contrast-safe tokens | **p0** | — |
| `M3-03` | [#60](https://github.com/lowqualityloey/ppl-fitness-tracker/issues/60) | Playwright + axe harness, with a failing control first | **p0** | M3-02 |
| `M3-04` | [#61](https://github.com/lowqualityloey/ppl-fitness-tracker/issues/61) | Dashboard `/` | p1 | M3-02, M3-03 |
| `M3-05` | [#62](https://github.com/lowqualityloey/ppl-fitness-tracker/issues/62) | Durable outbox + reconciliation | **p0** | M3-01 |
| `M3-06` | [#63](https://github.com/lowqualityloey/ppl-fitness-tracker/issues/63) | Session runner, optimistic tap, prefill UI | **p0** | M3-00, M3-04, M3-05 |
| `M3-07` | [#64](https://github.com/lowqualityloey/ppl-fitness-tracker/issues/64) | `TimerController`: absolute deadlines | p1 | M3-06 |
| `M3-08` | [#65](https://github.com/lowqualityloey/ppl-fitness-tracker/issues/65) | History + progress views (no new backend) | p1 | M3-02, M3-03, M3-04 |
| `M3-09` | [#66](https://github.com/lowqualityloey/ppl-fitness-tracker/issues/66) | Settings, `UnitDisplay`, legacy import report | p1 | M3-00, M3-05 |
| `M3-10` | [#67](https://github.com/lowqualityloey/ppl-fitness-tracker/issues/67) | M3 verification gate + handoff | **p0** | everything |

## Recommended order

`M3-00` and `M3-01` (backend, parallel) → `M3-02` → `M3-03` → `M3-04` → `M3-05` → `M3-06` → `M3-07` →
`M3-08` / `M3-09` (parallel) → `M3-10`.

Three dependencies are load-bearing, and each comes from the grilling pass rather than from taste:

1. **`M3-01` before `M3-05`.** Polling a full 8–15 KB session every few seconds cannot honestly meet the 5 s
   cross-device SLA; deltas are a prerequisite, not an optimisation (RFC §8.3).
2. **`M3-03` before any screen is *claimed* accessible.** `tests/e2e/` does not exist and Playwright has zero
   specs, so without the harness — and its deliberately-failing control — "the E2E gate is green" would be
   decoration (intake debt **D7**).
3. **`M3-02` before every screen.** Two specified colours currently fail the standard this project also
   specifies (`--accent-pull` at 2.88:1 on `#f9fafb`); the token gate is what keeps that from recurring.

## Two things every M3 slice must respect

- **`session.start` is not queueable.** The sync contract has four ops and none starts a session, so **Start
  requires connectivity** and everything after it is offline-capable, including a queued `session.finish`
  (RFC §8.1; a named deviation from the master RFC's G5, decided 2026-09-11).
- **Any rejection forces a full authoritative refetch.** Item-level `applied[]`/`rejected[]` means FIFO is not
  a transaction; surgical rollback is forbidden (RFC §8.2).

## Sizing note, so the deviation is on the record

`pk:tasks` prescribes 1–4 hour issues. These are **one-PR-sized slices**, matching how M2's seven issues
(#36–#42) were actually executed — M2-04 and M2-05 were plainly not 4-hour units. Splitting further would have
produced issues that cannot be reviewed independently, which is the property that mattered in M2. Where a slice
is large (`M3-05`, `M3-06`), its tasks are ordered inside the card so the PR can still be built test-first.

## Regenerating an issue body

Each issue body is the corresponding file verbatim:

```bash
gh issue edit 57 --body-file docs/tasks/m3/M3-00-client-facing-backend-reads.md
```
