# feat(m3): settings with display-unit switch, and the legacy import dialog that reports what it lost

### Metadata
- **Local Task**: `M3-09`
- **Related Spec**: `docs/specs/2026-09-11-spec-m3-presentation.md` §5.4, §3.2 (`UnitDisplay`), §2.1 G-M3-7
- **Architectural Decisions**: ADR-0005, ADR-0003
- **Milestone**: `M3: Presentation`
- **Priority**: `#priority/p1`
- **Labels**: `area:ui`, `area:data`, `type:feature`
- **Kanban Status**: `To Do`
- **Depends on**: M3-00 (profile + unit endpoints), M3-05 (import is an online-only action by design)

## User Story & Context
**As a** user with two years of workouts in this browser's `localStorage`
**I want** to import them and be told exactly what could not be recovered
**So that** adopting the new app does not quietly rewrite my history — and as a user who trains in pounds, I want one setting that changes every weight on screen and nowhere in storage

## Technical Scope & Invariants
### Files and seams
- `src/app/settings/page.tsx` + a client dialog for import
- `src/app/state/unit-display.ts` (format/parse, canonical kg)
- Calls `POST /api/import/legacy` (M2-05) and `GET`/`PATCH /api/profile` (M3-00)

### Non-negotiable invariants
- [ ] **The import report is shown in full, including `fieldsNotRecovered`.** A dialog saying only "Import successful" is the failure mode: pull-day data is lossy by construction and legacy sessions were never recorded with weight or reps.
- [ ] Import is **online-only and idempotent by source fingerprint** — the server already replays a repeat instead of double-archiving (M2-05). Re-running must not create a second batch of sessions.
- [ ] The import reads only the three known legacy slots; other keys are **never** written, and any extra key is reported as ignored.
- [ ] `UnitDisplay` is the only place a kg↔lb conversion exists. Storage, wire, and outbox payloads are canonical kg always (RFC §8.1): switching units while a queue is pending must not convert anything.
- [ ] Rounding is defined so a display conversion can never manufacture a new personal record.
- [ ] Unit preference is read server-side for RSC renders so the first paint is in the user's unit; the server default is kg, and that is stated rather than assumed.
- [ ] No legacy `localStorage` key is deleted here — decommissioning is M4's, and a user who imports and then returns to the old app must find it intact.
- [ ] CSRF posture verified for both mutations (RFC §5.1): same-origin, JSON body, cookie credential.

### Out of scope
- Body-measurement / `userStats` import — **no contract models it** (RFC §5.4); the settings screen states that plainly instead of leaving the impression import covers everything.
- Deleting legacy keys or modules (M4). Multi-device import coordination.

## Implementation Tasks
- [ ] 1. `UnitDisplay` with rounding tests first: 1 kg must not round-trip into a different PR, and lb input must parse locale decimal separators.
- [ ] 2. Settings screen: unit radio group (real inputs, not divs), sign-out affordance wired to `POST /auth/signout` (M2-06), and a note that signing out ends every device.
- [ ] 3. Import dialog: read slots in the browser, POST, render planned/malformed/absent/ignored outcomes, date-confidence warnings, and the collapsed-`""`-key warning the importer already emits.
- [ ] 4. E2E with a seeded `localStorage` fixture: import → archive rows appear → dialog lists the three never-captured fields → second run replays without duplicating.

## Acceptance Criteria
### Scenario 1: Happy path
- **Given** a browser holding the three legacy slots with two archived sessions
- **When** the user imports
- **Then** the dialog reports sessions created, sets recovered, low date confidence, and the fields that legacy never captured, and the history route shows the archived sessions

### Scenario 2: Negative
- **Given** malformed JSON in one slot
- **Then** that slot is reported `malformed` with a path-only description (no value disclosure), the good slots still import, and nothing is silently dropped

### Scenario 3: Boundary
- **Given** the same import run twice
- **Then** the second is a replay returning the stored report, with no new sessions; and **given** the user switches kg→lb with 3 mutations queued
- **Then** the drained payload is byte-identical to what it would have been, because the queue stored kg

## Automated Verification
```bash
node --env-file-if-exists=.env.local node_modules/vitest/vitest.mjs run tests/unit/state/unit-display tests/integration/api/import-legacy.test.ts
npx playwright test tests/e2e/settings.spec.ts tests/e2e/import.spec.ts
```
