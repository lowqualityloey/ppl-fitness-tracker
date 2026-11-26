> **SUPERSEDED 2026-11-26 — implemented as [M4-39](M4-39-contrast-rows-generated.md).** Kept as filed; the record of what shipped is M4-39.
>
> **M4-13** · Gate completeness · `#priority/p3` · Derived from: handoff §3.6 bullet 2 ("The contrast matrix measures **enumerated** tokens; a brand-new alias token must be added to `GATE_MATRIX` by hand (the matrix comment records which shipped aliases are deliberately absent and why). Generating rows from the `@theme inline` mapping would close the class of omission"); audit entry 14's "residual limit, named" (verified on `main`: `GATE_MATRIX` is a hand-written literal, ~25 rows → 35 measured pairs).

## Intent
As the designer who will add a token in M4 (stretch timers, analytics, the service-worker shell UI), I want a *new* alias to be measured automatically — the entry-2 hole class ("an alias nobody enumerated is invisible") is currently closed only by remembering to edit a list.

## Scope
- In `scripts/check-contrast.ts`: derive candidate pairs from `globals.css`'s `@theme inline` mapping (and the alias layer the gate already resolves via `var()` chains) instead of — or as a superset of — the hand-written `GATE_MATRIX`.
- Deliberate exclusions (the comment records them today) become a **declared allowlist with a reason per entry** in code, so an omission is a written decision, not a forgetting.
- Keep the existing behaviours that entry 14 made permanent: `var()` leaf resolution, FAIL-with-reason on unmeasurable values, both permanent negative controls.

## Out of scope
Palette changes; anything about the *values* — this card changes which pairs the gate looks at.

## Acceptance criteria
```gherkin
Scenario: A forgotten alias cannot hide
  Given a scratch-registered @theme inline alias pointing at a failing leaf (injected)
  When npx vitest run tests/unit/design/contrast.test.ts (or the script) runs
  Then the gate reports the new row FAIL without anyone editing GATE_MATRIX
  And the injection is reverted, re-measured green

Scenario: 35-pair parity
  Given the generated set
  When the gate runs on the shipped palette
  Then it measures at least every pair the hand-written matrix measured (35/35 pass preserved), with a diff of row provenance printed

Scenario: Exclusions are decisions
  When a token is allowlisted out
  Then the entry carries a machine-checked reason string — a bare removal fails the gate
```

## Automated Verification
```bash
npx tsx scripts/check-contrast.ts        # exit 0, ≥35 pairs, all pass
npx vitest run tests/unit/design/        # negative controls still fire
npm test
```

## Definition of done
The audit entry 14 sentence "a *new* alias token nobody added to the matrix is still invisible to it" is obsolete, with the injection capture to prove it.

## Dependencies
- None; schedule around M4-14 only in that the gate must stay green across legacy deletion.
