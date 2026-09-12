> **M4-12** · Gate completeness · `#priority/p2` · Derived from: handoff §3.6 bullet 1 and §3.4/§5 ("Lighthouse scores a zero-width-space accessible name as a *name* (audit entry 11, first injection — measured 100). A 'renders as nothing' name is invisible to this gate; axe did not catch it either. … it needs a structural check (e.g., the a11y.spec DOM scan extended to reject name-only-ZWSP)"); audit entry 11 (the honest non-observation: the injection **passed** both gates).

## Intent
As a keyboard/screen-reader user, I want "a control whose name renders as nothing" to be impossible to merge — both present gates score it 100/green (proven by injection), so only a structural check closes the class.

## Scope
- Extend the existing DOM scan in `tests/e2e/a11y.spec.ts` (the route registry that already enforces focus/h1/interactive-route rules): for every focusable element, compute the effective accessible name from its text content + `aria-label`(+`aria-labelledby` resolution), strip **all zero-width and whitespace codepoints** (U+200B/U+200C/U+200D/U+FEFF/…), and fail if what remains is empty.
- Apply across the audited routes (`/sign-in`, `/`, `/history`, `/session/[id]`), matching the existing per-route registry rather than a new spec file.

## Out of scope
Re-litigating Lighthouse/axe (they stay; this is the layer they cannot see); icon-only-button policy (those carry real `aria-label`s; the check must accept them — asserted, not assumed).

## Acceptance criteria
```gherkin
Scenario: The injection that fooled entry 11 now fails
  Given a scratch edit replacing the "Today" link's text with U+200B on /history
  When npx playwright test a11y.spec.ts
  Then this new structural check goes RED naming the element and route
  And the injection is reverted with the restored build green (STATE §4 item 16: exercised failure mode)

Scenario: Legitimate names survive
  Given the shipped app as merged
  When the battery runs
  Then the check is green on all four routes — including icon-only controls with real aria-labels

Scenario: The zero-width family is enumerated, not guessed
  When the stripper is unit-tested
  Then U+200B, U+200C, U+200D, U+FEFF, and plain whitespace are each rejected as sole content — a table-driven control that fails if a codepoint is dropped from the list
```

## Automated Verification
```bash
npx playwright test a11y.spec.ts                 # green on merged main
# + the captured injection red (entry 11's exact ZWSP case) in the PR description
```

## Definition of done
The class is *structurally* unmergeable, with the red capture of the entry-11 injection — the file that recorded the hole records the close.

## Dependencies
- None (independent of decommission; must stay green across M4-14's deletions).
