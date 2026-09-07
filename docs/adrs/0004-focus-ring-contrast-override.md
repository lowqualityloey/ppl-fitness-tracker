# Architectural Decision Record (ADR): Override the DESIGN.md Focus Ring for WCAG 2.2 Contrast

- **Status**: Accepted
- **Deciders**: Repository owner, Kiro
- **Date**: 2026-09-08
- **Technical Story**: `docs/specs/2026-09-08-spec-fullstack-migration.md` §4.7, §7 decision 4

---

## Context and Problem Statement

`DESIGN.md` (the TailAdmin profile) specifies the focus indicator twice, consistently:

> "On focus, a 3px outline in primary-container (#ecf3ff) is applied."
> "Do include a 3px outline in primary-container (#ecf3ff) on all focused interactive elements to ensure keyboard accessibility."

The stated intent is accessibility. The specified value defeats it. `#ecf3ff` against the card background `surface-bright #ffffff` computes to roughly **1.1:1**. WCAG 2.2 SC 1.4.11 (Non-text Contrast) requires **3:1** for visual indicators of component state, including focus. At 1.1:1 the ring is essentially invisible on white, so a keyboard user tabbing through the session runner cannot tell where they are.

This matters more here than on a typical dashboard. The code review of the existing app found that phase navigation is built from `<div>` elements with click handlers, no `role`, no `tabindex`, and no key handler — the current app is not keyboard-operable at all. Keyboard support is being introduced from zero in this rebuild, and shipping it with an invisible focus ring would functionally undo the work.

There is also a direct conflict to resolve: `PROMPTKIT.md` lists WCAG 2.2 AA compliance with visible focus rings as a non-negotiable guardrail, while `DESIGN.md` specifies a value that fails it. One of the two documents has to lose.

---

## Decision Drivers

- `PROMPTKIT.md` non-negotiable: "All interactive elements must support keyboard navigation, visible focus rings"
- Spec goal G8: keyboard-completable session flow, Lighthouse a11y 100 on primary routes
- Preserve `DESIGN.md`'s visual intent — a light, unobtrusive ring, not a heavy browser default
- Deviations from the design system must be recorded, not silently applied

---

## Considered Options

1. **Implement `DESIGN.md` as written** — 3px `#ecf3ff`
2. **Ring in `primary #465fff`** at reduced width, with a white offset
3. **Keep the browser default focus ring** and drop custom focus styling entirely
4. **Darken `primary-container`** in `DESIGN.md` until it passes, changing the token globally

---

## Decision Outcome

**Chosen Option: Option 2.** A **2px ring in `primary` (`#465fff`) plus a 2px white offset**, applied to every interactive element on focus.

Measured contrast of `#465fff` against `#ffffff` is approximately **4.8:1** — comfortably past the 3:1 requirement, with headroom for the `surface #f9fafb` page background too. Dropping from 3px to 2px and adding the white offset keeps the total visual footprint close to the original 3px specification, so the design intent survives while the ring becomes actually visible.

Using `primary` for focus is also consistent with `DESIGN.md`'s own colour philosophy, which reserves the blue exclusively for interactive elements and explicitly names focus indicators as one of its sanctioned uses. The design file is internally inconsistent: its colour section assigns focus to `primary`, its component section assigns focus to `primary-container`. This decision resolves that inconsistency in favour of the accessible reading.

Option 4 was rejected because `primary-container` is used correctly elsewhere as a background fill for secondary buttons and badges, where a pale tint is exactly right. Darkening the token globally to fix one usage would break several others.

Option 3 was rejected because browser default rings are inconsistent across engines and would clash with the rounded-corner token system.

### Positive Consequences

- Focus is visibly perceivable on both `surface-bright` and `surface` backgrounds
- SC 1.4.11 satisfied, keeping spec goal G8 and the `PROMPTKIT.md` guardrail achievable
- Resolves an internal contradiction in `DESIGN.md` rather than inheriting it
- Single token `--ring`, consumed by shadcn/ui's existing focus utilities, so it is defined once and applies everywhere

### Negative Consequences & Trade-Offs

- The implementation deliberately diverges from `DESIGN.md`, so anyone comparing the two will find a mismatch.
  - *Mitigation*: this ADR, plus a note added directly into `DESIGN.md` pointing at it, so the deviation is discoverable from either document.
- The ring is visually louder than the original pale-blue intent.
  - *Mitigation*: 2px rather than 3px, with a white offset separating it from the component edge. Accepted as the correct trade: a ring nobody can see has no design value.
- Focus ring styling is applied via `:focus-visible`, not `:focus`, so mouse users do not see it. That is intended, but it does mean the ring is easy to forget to test.
  - *Mitigation*: keyboard-navigation assertions in the M3 Playwright suite, not left to manual checking.

---

## Pros and Cons of the Options

### Option 1: `DESIGN.md` as written (3px `#ecf3ff`)
- **Good**, because it needs no deviation record and matches the design file literally
- **Bad**, because at ~1.1:1 on white it fails SC 1.4.11 and is effectively invisible
- **Bad**, because it contradicts the stated purpose of the rule that specifies it

### Option 2: 2px `primary` + white offset
- **Good**, because ~4.8:1 clears the requirement with margin
- **Good**, because it matches `DESIGN.md`'s own "primary is for interactive elements including focus" principle
- **Good**, because it preserves the original visual weight
- **Bad**, because it is a recorded deviation from the design file

### Option 3: Browser defaults
- **Good**, because it is free and generally accessible
- **Bad**, because it is inconsistent across engines and visually foreign to the token system

### Option 4: Darken `primary-container` globally
- **Good**, because it keeps `DESIGN.md` internally literal
- **Bad**, because `primary-container` is correctly pale in its other roles (secondary button fill, badge background); darkening it breaks those

---

## Implementation & Migration Notes

- M1: define `--ring: #465fff` in the token layer alongside the rest of the `DESIGN.md` palette
- M3: `:focus-visible` → 2px ring + 2px offset, wired through the shadcn/ui `ring` utilities so it applies without per-component work
- M3: add a short note to `DESIGN.md` recording the override and linking here
- M3: Playwright assertions that every interactive element in the session flow is reachable and shows a visible ring
- Verification is measured contrast, not eyeballing — the 3:1 threshold is checkable and should be checked

---

## Links & References

- WCAG 2.2 SC 1.4.11 Non-text Contrast (3:1 for state indicators)
- `DESIGN.md` — Components → Action Elements, and the Do's list
- `PROMPTKIT.md` §6 — WCAG 2.2 AA guardrail
- Code review finding: `push-day-workout/index.html:36-52` — phase navigation as unfocusable `<div>`s, zero `aria-*` attributes in the file
- Spec: `docs/specs/2026-09-08-spec-fullstack-migration.md` §4.7
