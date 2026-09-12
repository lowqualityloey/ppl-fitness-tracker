> **M4-10** · Test infrastructure (D6) · `#priority/p3` · Derived from: `docs/STATE.md` §3 "Side effect to watch" / §5 D6 ("Running the API suite rewrites the tracked `tsconfig.json` … so a test run dirties the tree and a later `git add -A` can sweep in a formatter diff"), §7 item 5, and the repeated `(D6, again)` footnotes across §8 — it has fired on most slices.

## Intent
As anyone who stages a commit after running the API suite, I want `tsconfig.json` to stop being rewritten by `next dev` booting under `test:api` — the tree-dirtying has been reverted by hand for four milestones; **note (inferred): this card's existence and p3 are my judgement that a recurring hand-revert is worth 30 minutes; STATE names it as debt but sets no priority.**

## Scope
- Reproduce deterministically (the API suite's `test-server.ts` boots `next dev`), identify what Next writes (generated-types include + array reformat), and stop the churn: e.g. point the boot at an untracked tsconfig derivative, or a pre-commit-adjacent guard — whichever survives `next` upgrades.
- Update the D6 entry in `docs/tasks/2026-09-11-intake-debt-index.md` and the §3 caveat text in `STATE.md` / `PROMPTKIT.md` accordingly.

## Out of scope
Upstreaming; any change to what `next typegen` legitimately generates into `.next/`.

## Acceptance criteria
```gherkin
Scenario: The suite leaves the tree clean
  Given a clean checkout with the stack up
  When npm run test:api completes
  Then git status --porcelain shows no modification to tsconfig.json

Scenario: Typecheck still works
  When npm run typecheck runs after the API suite, from cold
  Then it exits 0 (the churn fix must not skip the step that makes LayoutProps exist)

Scenario: The fix is watched
  Given a temporary revert of the fix
  When the suite runs
  Then the churn reappears — proving the fix is load-bearing, not decorative
```

## Automated Verification
```bash
git stash list >/dev/null; npm run test:api; git diff --name-only -- tsconfig.json   # expect empty
npm run typecheck
```

## Definition of done
D6 struck from `docs/STATE.md` §5; the `(D6, again)` footnote is no longer something future checkpoint rows write.

## Dependencies
- None.
