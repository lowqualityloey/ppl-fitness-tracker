> **M4-38** · Contract truth · `#priority/p3` · Derived from: issue **#82** ("The card for /history asks for ?from=/?to= paging; SessionsListQuerySchema accepts only an opaque cursor", filed 2026-09-11 while building #65's /history); `docs/specs/2026-09-14-spec-m4-hardening-telemetry-decommission.md` §ASSUMPTION-m4-006 ("additive `?from=`/`?to=`, inclusive, combinable with the existing opaque cursor; #82's contract test must pin all four from/to × cursor combinations"); `docs/tasks/m4/README.md` parked row.

## Intent

As the athlete, I want to narrow my history to a date window without losing the page walk inside it, so that "what did September look like" is a filter on the log I already trust rather than a second, differently-paged list.

## What the record says

### The card asked two questions, and only one of them is this card

`gh issue view 82` asks (a) whether a range is a **filter on the list** or a **separate aggregation**, and (b) whether `from`/`to` include the boundary dates and what happens to `?cursor=` when a page ends mid-range. Question (a) has a second half the contract cannot answer: a "your September" projection needs a set-count or total-volume per day, and `SessionSummary` (`lib/contracts/sessions.ts:92-104`) carries neither. That is #108 / M4-19, and it is out of scope here.

### Decision: the range is a filter, and both ends are inclusive

`from`/`to` are `LocalDateSchema.optional()` on the existing `.strict()` object (`lib/contracts/sessions.ts:63-64`), so the change is a widening: the bare call is byte-for-byte the same request and the same response. Both ends are inclusive because `from=2026-09-01&to=2026-09-30` reads as September to every human who types it; a half-open window would be an off-by-one the URL does not warn about. `from === to` is therefore one legal day, not an empty window.

### Decision: the cursor is a position, the range is a filter, and they compose by conjunction

The cursor encodes `{localDate, id}` and the list is ordered `desc(local_date), desc(id)` (`lib/repositories/workout-repository.ts:236-262`). Both predicates are monotone in that same order, so the keyset predicate and the range predicate are both plain `AND`s:

```ts
.where(and(
  eq(workoutSessions.userId, userId),
  cursorFilter,
  query.from ? gte(workoutSessions.localDate, query.from) : undefined,
  query.to ? lte(workoutSessions.localDate, query.to) : undefined,
))
```

Nothing inside the cursor had to change, because the range is not part of the position — it is part of what counts. A page boundary can therefore neither repeat nor skip a day inside the window, which is exactly the bug the issue was filed to prevent ("a UI-only filter … produces a list whose 'next page' link skips or repeats days"). The cost of that choice is that the range has to travel with the next-page link, and it does (`src/app/history/page.tsx:76`, `historyHref`). The range rides `session_history` — `index('session_history').on(t.userId, t.localDate.desc())` at `db/schema/index.ts:138` — so no migration and no new index.

### The gap the issue did not name: an impossible date was a 500

`LocalDateSchema` was `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)` (`lib/contracts/common.ts`, before this card): it accepted `2026-02-31`, and the first thing to notice would have been Postgres rejecting the `date` cast — a 500 from a URL the athlete can type. It is now `z.iso.date('Expected a YYYY-MM-DD date.')` (`lib/contracts/common.ts:12`), which is a real calendar check with the same message and no dependency on `lib/domain` (contracts must not import domain). The repository already had the strict authority in `isValidLocalDate` (`lib/repositories/workout-repository.ts:153-164`) for cursors; now the boundary agrees with it instead of discovering it later.

### The page tells the truth about what it is showing

A filtered page that ends with "That is the whole log." is lying, and an empty filtered page that says "No workouts yet." is telling the athlete their log is empty when it is the window that is empty — the same class of lie #76 fixed on an archived session's receipt, one screen over. So: the header states the window (`describeRange`), the empty state branches ("No workouts in this range." + a clear link), and the footer says "That is the whole range." when a range is active (`src/app/history/page.tsx:84, 119-135, 175`). The form is a plain `<form method="get" action="/history">` with two `<input type="date">` — no client JavaScript, because the page is already `force-dynamic` and the server is the only thing that can answer "which sessions fall in this window". A range change submits without a cursor: it is a fresh walk, not a page two.

## Scope (decision → implementation, one PR)

- `lib/contracts/common.ts` — `LocalDateSchema` becomes `z.iso.date(...)`: an impossible date is a 400 at every boundary instead of a Postgres 500. Same message, so no consumer changed.
- `lib/contracts/sessions.ts` — `SessionsListQuerySchema` gains `from`/`to` as `LocalDateSchema.optional()` plus a cross-field `.refine` rejecting `from > to` (`path: ['from']`). `SessionsListDataSchema` is untouched: the response shape does not learn about the filter.
- `lib/repositories/workout-repository.ts` — `ListSessionsQuery = { cursor?, from?, to? }`; `listSessions(userId, query = {})` builds the two range predicates beside the existing keyset predicate.
- `src/app/api/sessions/route.ts` — passes `{ cursor, from, to }` through; the route still owns no filtering logic.
- `src/app/history/page.tsx` — the range form, the window in the header, the range-aware empty state and footer, and `from`/`to` carried on the next-page link.
- Tests: the contract matrix in `tests/unit/contracts/contracts.test.ts`, the inclusive-and-scoped API test plus the 400 test in `tests/integration/api/sessions.test.ts`, the repository window test in `tests/integration/repository/workout-repository.test.ts`, and two e2e tests in `tests/e2e/history.spec.ts`.

## Out of scope

- **A per-day aggregation ("your September": count, total volume).** That is #108 / M4-19 and needs a projection `SessionSummary` does not carry. A filter can be answered from the rows already being read; an aggregation cannot.
- **A required window.** `measurements.ts:49-56` makes both ends required because an unbounded measurement list is not a promise anyone wants to keep (OC-3). History is the opposite case: the whole log *is* the default view and #65 shipped it, so making a window mandatory would be a breaking change dressed as consistency.
- **A cursor that carries the range.** The issue suggested echoing the range inside the cursor. Conjunction makes that unnecessary — a stale link with a cursor but no range still cannot jump outside a filter it no longer has, and a link that keeps the range is correct by construction. Echoing it would make the cursor stateful in a way that breaks the existing `{localDate, id}` contract for no gain.
- **Remembering the last range in a cookie or the profile.** A URL is the state; a remembered filter makes "why am I missing workouts" a support question.
- **Changing the ordering or the page size.** Still `desc(local_date), desc(id)`, still `PAGE_SIZE = 20`.

## Acceptance criteria

```gherkin
Scenario: the four from/to × cursor combinations are all legal
  Given the list contract that /api/sessions and /history both parse
  When it is given neither end, both ends, only a start, or only an end
  And each of those is given with and without the opaque cursor
  Then all eight combinations are accepted

Scenario: the window is inclusive on both ends
  Given sessions logged on 2027-01-05 through 2027-01-10
  When history is asked for from=2027-01-05&to=2027-01-10
  Then both 2027-01-05 and 2027-01-10 are in the page
  And from=2027-01-07&to=2027-01-07 returns exactly that one day

Scenario: an impossible or backwards window is a validation error, not a server error
  Given a request for from=2026-02-31, or from=2026-09-30&to=2026-09-01
  When it reaches the list endpoint
  Then it is a 400 VALIDATION_ERROR
  And the page renders its not-found response from the same definition

Scenario: the walk stays inside the window it started in
  Given 21 sessions on 2026-08-01 through 2026-08-21
  When /history?from=2026-08-01&to=2026-08-21 offers a next page
  Then that link still carries from and to
  And the second page holds only the remaining day, and says "That is the whole range."
```

## Automated Verification

```bash
npm run typecheck && npm run lint
npm test
npm run test:api
node --env-file-if-exists=.env.local node_modules/@playwright/test/cli.js test \
  history.spec.ts --workers=1
```

## Definition of done

- Every acceptance criterion is covered by an automated test, and the new tests were watched **red** against the pre-card schema before the change.
- The five gates pass, measured on this host.
- `docs/tasks/m4/README.md`, `docs/STATE.md` and the spec's ASSUMPTION-m4-006 resolution are updated.
- Issue #82 is closed against these tests.
- One commit on `main`.

## Dependencies

None. The route, the repository, the index (`session_history`) and the page all already existed; this card widens a contract and teaches one screen to use it.

## Outcome (2026-11-26) — DONE

**AC-1, all eight from/to × cursor combinations (green, and red first).** Against `ce1e677`'s schema, a probe measured `{from:'2026-09-01'}` → rejected, `{cursor:'c', to:'2026-09-30'}` → rejected, and `LocalDateSchema.safeParse('2026-02-31')` → **accepted**. That is the red state: the old contract refused the feature outright and the old date schema let an impossible date through. `tests/unit/contracts/contracts.test.ts:285` now loops the four window shapes, each bare and each spread with `{ cursor: 'opaque-cursor' }`, and pins `from === to` legal, backwards rejected, `2026-02-31` / `2025-02-29` rejected, `2024-02-29` accepted, `from: ''` and `from: '2026-9-1'` rejected, and `{since:'12'}` still rejected by `.strict()`.

**AC-2, both ends inclusive (green).** `tests/integration/repository/workout-repository.test.ts:283` reuses the 21 seeded 2027-01 rows and pins the six-day window to exactly `['2027-01-10' … '2027-01-05']` with `nextCursor` null, `from=to` to `['2027-01-07']`, `from`-only to the last four days, `to`-only as a bound, and a window with no matches to `{ sessions: [], nextCursor: null }` — an empty page, not an error and not the whole log.

**AC-3, impossible and backwards windows are 400s (green).** `tests/integration/api/sessions.test.ts:115` asserts `400 VALIDATION_ERROR` for `?from=2026-09-30&to=2026-09-01`, `?from=2026-02-31` and `?from=`. `src/app/history/page.tsx` renders `notFound()` from the same schema, so the page and the endpoint cannot disagree about what a window is.

**AC-4, the walk stays inside its window (green, and the range is also scoped to the caller).** `tests/integration/api/sessions.test.ts:87` proves `?from=2026-09-07&to=2026-09-07` contains the caller's session and excludes the foreign session on 2026-09-06, and that asking for the foreign day returns nothing. `tests/e2e/history.spec.ts:151` proves the next-page link still carries `from=2026-08-01`, `to=2026-08-21` and `cursor=`, and that page two holds the one remaining day and says "That is the whole range." `tests/e2e/history.spec.ts:96` proves the form narrows the list, states the window in the header instead of "Every session you have logged", keeps both inputs, shows "No workouts in this range." for an empty window rather than "No workouts yet", and clears back to the full log.

**Full gate, measured on this host.** `npm run typecheck` exit 0 ('✓ Types generated successfully'); `npm run lint` exit 0; `npm test` **71 files / 743 passed (743)** in 33.88 s (was 741 before this card's two new unit/integration tests); `npm run test:api` **14 files / 86 passed (86)** in 76.41 s (was 84); `history.spec.ts` **9 passed (31.9 s)**.

**Two things the gate taught, recorded so the next reader does not re-learn them.** First, Playwright strict mode: `getByRole('link', { name: 'Clear' })` matched both the form's Clear and the empty state's "clear the range", so the selector needs `{ exact: true }` — a good failure, because it is the ambiguity a screen reader would also meet. Second, a range test that asserts an upper bound must not assert a total: the `{ to: '2027-01-03' }` case returned six rows because earlier tests in the same file legitimately leave 2026-11 sessions in this user's log, so the assertion pins the bound (`every((s) => s.localDate <= '2027-01-03')`) and the first three dates rather than the row count.

**Docs.** This record; the parked #82 row in `docs/tasks/m4/README.md` became M4-38 and the board moves to `open=4 / closed=38` of 42; `docs/STATE.md` §1 and the §8 continuity log carry the change; ASSUMPTION-m4-006's Resolution Evidence now names the measurement instead of "N/A - unresolved".
