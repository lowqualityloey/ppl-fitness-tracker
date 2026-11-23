> **M4-36** · Contract honesty · `#priority/p2` · Derived from: issue **#77** ("Sync rejections carry only a code, so the client cannot explain a refused change", found while implementing #63); `docs/specs/2026-09-14-spec-m4-hardening-telemetry-decommission.md` §4.1 ("#77: additive optional message on rejections (code stays the machine truth)"); `docs/STATE.md` §5 open finding ("**#77** — sync rejections carry only a reason code; the client cannot explain a refusal").

## Intent
As the athlete holding a phone with chalk on my hands, I want a refused change to tell me **what the server objected to in its own words** — "Set index exceeds the routine target set count." rather than `INVALID_MUTATION` — so the screen does not have to keep a second copy of the phase machine to guess.

## What the record says
- `SyncRejectionSchema` is `{ mutationId, reason }` and `.strict()` (verified at `lib/contracts/sync.ts:74-77`).
- `rejectionReason()` (`lib/domain/sync/sync-engine.ts:99-104`) maps four error classes to four codes and **discards `error.message`**, which every one of those classes is constructed with (verified: `lib/domain/sessions/transition-table.ts:70,90,107,123,130,139,148,151,155,161,167,174`, `lib/domain/sessions/session-engine.ts:49,60`, `lib/repositories/workout-repository.ts:616,661,677,688,699,1063` — all take a literal sentence as the only argument).
- The client cannot recover the sentence later: a refused mutation leaves the outbox, so `src/app/state/reconcile.ts:16-42` derives a `label` from the payload while it is still in hand and renders `"Set 3 — CONFLICT"` (`src/app/session/[id]/runner.tsx:1190-1196`).
- `SyncResponseDataSchema` is the only contract touched; `applied`/`serverSeq`/`clockSkewMs` are unchanged (`lib/contracts/sync.ts:97-102`).
- `sync_mutations.rejection_reason` stores a **code**, not a sentence — so replaying an already-rejected record has no stored message to return. **No migration**: the sentence is derived at response time, and the replay path answers with a fixed sentence per code.

## Scope (decision → implementation, one PR)
- **Contract**: `SyncRejectionSchema` gains `message: z.string().min(1).max(200)`. `reason` is untouched — this is additive, not a replacement.
- **Domain**: `rejectionReason()` becomes `rejectionFor()`, returning `{ reason, message }`; the caught-error path carries `error.message` verbatim. Every other rejection site (payload-hash reuse, foreign reservation, stale version, replay of a rejected record) gains its own sentence.
- **Consumers**: `VisibleRejection` gains `message`; `reconcile()` keeps the whole rejection item instead of collapsing it to a code; `RejectionLine` renders the sentence and stops rendering the code.
- **Deliberate deviation from the spec sketch**: §4.1 wrote `message: z.string().max(200).optional()`. This card makes it **required**, because every server rejection path has a sentence available and an optional field would put a fallback branch back in the UI — the exact thing #77 exists to delete. The 200 cap is kept. Recorded here so the deviation is a decision, not a drift.

## Out of scope
- #63's local gate mirror (`gateFor()`/`TASK_PHASES` in the runner) is **not** deleted here. #77 says it "can shrink to a hint"; shrinking it is a separate change with its own ACs, and doing both at once would make a red e2e ambiguous between the two seams.
- No database migration. `sync_mutations.rejection_reason` keeps holding a code.
- No change to `applied`, `serverSeq`, `clockSkewMs`, or the request half of the contract.

## Acceptance criteria
```gherkin
Scenario: A refused mutation carries the domain's own sentence
  Given a set mutation whose setIndex exceeds the routine's target set count
  When the batch is applied
  Then the rejection item is { mutationId, reason: 'INVALID_MUTATION', message: 'Set index exceeds the routine target set count.' }
  And reason is still the machine code it was before this change

Scenario: The code is not replaced
  When any rejection is produced
  Then reason is one of the codes the server emitted before this change
  And message is a non-empty sentence of at most 200 characters

Scenario: A rejection with no domain error still explains itself
  Given a mutation id reused with different contents, a foreign reservation, or a stale version
  When the batch is applied
  Then the rejection carries a sentence written for that case, not an empty string

Scenario: The screen shows the sentence, not the code
  Given the runner has a rejection
  When it renders the rejection row
  Then the row reads "<label> — <message>. Reload to see the server's state."
  And the row no longer contains the raw reason code

Scenario: The contract refuses a rejection that cannot explain itself
  When a sync response body carries a rejection with no message, or an empty one
  Then SyncResponseDataSchema.parse throws
```

## Automated Verification
```bash
npm run typecheck && npm run lint
npm test
npm run test:api
npx playwright test session-runner.spec.ts
```

## Definition of done
`SyncRejectionSchema` carries `message`; `rejectionFor()` threads `error.message`; `VisibleRejection` and `RejectionLine` render it; every test that asserted the old three-key rejection shape is updated to the new one (not deleted); `docs/STATE.md` §5's #77 bullet is struck; the board row moves out of "parked".

## Dependencies
- Soft: coordinated with M4-16 (#105), which touches the same response contract's other field. #105 is merged (`52ebcc0`), so this card lands on a contract that already lost `state`.

## Outcome (2026-11-24) — DONE

Branch `feat/m4-33-rejection-message` off `main` `c8adbe0`.

**The change is additive in the contract and subtractive in the UI.** `reason` is byte-identical to
what it was: the same four codes from the same four error classes, still what
`sync_mutations.rejection_reason` stores, still what a retry policy or a metric would switch on.
`message` is new beside it, and the runner now renders the sentence instead of the code — which is
the only place the code was ever shown to a human.

**Deliberate deviation from the spec sketch, recorded so it is a decision and not drift.**
`docs/specs/2026-09-14-spec-m4-hardening-telemetry-decommission.md:348` sketched
`message: z.string().max(200).optional()`. This card makes it **required**. Every server rejection
path has a sentence available — the caught-error path reads `error.message`, and the four paths with
no live error (payload-hash reuse, foreign reservation, stale version, replay of a rejected record)
each got a written one — so an optional field would only put a fallback branch back in the UI, which
is the exact thing #77 exists to delete. The 200 cap is kept as sketched.

**No migration, and the replay path is why that is honest.** `sync_mutations.rejection_reason`
holds a code, so a replayed rejection has no stored sentence to return. `replayMessage(reason)`
reconstructs one per code rather than returning an empty string, and
`tests/unit/domain/sync-engine.test.ts` asserts the replay carries
`'The session changed since this change was queued.'` — the case that would otherwise have shipped
silently as `message: ''`.

**AC-1, the domain's own sentence reaches the wire (green, and red first).** The RED run was
`5 files / 11 failed | 72 passed (83)`, every failure the same shape:
`ZodError: unrecognized_keys keys:["message"] path:["rejected",0]` — the contract refusing the new
field before the contract knew about it. After the implementation the same five files read
**83 passed (83)**. The sentence is not paraphrased anywhere: `rejectionFor()` returns
`error.message` verbatim, and the integration lane asserts the literal
`'Set index exceeds the routine target set count.'` that `lib/domain/sessions/transition-table.ts:113`
throws.

**AC-2, the code is not replaced.** `SyncRejectionSchema` still requires `reason: z.string().min(1)`,
and `tests/unit/contracts/contracts.test.ts` asserts a rejection with `message` but no `reason` is
refused, as is one with `reason` but no `message`, an empty `message`, and a 201-character one. The
200-character boundary is asserted from both sides. `grep -rn 'MUTATION_REJECTED'` finds only the
three engine sites and the one integration assertion that already existed.

**AC-3, a rejection with no domain error still explains itself.** Measured in
`tests/unit/domain/sync-engine.test.ts`: `MUTATION_ID_REUSE` →
`'This change was already sent with different contents.'`, `STALE_CONFLICT` →
`'A newer change to this set already reached the server.'`, and the replay case above. The foreign
reservation deliberately keeps the generic `'The server refused this change.'`: a specific sentence
would leak the same fact the code already hides.

**AC-4, the screen shows the sentence, not the code.** `RejectionLine` renders
`{label} — {message} Reload to see the server's state.` The e2e spec
(`tests/e2e/session-runner.spec.ts:219`) asserts the sentence, keeps `'Set 1'` for the label, and
adds `not.toContainText('CONFLICT')` so the code cannot creep back in.

**AC-5, the contract refuses a rejection that cannot explain itself.** Covered by the four negative
cases in AC-2 plus the re-aimed fixture guard: `tests/unit/contracts/sync-response-fixture.test.ts`
test 4 previously proved `message` was an *invented* carrier; now that `message` is real, the test
keeps the `{mutationId, message}` throw (refused for the missing `reason`) and adds a second throw
for an invented `detail` key beside a valid `reason` + `message`, so the guard still proves the
fixture cannot rename a field.

**Full gate, measured on this host.** `npm run typecheck` exit 0; `npx eslint --max-warnings=0 .`
exit 0; `npm test` **69 files / 686 passed (686)** in 46.5 s; `npm run test:api`
**14 files / 84 passed (84)**; `npx playwright test session-runner.spec.ts --workers=1`
**7 passed (1.4 m)**, including the rejection spec and the 100-tap SLA at p95 25.2 ms.

**One e2e red, and it is not this change.** The first `session-runner` run at default parallelism
failed `paints a tap in under 50 ms across 100 taps` at p95 71.2 ms while the other six passed. Run
alone it measured p95 20.6 ms; run serially the whole file measured p95 25.2 ms and passed 7/7. That
is the worker-contention breach `docs/rca/m4-100-contention-ledger.md` already documents (pass C:
median 21.5 / p95 53.5 / max 69.9 ms on the same build that measured 27.4 and 24.9 ms p95 in passes A
and B), on a 4-core host, not a regression from a contract field. The gate line was not touched.

**Docs.** `docs/STATE.md` §5 strikes the #77 bullet; §1 `Last Updated` and `Current Working Branch`
name this branch; §8 gains a row. `docs/tasks/m4/README.md` moves #77 out of the parked list into the
board as M4-36 and notes the #105 interaction. No other document changed: the spec's §4.1 sketch is
left as written, because it is a dated record of what was planned and this card is the record of what
was decided instead.

