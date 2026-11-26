> **M4-37** · Product truth · `#priority/p2` · Derived from: issue **#76** ("No API path produces an archived session, so #63's archived-session scenario is untestable", filed 2026-09-11 and falsified by measurement on 2026-11-26); `docs/specs/2026-09-14-spec-m4-hardening-telemetry-decommission.md` §4.1 ("#76: POST /api/sessions/[id]/archive → in_progress|completed → archived"); `docs/STATE.md` §5 open finding ("**#76** — no API path produces an `archived` session").

## Intent
As the athlete who logged workouts in the old app and had them carried across, I want the sessions that came in without an end time to say so plainly — not to be told I abandoned a workout I finished, and never to see a clock still counting up under a label that claims to be a workout length.

## What the record says

### The filed premise is false
- `POST /api/import/legacy` writes `status: 'archived'` and always has: `lib/repositories/legacy-import-repository.ts:152` inside the commit path, with `source: 'legacy_import'`, `completedAt: null` and the comment "Deliberately NULL: no legacy payload recorded when a session ended" (`:154`). Introduced by `3ecaf2f` (2026-09-11, "feat(import): recover legacy localStorage through POST /api/import/legacy").
- That path is covered: `tests/integration/repository/legacy-import-repository.test.ts:187` asserts `rows.every((row) => row.status === 'archived')` at `:199`.
- The `inArray(status, ['completed','archived'])` branch at `lib/repositories/workout-repository.ts:451` is exercised by `tests/integration/api/prefill.test.ts:107` and `:121`, both seeding `'archived'`.
- #65, the card #76 deferred its decision to, is **CLOSED** — as is #63. The deferral target is gone, which is why the card sat unresolved rather than wrong.

### The real gap, in three parts
- **A clock that lies.** `src/app/session/[id]/runner.tsx:224` reads `const readOnly = serverView.status !== 'in_progress';` and `:509-513` renders the banner. But `finishedElapsedMs` (`:263-267`) returns `null` when `completedAt === null`, so `elapsedMs` fell through to the live clock, whose effect (`:276-285`) started whenever `finishedElapsedMs === null`. An archived row — read-only with a NULL `completedAt`, exactly the importer's shape — therefore rendered **"Workout length"** over a value counting up from `startedAt` forever. A `completed` session froze correctly (`tests/e2e/timers.spec.ts:368-375` proves it), so only the archived case lied.
- **A mislabel on the receipt.** `src/app/history/[id]/page.tsx:75-78` rendered `{view.status === 'completed' ? 'Complete' : 'Not finished'}`, so `archived` read as **"Not finished"** — telling the athlete they abandoned a workout they never abandoned. `summaryLine()` (`:191-201`) said `· not finished` for the same rows.
- **No test ever opened one.** `tests/e2e/session-runner.spec.ts` had six tests and only `:290` touched read-only, against a **completed** session. `src/app/history/[id]/page.tsx:164-167` links `/session/${view.id}` only when `status === 'in_progress'`, so the archived read-only screen had no UI path at all — URL only.

### Decision: `/history/[id]` gains no link
The report page is the receipt. It already renders the sets, the tasks and the status, and the session behind it cannot change. Sending an athlete from an immutable record into a runner full of disabled controls buys nothing, and a "view the runner" link invites exactly the misreading the read-only banner exists to prevent. The archived runner stays reachable by URL — that is #63's contract — and now has a test plus a clock that tells the truth. This is the decision the card asked for, recorded here so the next reader does not re-open it.

## Scope (decision → implementation, one PR)
- `src/app/session/[id]/runner.tsx` — the elapsed-timer effect is gated on `readOnly` instead of "has a finished length", so a read-only session never starts a clock; the render shows **`Length not recorded`** when `readOnly && serverView.completedAt === null`, before the `Timing…` and live branches.
- `src/app/history/[id]/page.tsx` — `STATUS_LABEL` maps all three statuses (`Not finished` / `Complete` / `Archived`) and `summaryLine()` says `· length not recorded` for an archived row instead of `· not finished`.
- `src/app/history/page.tsx` — the list row's timestamp suffix follows the same rule.
- `tests/e2e/session-runner.spec.ts` — one new test seeding the importer's own shape (`status: 'archived'`, `phase: 'exercise'`, `source: 'legacy_import'`, `completedAt: null`) and opening the runner by URL.

## Out of scope
- **No `POST /api/sessions/[id]/archive`.** The spec's §4.1 sketch proposed that endpoint on the premise that no producer existed. The premise is false, so the endpoint would add a second writer for a state the importer already produces, and nothing in the product archives a session. The sketch is left as written — it is a dated record of what was planned — and this card is the record of what was decided instead.
- **No migration.** `status` is text-constrained in the contract layer, not an enum column; no schema change is involved.
- **No link from the report to the runner** (see the decision above).
- **#76's own text** is re-scoped in place on GitHub rather than rewritten here; the card keeps its number and its history.

## Acceptance criteria

```gherkin
Scenario: an archived session opens read-only and does not pretend to have a length
  Given a session the legacy importer wrote, with status archived and no completedAt
  When the athlete opens its runner URL
  Then the screen names the state "Archived" and says it is read-only
  And the elapsed readout reads "Length not recorded"
  And it still reads "Length not recorded" seconds later, because no clock is running

Scenario: nothing on an archived screen can record
  Given the same archived session
  Then every set control is disabled, with the sets the import recovered still shown as logged
  And the phase control is present but inert
  And there is no finish control
  And a forced tap enqueues no mutation and leaves the row unchanged on the server

Scenario: the report names the state it actually is
  Given an archived session
  Then its report page badges it "Archived" and summarises it as "length not recorded"
  And an in-progress session still badges "Not finished" and summarises "not finished"

Scenario: a completed session still freezes its length
  Given a completed session with a completedAt
  Then the runner shows "Workout length" with the frozen duration, as before
```

## Automated Verification

```bash
npm run typecheck && npm run lint
npm test
npm run test:api
node --env-file-if-exists=.env.local node_modules/@playwright/test/cli.js test \
  session-runner.spec.ts timers.spec.ts history.spec.ts --workers=1
```

## Definition of done
- Every acceptance criterion is covered by an automated test, and the new e2e was watched **red** before the fix.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:api` and the three Playwright files all pass, measured on this host.
- The stale premise is corrected in `docs/tasks/m4/README.md`, `docs/STATE.md` §1 and §5, and the spec's §4.1/§4.2 notes; issue #76 is re-scoped in place.
- One commit on `main`.

## Dependencies
- None. `tests/e2e/history-fixtures.ts` already exports `openHistoryDb` and `seedSession`, whose `SeedSession.status` union includes `'archived'`; `tests/e2e/auth.ts` exports `signInFreshUser`.
- Supersedes the §4.1 endpoint sketch for #76 without deleting it.
## Outcome (2026-11-26) — DONE

**AC-1, the archived screen tells the truth about its length (green, and red first).** The new test was written before the fix and run against the untouched source: it failed at `tests/e2e/session-runner.spec.ts:386` with `Expected: "Length not recorded" / Received: "Timing…"`, which is the defect stated as a measurement rather than an argument — on that row `finishedElapsedMs` is `null`, so the live clock was still being constructed and `elapsedMs` never arrived. With the fix the same test passes in 23.7 s. The readout is asserted twice with a real three-second gap between the reads, so a clock that kept counting cannot pass by being read once.

**AC-2, nothing on that screen can record (green).** Every `[data-testid^="tick-"]` row is asserted disabled while exactly two carry `aria-pressed="true"` — the two sets the seed says the import recovered. The count is asserted as a floor plus an exact count of pressed rows, not as an exact row count, because a seeded session renders the routine day's whole plan (17 tick rows for push day) and only the seeded sets are logged. `finish-session` has count 0; `advance-phase` is asserted **disabled**, not absent, because the stepper is information and stays visible on a read-only screen. Then a forced click plus a 1 500 ms wait, with a `request` listener counting POSTs to `/api/sync`: the collection is empty and the row is unchanged server-side (`status` still `archived`, two completed sets).

**AC-3, the report names the state it is (green).** `STATUS_LABEL` at `src/app/history/[id]/page.tsx:195` maps `in_progress → Not finished`, `completed → Complete`, `archived → Archived`; `summaryLine()` at `:206` returns `· length not recorded` for an archived row without a `completedAt` and keeps `· not finished` for an in-progress one. `tests/e2e/history.spec.ts:228-229` pins the in-progress wording (`getByText('Not finished', { exact: true })`, `getByText(/· not finished$/)`) and still passes, so the new word was added beside the old rather than over it. The history list's timestamp suffix follows the same rule at `src/app/history/page.tsx:166`.

**AC-4, a completed session still freezes its length (green, unchanged).** `tests/e2e/timers.spec.ts:338` "a finished session shows a length, not a clock that keeps counting" passes untouched — the `readOnly` guard reaches the same answer for a completed row as the old `finishedElapsedMs !== null` guard did, because a completed session has a `completedAt` and never takes the new branch.

**Full gate, measured on this host.** `npm run typecheck` exit 0; `npm run lint` exit 0; `npm test` **71 files / 741 passed (741)** in 42.70 s; `npm run test:api` **14 files / 84 passed (84)** in 89.64 s; `node --env-file-if-exists=.env.local node_modules/@playwright/test/cli.js test session-runner.spec.ts timers.spec.ts history.spec.ts --workers=1` **21 passed (3.0 m)**, including the 100-tap SLA at p95 18.1 ms against the 50 ms gate.

**Two things the gate taught, recorded so the next reader does not re-learn them.** (i) `npm run test:api` refused to start until a leaked `next dev` on port 3001 was killed: `tests/integration/api/global-setup.ts:72` found it already serving and treated it as a leaked server from a previous run, then the Vitest reporter crashed printing the refusal (`TypeError: code.charCodeAt is not a function`), which that file documents as a known Vitest 5.0.5 bug. The first Playwright attempt also failed 18 of 21 for the same leaked server — every failure was `signInFreshUser` bouncing to `/sign-in` because that stale build no longer accepted the cookies it installed. Both lanes were green after `kill`, and neither failure was a regression from this change. (ii) The build re-stamps the **tracked** `public/sw.js` (`BUILD_VERSION` = a hash of a per-build random `BUILD_ID`), so a local gate leaves that file dirty; it was restored with `git show HEAD:public/sw.js > public/sw.js` and is not part of this commit, which is the same handling M4-15, M4-31 and M4-22 recorded.

**Docs.** `docs/tasks/m4/README.md:52` moves #76 off the parked list into the board as M4-37 (five parked issues become four) and its closing paragraph says so; `docs/STATE.md` §1's `Last Updated` and milestone sentence drop the "needs a product decision" characterisation, §5's open-findings bullet is replaced by the measured finding, and §8 gains a row; the spec's §4.1 sketch and §4.2 note are annotated rather than rewritten, because they are dated records of what was planned and this card is the record of what was decided. Issue #76 is re-scoped in place with the measurement, keeping its number and history.
