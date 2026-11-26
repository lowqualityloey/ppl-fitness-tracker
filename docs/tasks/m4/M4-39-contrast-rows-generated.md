> **M4-39** · Gate completeness · `#priority/p3` · Derived from: issue **#102** ("test(ui): generate the contrast matrix rows from the `@theme inline` mapping", filed from the M3 exit handoff §3.6 bullet 2); `docs/tasks/m4/M4-13-contrast-matrix-generated.md` (the parked card this record replaces); `docs/tests/2026-09-11-m3-verification-audit.md` entry 14's "residual limit, named".

## Intent

As the designer who will add a token in M4 (stretch timers, analytics, the service-worker shell UI), I want a *new* alias to be measured the moment it is registered, so that "an alias nobody enumerated is invisible" is closed by the gate itself rather than by remembering to edit a list.

## What the record says

### Decision: the rows are derived from `@theme inline`, and `GATE_MATRIX` is no longer a literal

`src/app/globals.css:115-147` holds exactly one `@theme inline` block with nineteen `--color-*` entries at `:118-136`, every one of them a plain `var(--alias)`. `scripts/check-contrast.ts:324` (`parseThemeColors`) brace-matches that block and reads those nineteen entries; `scripts/check-contrast.ts:397` (`deriveMatrix`) turns each one into measured rows. `GATE_MATRIX` at `scripts/check-contrast.ts:585` is now `deriveMatrix(readFileSync(DEFAULT_GLOBALS_PATH, 'utf8'))` - evaluated at import against the file the gate actually ships with - so the exported name the tests import still exists and still means *the matrix*. The hand-written 22-row literal that sat at `scripts/check-contrast.ts:50` is gone.

### Decision: what CSS cannot say stays a written decision, in `THEME_DECLARATIONS`

CSS says which alias maps to which leaf. It cannot say what a token renders *against*, or in which role, so that knowledge is `THEME_DECLARATIONS` (`scripts/check-contrast.ts:89`): one entry per `:root` alias, of three kinds - **pair** (measured as text 4.5:1 or non-text 3:1 on named surfaces), **surface** (a fill, measured as the backdrop of the rows that name it), **allowlist** (deliberately unmeasured, with a checked reason). Eight pair declarations produce the fourteen derived pairs; five surfaces; six allowlists.

### Decision: an undeclared alias is still measured, conservatively, and says so

`defaultRows` (`scripts/check-contrast.ts:376`) measures a `*-foreground` alias as text against its base (when the base is registered) plus `--background` and `--card`, and any other alias as non-text against `--background` and `--card`; the provenance line it stamps reads `UNDECLARED: default text rule`. This is the whole point of the card: the gate must never need a list edit to see a new token, so the fallback has to be safe rather than absent. A missing declaration is a *thinner* measurement, never a silent one.

### Decision: the exclusions are an allowlist with a machine-checked reason

`--ring`, `--popover`, `--popover-foreground`, `--accent-foreground`, `--border` and `--input` are declared `kind: 'allowlist'` with a `why` of at least `MIN_REASON` (40) characters. `validateDeclarations` (`scripts/check-contrast.ts:348`) throws when that reason is missing or too short, and separately when a declaration names a token `@theme inline` no longer registers (`Stale declaration`). Removing a row is therefore a written, reviewed decision rather than a deletion, and a declaration cannot outlive the token it describes. `formatDeclarationReport` (`scripts/check-contrast.ts:565`) prints all eleven non-measured declarations with their reasons, so the allowlist is visible in the gate's own output instead of in a comment that can rot.

### Decision: every audit-entry-14 behaviour is preserved

`parseRootTokens` (`scripts/check-contrast.ts:461`) still walks `var()` chains to the leaf with a cycle guard. An unparseable leaf is still a measured FAIL carrying `[unmeasurable: ...]` rather than an import-time crash. `runGate` still returns `GateResult[]` with `ratio` / `min` / `pass`, and `formatResults` still prints the measurement lines and the failing footers. Both permanent negative controls in `tests/unit/design/contrast.test.ts` are untouched and still fire: `--accent-pull` -> `#fb6514` at 2.88:1, and `--muted-foreground` -> `var(--outline)` at 1.47:1 on `--card` and 1.41:1 on `--background`.

## Scope (decision → implementation, one PR)

- `scripts/check-contrast.ts` — `GateRow` and `GateResult` gain `source`; new `MIN_REASON`, `Declaration`, `THEME_DECLARATIONS`, `ThemeColor`, `extractBlock`, `parseThemeColors`, `validateDeclarations`, `defaultLabel`, `defaultRows`, `deriveMatrix`, `DEFAULT_GLOBALS_PATH` and `formatDeclarationReport`; `GATE_MATRIX` becomes derived; the CLI prints the provenance and declaration reports and exits 1 on any failure. The 13 primitive rows (24 measured pairs) move verbatim into `PRIMITIVE_ROWS`, each carrying a `source` that names its RFC §4.7 or ADR-0004 role.
- `tests/unit/design/contrast.test.ts` — new describe block `the rows are generated from @theme inline, not enumerated (M4-39)` with five tests: derivation covers every alias plus the primitives; a scratch-registered alias goes red; an allowlist without a reason throws; a stale declaration throws; a non-`var()` `--color-*` throws. The pair-count assertion derives from `GATE_MATRIX` and now reads 38.

## Out of scope

- Palette changes, or anything about the *values*. This card changes which pairs the gate looks at, not what any token measures — and the answer to "which pairs" is now "the ones CSS declares".
- Measuring `--border` and `--input` at 3:1. That is a decision recorded in PR #71 and restated in each allowlist reason; reopening it here would turn a generation card into a design change.
- Reading the rendered page (axe / Lighthouse). Those layers stay what they were: they watch the end the static gate cannot see.
- Deleting `PRIMITIVE_ROWS` in favour of deriving everything. The day accents, the focus ring and the `--on-*` labels are leaves, not `--color-*` aliases; nothing in CSS records that `--accent-push` is text on a page fill. That role knowledge has to be written down somewhere, and it is the same shape of statement as `THEME_DECLARATIONS`.

## Acceptance criteria

```gherkin
Scenario: A forgotten alias cannot hide
  Given a `--color-*` alias registered in `@theme inline` that nobody declared
  And its leaf fails the ratio its role requires
  When `npx tsx scripts/check-contrast.ts` runs
  Then the gate reports a FAIL row naming that alias
  And nobody edited `GATE_MATRIX` to make that happen
  When the injection is reverted
  Then the gate measures the shipped set green again

Scenario: The shipped pairs still pass, with provenance
  Given the nineteen `--color-*` aliases and the primitive leaves
  When the gate runs
  Then at least the 35 pairs the hand-written matrix measured still pass
  And every row prints the declaration that produced it

Scenario: Exclusions are decisions, not deletions
  Given an allowlisted token
  When its reason string is removed or shortened below 40 characters
  Then the gate fails with a message naming the token and the requirement
  And the shipped allowlist, reasons included, passes
```

## Automated Verification

```bash
npm run typecheck
npm run lint
npm test
npm run test:api
npx tsx scripts/check-contrast.ts
npx vitest run tests/unit/design/
```

## Definition of done

- [x] The injection was watched **red** under the new gate and **invisible** under the old one: the same `@theme inline` edit measured `35/35 pass` with exit 0 before the change and produced two FAIL rows after it. The two captures together are the proof, not either one alone.
- [x] Reverted and re-measured green: 38/38 pairs, exit 0.
- [x] An allowlisted token with no reason fails the gate — watched, with the exact message recorded below.
- [x] All 35 pairs the hand-written matrix measured are still measured and passing; the count rose to 38 because the derived set is a superset of the alias rows.
- [x] Both permanent negative controls still fire (`--accent-pull` 2.88:1, `--muted-foreground` 1.47:1 / 1.41:1), plus the unmeasurable-value FAIL.
- [x] Audit entry 14's residual-limit sentence is replaced with the generated-rows outcome and the injection capture.

## Dependencies

None. The card is independent of every other open M4 issue. It was scheduled around M4-14 only in that the gate has to stay green across legacy deletion, which deriving the rows from `@theme inline` makes easier rather than harder: a deleted token de-registers its own row instead of leaving a stale one to be remembered.

## Outcome (2026-11-26) — DONE

**AC-1, a scratch alias is measured with no matrix edit (green, and red first).** The injection was two `:root` lines and one `@theme inline` line in `src/app/globals.css`: `--scratch-foreground: var(--outline);` after `--ring`, and `--color-scratch-foreground: var(--scratch-foreground);` after `--color-ring`. `--outline` is `#d0d5dd`, a leaf that measures 1.47:1 on `--card` and 1.41:1 on white. Under the **old** gate the same tree printed `35/35 measured pairs pass.` and exited 0 — the omission class, reproduced on demand. Under the new gate the same tree exited 1 with `2 of 40 measured pairs FAIL:` and the rows `FAIL  scratch foreground (generated)   --scratch-foreground on --background: 1.41:1 (min 4.5:1)` and `FAIL  scratch foreground (generated)   --scratch-foreground on --card: 1.47:1 (min 4.5:1)`, the footers `x scratch foreground (generated): --scratch-foreground vs --background measures 1.41:1, needs 4.5:1`, and the provenance line `scratch foreground (generated)   <-  theme --color-scratch-foreground -> --scratch-foreground (UNDECLARED: default text rule)`. Nobody touched `GATE_MATRIX`; the row came from the CSS. Reverted (`cp` from a pre-edit copy; `git diff --stat src/app/globals.css` empty) and re-measured: `38/38 measured pairs pass.`, exit 0.

**AC-2, the shipped pairs still pass with provenance (green).** 38 pairs, up from 35. The eleven alias pairs the literal carried became fourteen. Three rows are new — `--foreground` on `--card` (17.75:1), on `--muted` (16.11:1) and on `--accent` (14.32:1), the hover fills `text-foreground` actually paints over — and the literal's `primary as link text` row, which named the `--surface` / `--surface-bright` leaves directly, is now written as `--primary` on `--background` and `--card`: the same two leaves under the alias names that `globals.css:93` and `:95` resolve them to. Nothing the hand-written matrix measured was dropped, checked rather than asserted: both matrices were resolved through `loadShippedPalette` to leaf hex and compared, 17 distinct leaf pairs before against 18 after, **zero lost** and one gained, `#101828` on `#f2f4f7` (`--foreground` over `--muted`). The 24 primitive pairs are unchanged: six day-accent text rows at min 4.5, the same six as border rows at min 3.0, the focus ring on both surfaces, and the `--on-*` / `--error` / `--tertiary` text rows. Every row prints `Row provenance (label <- the declaration that produced it):` — alias rows as `body text (alias)  <-  theme --color-foreground -> --foreground`, primitive rows as `focus ring  <-  primitive --focus-ring (ADR-0004 focus outline)`. The gate also prints `Declared, not measured (each entry carries a machine-checked reason):` with all eleven surface and allowlist entries and their reasons.

**AC-3, an allowlisted token without a reason fails the gate (green, red first).** Stripping the `why` from the `--ring` allowlist entry exited 1 with `Error: Declaration for --ring carries no machine-checked reason: every allowlist entry needs a why string of at least 40 characters saying what was deliberately left unmeasured. Found "".` A short reason (`"not needed"`) fails the same check on the character count. Restored: exit 0. Both the empty and the too-short case are permanent assertions in the new describe block, together with the stale-declaration and non-`var()` cases.

**The tests pin the class, not the instance.** `tests/unit/design/contrast.test.ts` grew from 14 to 19 tests. The five new ones assert that every `GATE_MATRIX` row is either a declared theme alias or a `primitive`-sourced row and that `parseThemeColors` finds exactly 19 aliases; that a scratch-registered alias nobody declared is seen by `deriveMatrix` while `GATE_MATRIX` (derived at import, before the edit) does not contain it, and that the failure prints 1.47:1 / 1.41:1 / `UNDECLARED`; that an allowlist entry with an empty or short reason throws, while the shipped set does not and all three named exclusions are `kind: 'allowlist'` with `why.length >= MIN_REASON`; that a declaration for a de-registered token throws `Stale declaration: --ring`; and that a `--color-*` entry which is not a `var()` alias throws rather than being silently skipped.

**Full gate, measured on this host.** `npm run typecheck` exit 0 (`Types generated successfully`); `npm run lint` exit 0; `npm test` 71 files / 748 passed in 33.77 s; `npm run test:api` 14 files / 86 passed in 80.41 s; `npx tsx scripts/check-contrast.ts` 38/38 pairs, exit 0; `npx vitest run tests/unit/design/` 19 tests passed.

**What the change taught.** Deriving the rows is only half the job: CSS knows the *mapping*, and the audit hole was never really about the mapping — it was that "what does this token render against" had no owner. Making that an exported, validated data structure with a minimum reason length turned a comment into something the compiler and the gate both check. The fallback rule matters more than the derivation: a gate that measured only declared tokens would have re-created the same hole one level up, so an undeclared alias is measured conservatively and labelled `UNDECLARED` — visible as an under-declaration rather than absent. And the honest cost: three pairs appeared that the hand-written matrix never measured, which is a reminder that the literal was not just tedious, it was incomplete.

**Docs.** `docs/tasks/m4/README.md` — the M4-13 row became M4-39 with its outcome, the parked-list paragraph gained the #102 sentence (the board reading stays `open=4 / closed=38` until #102 closes, then moves to `open=3 / closed=39`), and the dependency map and Wave 3 item 14 record the card as landed. `docs/STATE.md` — §1 milestone reading, the `Last Updated` clause, the open-card list (now #16 / #84 / #107), the stale §2 M4 bullet reconciled to the same reading, and a new §8 continuity row. `docs/tests/2026-09-11-m3-verification-audit.md` entry 14 — the "residual limit, named" paragraph replaced with the generated-rows outcome and both captures.
