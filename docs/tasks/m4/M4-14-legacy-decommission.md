> **M4-14** · Decommission · `#priority/p1` · Derived from: handoff §3.3 ("Delete the four legacy static modules and their two fictional READMEs; drop the five `localStorage` keys … `tests/e2e/legacy-parity.spec.ts` is the guard that will **fire when you delete them** — flipping that scan is a **deliberate M4 step**, not a green-suite chore"); master RFC M4 line ("Delete the four legacy static modules, `SECURITY_IMPROVEMENTS.md`, and the two fictional module READMEs. Drop archived localStorage keys."); `docs/STATE.md` §7 item 8 (the boundary now points the other way).

## Intent
As the maintainer of one honest codebase, I want the vanilla-JS app and its documented-but-nonexistent accessories *gone*, with the parity guard **inverted rather than deleted** — so "the old app is not running here" stays a tested claim after the removal, and the import story's prose is checked before the keys go.

## What the record says
- Four legacy modules (`index.html` dashboard + `push-day-workout/`, `pull-day-workout/`, `legs-day-workout/`), untouched and measured so (`legacy-parity.spec.ts` — the scan caught its own author's bug, audit entry 3; re-executed on CI since `f37813e`).
- Five keys: `pushWorkoutProgress`, `legsWorkoutProgress`, `pullDayProgress`, `userStats`, `guest_mode`. M3 never wrote them. `userStats` and `guest_mode` have **no import path** (named in M3 planning: "the last two have no import path and are named rather than buried"); `userStats` was also *never written* by the legacy app (M2-05's inventory found it a pure fiction — dashboard streaks came from `getDay()` + `Math.random()`).
- `legacy-parity.spec.ts:95` asserts key **existence** in legacy sources — it is *built* to fire when they go (verified on `main` 2026-09-12).
- The two fictional READMEs and root `SECURITY_IMPROVEMENTS.md` document systems that were never built (PROMPTKIT §6's "earned rule" exhibits).

## Scope
1. **Data stranding decision first** (owner call, recorded before deletion): any real user's *un-imported* legacy history dies with the modules. The single-user v1 posture may be "import first, then delete, in this order" — the card cannot close while the README of the import dialog and the deletion contradict each other.
2. Delete the four module directories + the two fictional READMEs + `SECURITY_IMPROVEMENTS.md` (or rewrite it to describe what exists — the rule is prose follows reality; deletion is the RFC's word).
3. **Flip** `legacy-parity.spec.ts` from asserting-presence to asserting-absence of modules and keys (a new module reappearing is red; the old keys must not be read or written by anything).
4. Update every prose site that cites the legacy app as *running*: `PROMPTKIT.md` §2/§3 (port-3000 coexistence, the ignored-legacy lint note), `DESIGN.md`'s seed-source references, `STATE.md` §3's "Legacy files that M1 reads as input" line, the seed provenance comments.

## Out of scope
`npm run build`/`dev`/`preview` script retirement (M4-15, sequenced immediately after); `spikes/` deletion (housekeeping, not this card's law); seed data — `db/seed/` already owns the exercised content copy (M1-09/10).

## Acceptance criteria
```gherkin
Scenario: The guard survives its purpose by inverting
  Given the modules and keys deleted
  When npx playwright test legacy-parity.spec.ts
  Then it passes by asserting ABSENCE — and is watched RED when one file is temporarily restored (the deliberate flip's proof, this milestone's own rule)

Scenario: Nothing in the target stack references the dead
  When lint, typecheck, `npm test`, `test:api`, and the full battery run
  Then all are green with zero new skips — and grep shows no live import/URL to a deleted path

Scenario: The import story stays true as it changes tense
  Given the settings dialog's claims about what legacy data means
  When this card closes
  Then those claims describe the pre-deletion world in past tense or current availability accurately, and the stranding decision from step 1 is recorded in docs/STATE.md

Scenario: Prose follows reality
  When PROMPTKIT.md §2 and STATE.md §3/§5 are updated in this PR
  Then no sentence describes a running legacy app, the port-3000 coexistence, or SECURITY_IMPROVEMENTS.md as present — the "documentation describes what exists" rule applied to the removal's own diff
```

## Automated Verification
```bash
npm run db:up && npm run test:api:preflight && npm run lint && npm run typecheck && npm test && npm run test:api
fuser -k 3001/tcp; npm run next:build && npx playwright test        # battery incl. the flipped parity spec
git ls-files | grep -c "push-day-workout\|pull-day-workout\|legs-day-workout\|SECURITY_IMPROVEMENTS" # expect 0
```

## Definition of done
M3's boundary sentence ("run *beside* all of it") retires; the flipped guard is CI-executed (fetch-depth fix carries over), and every deleted-path citation in docs is rewritten in the same PR.

## Dependencies
- Blocks: M4-15. Coordinate ordering with the owner after the telemetry cards (M4-05/06) so the removal has no unobserved window.
