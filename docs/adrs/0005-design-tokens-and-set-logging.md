# Architectural Decision Record (ADR): Unified Design Tokens and Weight/Rep Set Logging

- **Status**: Accepted
- **Deciders**: Repository owner, Kiro
- **Date**: 2026-09-08
- **Technical Story**: `docs/specs/2026-09-08-spec-fullstack-migration.md` §4.7, §7 decisions 5 and 6

---

## Context and Problem Statement

Two decisions, recorded together because they interact through the same UI surface — the set row is both the densest visual element in the app and the place the new data is captured.

**Visual fragmentation.** The existing app ships three stylesheets of roughly 41KB each (`push-day-workout/style.css`, `pull-day-workout/style.css`, `legs-day-workout/style.css`) with mutually unrelated palettes, plus a fourth set of gradient variables on the dashboard (`--push-gradient`, `--pull-gradient`, `--legs-gradient`). One application, four visual identities, no shared token layer. The owner's stated goal for adding `DESIGN.md` was to unify this.

**Missing training data.** Set completion is currently a bare boolean — `mainWorkoutSets[setId] = true`. No weight, no reps, anywhere in any module. The consequence is that the app tells you what to lift (hardcoded in HTML: "Starting Weight: 5-10kg dumbbells OR just barbell (20kg)") and then never records what you actually did. There are no personal records, no progression, and no way to answer "am I getting stronger" — while the dashboard fabricates the appearance of exactly that, deriving streaks and volume from `new Date().getDay()` and filling durations, calories, and star ratings with `Math.random()`.

---

## Decision Drivers

- One coherent visual identity across all routes, sourced from `DESIGN.md`
- Day-type orientation (which workout am I in) is genuinely useful and should survive unification
- `DESIGN.md` constraint: primary blue reserved for interactive elements; secondary orange forbidden on primary CTAs
- WCAG: status must not be conveyed by colour alone — a finding from the code review, where completion was a `.completed` class and colour only
- "Workout history" must mean something, per spec goal G1
- Logging load must not add friction to the existing one-tap set flow

---

## Considered Options

### Visual unification
1. **Single palette, no day differentiation** — identity by icon and label only
2. **Single base palette + three scoped accent tokens**
3. **Three full themes derived from `DESIGN.md`** — a themed variant per day

### Set logging
1. **Boolean only** — faithful port of current behaviour
2. **Weight and reps required**
3. **Weight and reps optional, prefilled from the previous session**

---

## Decision Outcome

### Visual: Option 2 — one base palette, three tightly-scoped accents

All surfaces, text, borders, inputs, cards, shadows, type, and radii come from `DESIGN.md` unchanged and are byte-identical on every route. Day identity is carried by three accent tokens used **only** for the day badge and a 2px card border:

| Token | Value | Provenance |
| :--- | :--- | :--- |
| `--accent-push` | `#465fff` | `DESIGN.md` `primary` |
| `--accent-pull` | `#fb6514` | `DESIGN.md` `secondary` |
| `--accent-legs` | **unresolved** | Not available from TailAdmin — see below |

Two hard constraints:

- **Primary blue remains the CTA colour on every page**, regardless of day. `DESIGN.md`'s Don'ts explicitly forbid the secondary orange on primary CTAs, so Pull day's "Start workout" button is blue like every other day's; only its badge is orange.
- **No accent carries meaning alone.** Every day accent and every completion state pairs colour with an icon *and* a text label.

Option 3 was rejected because three themes is how the current mess happened, just with better provenance. Option 1 was close, and is the more purist answer, but per-day colour is real orientation value in an app you use while distracted and mid-exercise; keeping it scoped to a badge and a border is a reasonable middle.

**Unresolved: `--accent-legs`.** `DESIGN.md` offers no third accent that can be legitimately spent. Its `tertiary` (`#667085`) is explicitly reserved for disabled states and secondary labels, so reusing it as a day accent would collide with that semantic role and make disabled controls look like Legs day. One new hue must be added to `DESIGN.md` as a documented extension. Deliberately left open rather than invented here and passed off as TailAdmin. **Blocks M3, not M1.**

**Light mode only in v1.** `DESIGN.md` ships no dark tokens. Rather than derive a dark ramp and misattribute it, v1 is light-only. Acknowledged cost: this app is used in dim gyms at night, so dark mode is a real want, not a nicety. Every token is authored as a CSS custom property under a single `:root` from day one, so adding a `.dark` block later is additive rather than a refactor. Revisit immediately post-v1.

### Set logging: Option 3 — optional, prefilled, kilograms canonical

`session_sets` carries nullable `weight_kg numeric(6,2)` and nullable `reps integer`, alongside the existing `is_completed boolean`.

The friction problem is solved by prefill rather than by omission: opening an exercise shows the weight and reps from the last session for that exercise. Tapping the checkbox accepts them. A number is only touched when it changed. **The common case stays one tap, identical to today**, and full history falls out as a byproduct.

**Kilograms are canonical in the database**; display unit is a `profiles.preferred_unit` preference. Storing whatever unit the UI happened to be displaying is a well-known data-corruption pattern that is miserable to unpick after the fact, and impossible to unpick reliably once both units are present in the same column.

Option 2 (required) was rejected because it would break the one-tap flow the current app has, and because a warm-up set or a bodyweight exercise legitimately has no weight. Option 1 (boolean only) was rejected because it makes G1 hollow — a history of dates you ticked boxes.

### Positive Consequences

- One token layer replaces roughly 123KB of divergent CSS across three files
- Consistent identity while retaining day orientation
- Colour is never the sole carrier of state, closing a review finding
- Personal records, e1RM trendlines, and honest progression become possible — and the dashboard can show real numbers instead of `Math.random()`
- Prefill means the added capability costs zero taps in the steady state
- Nullable columns let the eventual "require weight for barbell lifts" rule arrive as a backfill plus a constraint, not a table rewrite

### Negative Consequences & Trade-Offs

- **`--accent-legs` is unresolved**, so the design system is incomplete at M1.
  - *Mitigation*: only blocks M3. Tracked in spec §7 as a carried-forward risk.
- **`DESIGN.md` will need edits** (a new accent hue, plus the ADR-0004 focus-ring note), so it stops being a pristine imported profile.
  - *Mitigation*: acceptable — a design system that cannot be extended for its actual application is not usable. Extensions are marked as such so provenance stays clear.
- **Light-only ships a known gap** into a product whose usage context argues for dark.
  - *Mitigation*: token structure makes it additive. Explicitly queued rather than forgotten.
- **Weight and reps are new scope**, not a port. It expands M2 and M3.
  - *Mitigation*: confirmed in scope by the owner. Both fields nullable, so it degrades cleanly to current behaviour if the UI work slips.
- **Prefill can propagate a mistake.** A mistyped weight becomes next session's default.
  - *Mitigation*: prefill is a suggestion, always editable, visually distinguished from a confirmed value until the set is completed. Set history is editable post-session.
- **Unit conversion introduces rounding.** Repeated kg↔lb round-trips could drift.
  - *Mitigation*: conversion happens at the display boundary only; the stored kg value is never recomputed from a converted display value.

---

## Pros and Cons of the Options

### Visual Option 1: Single palette, no day accents
- **Good**, because it is maximally consistent and needs no `DESIGN.md` extension
- **Good**, because it sidesteps colour-as-meaning entirely
- **Bad**, because it loses genuinely useful at-a-glance orientation

### Visual Option 2: Base palette + scoped accents
- **Good**, because it keeps orientation while collapsing to one identity
- **Good**, because accents are confined to badge and border, so they cannot leak into CTAs
- **Bad**, because it requires extending `DESIGN.md` with a third hue

### Visual Option 3: Three full themes
- **Good**, because day identity is unmistakable
- **Bad**, because it reproduces the current fragmentation with extra steps and triples the visual QA surface

### Logging Option 1: Boolean only
- **Good**, because it is a faithful port with zero new scope
- **Bad**, because it makes "workout history" and G1 meaningless, and leaves the dashboard nothing real to display

### Logging Option 2: Required
- **Good**, because the dataset is complete with no gaps
- **Bad**, because it breaks the one-tap flow and cannot represent bodyweight or warm-up sets

### Logging Option 3: Optional + prefilled
- **Good**, because steady-state friction is unchanged
- **Good**, because it degrades cleanly to Option 1 behaviour if a user ignores the fields
- **Bad**, because prefill can propagate a typo, and early sessions have nothing to prefill from

---

## Implementation & Migration Notes

- M1: token layer as CSS custom properties under `:root`, mapped to shadcn/ui variables; Outfit self-hosted rather than CDN-linked, since the current `legs-day-workout/style.css` `@font-face` is already blocked by its own CSP
- M1: `session_sets.weight_kg` / `reps` nullable in the initial migration, with `check` constraints bounding both to sane ranges — application validation is not a data integrity guarantee
- M1: `profiles.preferred_unit` enum, default `kg`
- M2: `ProgressionEngine` computes e1RM and detects PRs on set write, inside the same transaction
- M2: prefill query — most recent completed `session_sets` row for `(user_id, exercise_id)`
- M3: agree the `--accent-legs` hue and add it to `DESIGN.md` as a documented extension **before** building the day cards
- M3: assert in tests that no completion state is conveyed by colour alone
- M4: delete the three legacy stylesheets with the static modules

---

## Links & References

- `DESIGN.md` — Colors, Typography, Components, Do's and Don'ts
- ADR-0004 (`0004-focus-ring-contrast-override.md`) — the other recorded deviation from `DESIGN.md`
- Code review findings: `session_sets` boolean-only precedent in `push-day-workout/app.js:473`; fabricated dashboard metrics in `ppl-workout-dashboard/app.js:536-584`; colour-only completion state across all three modules
- Spec: `docs/specs/2026-09-08-spec-fullstack-migration.md` §4.7, goal G6
