# #73 — close `SessionStateSchema` (contract design)

Design worked out from source on `feat/m3-073-session-state-contract` (off merged `main`=`8704c19`).
Every claim below is verified by reading the files, not from memory. The card's warning that "writing
this from memory produced the wrong enums" is the failure mode; this doc exists so the schema is
written against observed reality.

## The defect
`lib/contracts/sessions.ts:81` — `export const SessionStateSchema = z.object({}).passthrough();`.
So `SessionDetailResponseSchema`/`SessionStartResponseSchema` validate the *envelope* and nothing
about the session graph, and `z.infer` is `Record<string, unknown>`.

## Three consumers (tightening hits all three — run the full battery)
1. `lib/contracts/sessions.ts:89` `SessionStartResponseSchema`
2. `lib/contracts/sessions.ts:90` `SessionDetailResponseSchema`
3. **`lib/contracts/sync.ts:84`** `SyncResponseDataSchema.state` ← the one easy to miss. A sync
   integration test that feeds a *partial* state fixture will break under a strict full-graph
   schema. Verify what `src/app/api/sync/route.ts` actually puts in `state` (it is full mapper
   output from the session engine) and that sync test payloads are complete.

## The real shape (authoritative source: `lib/domain/sessions/types.ts`, emitted by
## `lib/domain/sessions/mappers.ts:mapSessionState`)
`SessionState = SessionSummary + { routineDay, sets, tasks }`. Field-by-field, from types.ts:
- summary (already mirrored by `SessionSummarySchema` at sessions.ts:62, `.strict()`): id,
  routineDayId, clientId (Uuid), status (SessionStatusSchema), phase (SessionPhaseSchema), source
  (SessionSourceSchema), localDate (LocalDateSchema), startedAt (IsoDateTime), completedAt
  (IsoDateTime.nullable()), serverSeq (int nonneg), updatedAt (IsoDateTime).
- routineDay: { id: Uuid, slug: string, name: string, description: string|null,
  exercises: RoutineExercisePlan[] }
- RoutineExercisePlan (types.ts:22): id: Uuid, phase: enum['main_workout','stretch'], orderIndex:
  number, targetSets: number|null, targetReps: number|null, targetRepsRange: string|null,
  restTime: string|null, exercise: ExercisePlan. (These 5 target/rest fields are the ones the view
  marked `.optional()`; the mapper ALWAYS emits them, so the contract makes them required-nullable —
  that is the drift the card wants caught.)
- ExercisePlan (types.ts:8, ALL emitted by mapExercisePlan): id: Uuid, slug: string, name: string,
  muscleGroups: string[], equipment: string|null, formTips: string|null, beginnerNotes: string|null,
  videoUrl: string|null, alternatives: string[], kind: enum['strength','stretch'],
  durationSeconds: number|null.
- sets — SessionSetState (types.ts:33): id/sessionId/exerciseId Uuid, setIndex int, isCompleted bool,
  weightKg number|null (reuse WeightKgSchema.nullable() — bounds mirror the DB CHECK), reps
  int|null (RepsSchema.nullable()), clientTs Timestamp, updatedAt Timestamp.
- tasks — SessionTaskState (types.ts:45): id/sessionId Uuid, taskKey (TaskKeySchema), completedAt
  Timestamp.nullable(), clientTs Timestamp, updatedAt Timestamp.

**Reuse, never restate.** Import `SessionStatusSchema, SessionPhaseSchema, SessionSourceSchema,
TaskKeySchema, UuidSchema, LocalDateSchema, WeightKgSchema, RepsSchema` from `./common`. Do NOT
re-spell `['strength','stretch']` or `['main_workout','stretch']` — those two enums are NOT in common
yet (common has SessionPhase not RoutineExercisePhase, no ExerciseKind). Add them to **common.ts** and
reuse from BOTH sessions.ts and (optionally) the view; a hand-copied enum is the documented birth bug.

## Timestamp duality (the load-bearing decision)
`mapSessionState` returns `Date` objects; JSON serialization makes them ISO strings. The contract is
parsed on BOTH forms:
- server side: routes should `SessionStateSchema.parse(data)` before `NextResponse.json` (data has
  Dates) — this is what "a mapper that drifts fails" means concretely.
- client side: `parseSessionView(body.data)` where body came over HTTP (strings).
So define in sessions.ts (NOT in the view) the tolerant timestamp, moved verbatim from
`session-view.ts:20-26`:
```
const toIsoString = (v) => (v instanceof Date ? v.toISOString() : v);
const TimestampSchema = z.preprocess(toIsoString, IsoDateTimeSchema);
const NullableTimestampSchema = z.preprocess(toIsoString, IsoDateTimeSchema.nullable());
```
Use `TimestampSchema` for startedAt/updatedAt/clientTs, `NullableTimestampSchema` for completedAt /
task.completedAt. (This also makes `SessionSummarySchema` reusable for the list endpoint unchanged —
list responses are serialized strings, which pass the same preprocess.)

## strict()
Use `.strict()` on every object in the graph (summary already is). Rationale: the mapper output is
exactly these fields; a strict object makes "mapper emits an unknown key" fail. Confirm this does not
break the three consumers with real serialized payloads (run integration suites).

## The view (DoD: "reduces to a re-export")
`lib/views/session-view.ts` keeps `parseSessionView`/`SessionViewShapeError`/`SessionView` but
`SessionViewSetSchema` becomes a re-export of `SessionStateSchema` (import from `../../contracts/
sessions`). The runner/page/history consumers read a superset — extra fields are harmless, none are
removed, so they keep compiling. Delete the now-duplicated timestamp preprocessor from the view.
Preserve `SessionViewShapeError` naming + the "path in the message" behaviour (`names the offending
path` test) — the runner depends on the throw, not the type.

## Tests
- Expand `payload()` in `tests/unit/views/session-view.test.ts` to the FULL emitted shape (its current
  exercise has only 4 of 11 fields). It must now satisfy strict, so add every ExercisePlan/plan field.
- Move the card's required drift coverage into `tests/unit/contracts/` (or contract-graph): feed
  `SessionStateSchema` a payload with an **unknown enum value** (`status:'abandoned'`, `kind:'cardio'`,
  `phase:'warmup'`) and a **missing required field** (`delete targetSets`), assert rejection; feed the
  real mapper output (or the view fixture) and assert acceptance. Assert the existing `session-mappers`
  test's produced object passes `SessionStateSchema.safeParse().success === true` — that is the
  "mapper and contract can never drift silently" lock.
- Keep `contract-graph.test.ts` green: it forbids routes importing zod / declaring `z.object(`. Adding
  a `.parse()` call in a route is fine (no zod import; the schema comes from lib/contracts). Route
  validation must call e.g. `SessionDetailResponseSchema`/`SessionStateSchema.parse`, imported from
  the contract — never build a schema inline.

## Where routes validate (DoD: "the routes that return it validate through it")
`src/app/api/sessions/[id]/route.ts:63-65` and `src/app/api/sessions/route.ts:42` currently
`NextResponse.json(appSuccess(data))` unvalidated. Wrap: parse `appSuccess(data)` through the response
schema (or parse `data` through `SessionStateSchema`) before sending, so a drifting mapper 500s at the
boundary instead of shipping a body the client then rejects. Do it in ALL THREE producers incl. the
sync route's `state`. Keep it a thin adapter (no zod import in the route).

## Verification
`npm run lint && npm run typecheck` · `npm test` (expect unit count to grow) ·
`node --env-file-if-exists=.env.local node_modules/vitest/vitest.mjs run tests/integration/api
tests/integration/security` (sync + sessions) · `npm run test:mutation` · full Playwright once (the
session screen is the one that consumes this) · commit atomically, never stage tsconfig.json (D6).
Break it once: delete a required field from the mapper's returned object in a scratch copy, confirm
the contract test + route go red, restore — record in the audit per the standing protocol.
