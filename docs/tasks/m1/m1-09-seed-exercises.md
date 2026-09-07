### Metadata
- **Related Spec**: `docs/specs/2026-09-08-spec-fullstack-migration.md` §2 (G3), §4.1
- **Architectural Decision (ADR)**: none directly — informed by legacy data audit
- **Milestone**: M1: Contracts & Seams
- **Priority**: `#priority/p1` (Core, not a blocker — spike-independent, per `docs/STATE.md` §7)
- **Labels**: `area:data`
- **Depends on**: M1-03 (schema only — does not require RLS or auth)

---

## User Story & Context

**As a** user of the target app
**I want** the 18 exercises currently hardcoded across three separate legacy files (`push-day-workout/index.html`, `legs-day-workout/index.html`, `pull-day-workout/app.js`) available as system-seeded `exercises` rows attached to the correct `routine_days`
**So that** adding or editing an exercise becomes a data change, not a four-site JS/HTML edit — this is spec goal **G3** verbatim.

Source data locations, confirmed by direct file inspection:
- **Push day** (6 exercises, `push-day-workout/index.html:261-608`): Bench Press, Dumbbell Overhead Press, Chest Press Machine, Lateral Raises, Cable Tricep Pushdowns, Push-ups
- **Legs day** (6 exercises, `legs-day-workout/index.html:256-615`): Goblet Squats, Leg Press, Romanian Deadlifts, Leg Curls, Leg Extensions, Calf Raises
- **Pull day** (6 exercises, `pull-day-workout/app.js:45-180`, structured JS objects — the only module with real data arrays): Lat Pulldown, Seated Cable Row, Single-Arm Dumbbell Row, Face Pulls, Bicep Curls, Hammer Curls

No exercise appears on more than one day — all 18 are day-specific, one row + one `routine_exercises` association each.

---

## Technical Scope & Invariants

### Files & Endpoints Touched
- **Database Tables / Migrations**: `db/seed/exercises.ts` (or equivalent), executed against `exercises`, `routine_days`, `routine_exercises`
- Read-only source references: `push-day-workout/index.html`, `legs-day-workout/index.html`, `pull-day-workout/app.js` — do not modify these; the legacy app keeps running unmodified until M4

### Non-Negotiable Invariants
- [ ] All 18 seeded rows have `owner_user_id IS NULL` (system rows, per M1-05's policy design)
- [ ] Seed script is **idempotent** — re-running it must not create duplicates (`ON CONFLICT (slug) DO UPDATE` or equivalent, using `exercises.slug` as the natural key per spec §4.1)
- [ ] Field mapping is explicit and lossless where the source has the data: pull-day's structured fields (`equipment`, `alternatives`, `formTips` via `beginnerNotes`) map directly to the `exercises` schema; push/legs' freeform HTML text (muscle groups, implied equipment from `exercise-location` text) is parsed and normalized, and any field the HTML simply doesn't have (pull-day-only `alternatives`) is left `NULL`/empty array for push/legs rows rather than fabricated
- [ ] `reps` stays a text range (e.g. `"8-10"`) across all three sources — this is the format all three already use, so no lossy int conversion
- [ ] Each exercise is linked to exactly one `routine_days` row via `routine_exercises`, with `orderIndex` preserving the order it appears in the legacy source

### Out of Scope
- Stretches (M1-10 — separate because two of them are cross-day duplicates and need a different resolution)
- Any UI for editing exercises (M3)
- Video URLs — carry over the YouTube video IDs found in the legacy source only if trivially available; do not spend time re-sourcing missing ones for this task
- Warm-up drills (e.g. push-day's Arm Circles, legs-day's Leg Swings) — these are structurally similar to exercises but are a distinct legacy concept and not part of the "18 exercises" count; leave them out of this seed and note them as a follow-up if the app needs them later

### Design decision this task must make explicit
- push-day/legs-day give rest as a **range** ("60-90s rest"), pull-day gives an **exact integer** (`restTime: 90`). Decide once, in this task, whether the schema stores a range (text) or a single value (int, requiring push/legs to pick a point estimate), and document the choice in the seed script's comments rather than silently picking one per row.

---

## Implementation Tasks
- [ ] 1. Write a parser for `pull-day-workout/app.js`'s `this.exercises` array (structured JS, straightforward to extract)
- [ ] 2. Write a parser (or manually transcribe, given the small fixed count) for the 6 push-day exercises from `push-day-workout/index.html:261-608`
- [ ] 3. Write a parser (or manually transcribe) for the 6 legs-day exercises from `legs-day-workout/index.html:256-615`
- [ ] 4. Resolve the rest-time range-vs-integer question (see Design decision above) and apply it consistently across all 18 rows
- [ ] 5. Create the three `routine_days` rows (push/pull/legs) if not already seeded by M1-03
- [ ] 6. Write the idempotent seed script inserting 18 `exercises` rows + 18 `routine_exercises` join rows, preserving legacy order via `orderIndex`
- [ ] 7. Run the seed against the local stack and manually spot-check 3 rows (one per day) against their legacy source for field accuracy

---

## Acceptance Criteria

### Scenario 1: Happy path — all 18 exercises seeded correctly
- **Given** a fresh database with the M1-03 schema applied
- **When** the seed script runs
- **Then** `SELECT count(*) FROM exercises WHERE owner_user_id IS NULL` returns 18, and each row's `name` matches one of the 18 legacy exercise names listed above verbatim

### Scenario 2: Day association is correct
- **Given** the seed has run
- **When** querying `routine_exercises` joined to `routine_days` for the "push" day
- **Then** exactly the 6 push-day exercises are returned, in their legacy display order (`orderIndex` ascending)

### Scenario 3: Idempotency
- **Given** the seed has already run once
- **When** it is run a second time
- **Then** `exercises` still contains exactly 18 rows (no duplicates), and existing rows are updated in place rather than errored on a unique-constraint violation

### Scenario 4: No fabricated data
- **Given** push/legs exercises lack an explicit `equipment` field in the legacy HTML
- **When** the seed inserts those rows
- **Then** `equipment` is `NULL` for those rows rather than a guessed value — reviewers should be able to diff each seeded row against its legacy source and find no invented fields

---

## Automated Verification Command
```bash
npx tsx db/seed/exercises.ts && npx vitest run tests/integration/seed-exercises.test.ts
```
