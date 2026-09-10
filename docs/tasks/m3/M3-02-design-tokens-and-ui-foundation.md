# feat(m3): install the UI foundation and make the token palette contrast-safe

### Metadata
- **Local Task**: `M3-02`
- **Related Spec**: `docs/specs/2026-09-11-spec-m3-presentation.md` §4.4, §8.4; master RFC §4.7
- **Architectural Decisions**: ADR-0004 (focus ring override), ADR-0005 (one palette, light-only)
- **Milestone**: `M3: Presentation`
- **Priority**: `#priority/p0` — blocks every screen
- **Labels**: `area:ui`, `area:infra`, `type:feature`
- **Kanban Status**: `To Do`
- **Depends on**: nothing (parallel with M3-00/M3-01)

## User Story & Context
**As a** user who trained in a dim gym and needs to see what is focused
**I want** one token set with every interactive colour verified against the surface it renders on
**So that** the app stops shipping specified colours that fail the standard the project also specifies

Three legacy stylesheets of ~41 KB each with unrelated palettes become one `:root` token set. The repo has
**no Tailwind, shadcn, Radix, or data layer installed** today — dependencies are supabase/drizzle/pg/next/
react/zod only — so this slice installs them, and no product screen may be built before it lands.

## Technical Scope & Invariants
### Files and seams
- `DESIGN.md` (two documented extensions), `src/app/globals.css`, `tailwind` config, `components.json`, `src/components/ui/**` (vendored shadcn)
- New: `scripts/check-contrast.ts` + a Vitest spec asserting measured ratios
- Fonts: Outfit self-hosted via `next/font` — no third-party font CDN

### Non-negotiable invariants
- [ ] `--accent-legs` = **`#7a3ff2`** (measured 5.50:1 on `#ffffff`, 5.26:1 on `#f9fafb`), added to `DESIGN.md` as a documented extension. `tertiary #667085` stays reserved for disabled/secondary labels and is **not** reused as a day accent.
- [ ] `--accent-pull` is **redefined** to a value measuring ≥ 3:1 on `#f9fafb` and ≥ 4.5:1 for badge text; the old `#fb6514` becomes **`--accent-pull-bright`, decorative only** — never a border, badge text, or focus target (RFC §8.4).
- [ ] Focus ring: 2px `#465fff` + 2px offset (ADR-0004). `#ecf3ff` re-measures 1.12:1 and must not appear anywhere.
- [ ] **Gate, not note:** the contrast spec enumerates every token used for a border, focus indicator, or badge and asserts its measured ratio against the surface it renders on. A finding recorded only as a comment became a defect again within five months.
- [ ] Accents are used **only** for the day badge and a 2px card border; primary blue remains the CTA on every page; no state is carried by colour alone (icon + text label required, verified by axe).
- [ ] Light-only, but every token under a single `:root` scope so a later `.dark` block is additive (ADR-0005).
- [ ] Record the first-load JS/CSS baseline for `/` in the PR. The SLA table fixes no bundle number, so we measure one instead of inventing a target.

### Out of scope
- Dark mode. Any product screen. Playwright wiring (M3-03).

## Implementation Tasks
- [ ] 1. `npm i` Tailwind v4 + shadcn prerequisites; `components.json`; verify `npx --no-install next build` still passes.
- [ ] 2. Author the token layer in `globals.css`; wire Outfit.
- [ ] 3. Write `scripts/check-contrast.ts` (WCAG relative luminance) and the spec that fails if any token regresses; run it against **both** `#ffffff` and `#f9fafb`.
- [ ] 4. Amend `DESIGN.md` with legs violet and the pull redefinition, each with its measured ratios.

## Acceptance Criteria
### Scenario 1: Happy path
- **Given** the token layer
- **When** the contrast gate runs
- **Then** every non-text token clears 3:1 on the surface it is used on, every badge text token clears 4.5:1, and the run prints measured ratios

### Scenario 2: Negative — the gate must be able to fail
- **Given** `--accent-pull` temporarily reverted to `#fb6514`
- **When** the gate runs
- **Then** it **fails with the measured 2.88:1 in the message** (a control that has never been observed to fail is not a control)

### Scenario 3: Boundary
- **Given** a component that wants an accent for a CTA or a background
- **Then** lint or review blocks it: accents are badge-and-border only, per §4.7

## Automated Verification
```bash
npm run lint && npm run typecheck && npm run next:build
node --env-file-if-exists=.env.local node_modules/vitest/vitest.mjs run tests/unit/design/
```
