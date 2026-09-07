### Metadata
- **Related Spec**: `docs/specs/2026-09-08-spec-fullstack-migration.md` §2 (G3), §4.1
- **Architectural Decision (ADR)**: none directly
- **Milestone**: M1: Contracts & Seams
- **Priority**: `#priority/p2` (Enhancement — spike-independent, and lower priority than exercises since stretches are cooldown content, not the core tracked activity)
- **Labels**: `area:data`
- **Depends on**: M1-03 (schema only)

---

## User Story & Context

**As a** user completing the cooldown phase of a workout
**I want** the stretch content currently duplicated across three legacy files available as seeded rows, with genuinely shared stretches represented once
**So that** the cooldown checklist is real data, and editing "Cat-Cow Stretch" once updates it everywhere it's used instead of drifting across copies — the same G3 rationale as M1-09, applied to stretches.

**This task exists separately from M1-09 because the count is not simply additive.** Direct inspection of all three legacy sources found:
- Push day: 5 stretches (`push-day-workout/index.html:627-800`)
- Legs day: 5 stretches (`legs-day-workout/index.html:621-774`), all unique to legs
- Pull day: 5 stretches (`pull-day-workout/app.js:183-224`)
- **"Child's Pose"** appears on both push day (`index.html:737-768`) and pull day (`app.js:208-215`) — same 45s duration, same instructions, minor tip-text wording difference
- **"Cat-Cow Stretch"** appears on both push day (`index.html:769-800`) and pull day (`app.js:216-223`) — fully identical: same instructions, same tips, same duration, same YouTube video ID

That's 15 raw entries but **13 unique stretch concepts**. `docs/STATE.md` says "15 stretches" assuming a raw count; this task makes an explicit decision rather than silently picking one.

---

## Technical Scope & Invariants

### Files & Endpoints Touched
- **Database Tables / Migrations**: `db/seed/stretches.ts`, executed against `exercises` (stretches are modeled as a category of exercise, or a separate table if M1-03 defined one — confirm which before starting) and `routine_exercises`/equivalent join
- Read-only source references: same three legacy files as M1-09

### Non-Negotiable Invariants
- [ ] **Decision required before implementation**: seed 13 unique stretch rows, each associated with one or two `routine_days` via the join table (a stretch used on both push and pull gets two join rows, one row of content) — **not** 15 rows with 2 duplicated. This keeps a future edit to "Cat-Cow Stretch" from drifting into two independently-editable copies, which is the exact problem G3 exists to solve
- [ ] All seeded rows have `owner_user_id IS NULL`
- [ ] Idempotent seed, same pattern as M1-09 (`ON CONFLICT` on a slug or name-based natural key)
- [ ] Where push-day and pull-day's copies of the same stretch differ slightly (Child's Pose's tip-text wording), pick one canonical version and note in a code comment which source it was taken from and what was dropped — don't silently merge without a record

### Out of Scope
- Exercises (M1-09)
- Any UI (M3)
- Reconciling why push-day's video ID for Child's Pose coincidentally matches a video used elsewhere in legs-day's *warm-up* section — that's unrelated media reuse, not a stretch duplicate, and needs no action here

---

## Implementation Tasks
- [ ] 1. Confirm with M1-03's actual schema whether stretches live in the `exercises` table (e.g. a `kind` discriminator column) or a separate table — this issue assumes the former unless M1-03 decided otherwise; update this task's file references if it didn't
- [ ] 2. Extract all 15 raw stretch entries from the three legacy sources (5 push, 5 legs, 5 pull)
- [ ] 3. Identify and deduplicate the 2 cross-day duplicates (Child's Pose, Cat-Cow Stretch), producing 13 unique rows
- [ ] 4. For each of the 2 duplicates, record which source's wording was kept, as a code comment
- [ ] 5. Write the idempotent seed script: 13 stretch rows, with join-table rows connecting Child's Pose and Cat-Cow Stretch to *both* push and pull days, and the other 11 to their single respective day
- [ ] 6. Run the seed and verify row/join counts match this design

---

## Acceptance Criteria

### Scenario 1: Happy path — correct unique count
- **Given** a fresh database with the seed applied
- **When** querying seeded stretch rows
- **Then** exactly 13 unique rows exist, not 15

### Scenario 2: Shared stretches are joined, not duplicated
- **Given** the seed has run
- **When** querying which days "Cat-Cow Stretch" belongs to
- **Then** it returns both push and pull (per the source audit above; legs-day's 5 stretches are all distinct), via two join-table rows pointing at one content row

### Scenario 3: Legs-day stretches are unaffected
- **Given** all 5 legs-day stretches are unique to legs-day
- **When** querying legs-day's stretch associations
- **Then** exactly 5 rows are returned, none shared with push or pull

### Scenario 4: Idempotency
- **Given** the seed has already run
- **When** it runs again
- **Then** row and join counts remain unchanged (13 unique rows, correct join counts), no duplicate insertion

---

## Automated Verification Command
```bash
npx tsx db/seed/stretches.ts && npx vitest run tests/integration/seed-stretches.test.ts
```
