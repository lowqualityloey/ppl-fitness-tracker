/**
 * M3-02 (#59) — the contrast gate spec. This is where RFC §4.4's "gate, not
 * note" becomes a control: the ratios are measured from `src/app/globals.css`
 * itself, the gate is *observed to fail* on a permanent negative control,
 * and the accent-scoping rules that a doc comment once carried (and lost)
 * are asserted structurally instead.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  contrastRatio,
  deriveMatrix,
  formatResults,
  GATE_MATRIX,
  loadShippedPalette,
  MIN_REASON,
  parseRootTokens,
  parseThemeColors,
  runGate,
  THEME_DECLARATIONS,
  validateDeclarations,
  type GateResult,
} from '../../../scripts/check-contrast';

const ROOT = join(__dirname, '..', '..', '..');
const globalsCss = readFileSync(join(ROOT, 'src/app/globals.css'), 'utf8');
const palette = loadShippedPalette();

function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

/**
 * Value-position scans use this: a token named in a comment is history being
 * explained (this file's header does exactly that, of #fb6514 and #ecf3ff);
 * a token named in *code* is a rendered value. Banning prose would make the
 * gate dumb to the deviations it exists to police, so the assertion is on
 * what ships, not what is said.
 */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('contrast math (WCAG 2.2)', () => {
  it('anchors on the project\'s own recorded measurements', () => {
    // The formula must reproduce the numbers ADR-0004/RFC §4.4 recorded —
    // including the defect value itself, which is Scenario 2's target.
    expect(contrastRatio('#fb6514', '#f9fafb')).toBe(2.88);
    expect(contrastRatio('#465fff', '#ffffff')).toBe(4.84);
    expect(contrastRatio('#7a3ff2', '#ffffff')).toBe(5.5);
    expect(contrastRatio('#000000', '#ffffff')).toBe(21);
    expect(contrastRatio('#465fff', '#465fff')).toBe(1);
  });
});

describe('shipped palette passes the gate', () => {
  const results = runGate(palette);

  it(`measures every matrix row against both card and page surfaces (${results.length} pairs)`, () => {
    expect(results.length).toBe(GATE_MATRIX.reduce((n, r) => n + r.against.length, 0));
    const failures = results.filter((r) => !r.pass);
    expect(failures, formatResults(failures as GateResult[])).toEqual([]);
  });

  it('clears each threshold with the literal shipped hex, not an alias', () => {
    // The gate reads :root values; an unresolved var() reference would have
    // been reported as unmeasurable already. Belt: every accent/focus token
    // is a real hex *at the leaf*, not an alias pointing elsewhere.
    for (const token of ['--accent-push', '--accent-pull', '--accent-legs', '--focus-ring']) {
      expect(palette.get(token), token).toMatch(/^#[0-9a-f]{6}$/);
    }
    // And the redefinition actually happened: pull is no longer the old orange.
    expect(palette.get('--accent-pull')).not.toBe('#fb6514');
  });

  it('follows var() indirection to the leaf it renders as', () => {
    // The token layer is built on aliases (M3 spec: `:root` literals, then
    // shadcn names mapped onto them). A gate that measures only leaf hexes
    // cannot see `--muted-foreground` at all — audit entry 2. Now the resolved
    // palette carries it, and its value is the leaf's value.
    expect(palette.get('--muted-foreground')).toBe('#475467');
    expect(palette.get('--background')).toBe('#f9fafb');
    expect(palette.get('--card')).toBe('#ffffff');
    expect(palette.get('--secondary')).toBe('#e4e7ec');
    // And it is measured under the alias's own name, so a re-point is visible.
    expect(GATE_MATRIX.some((r) => r.token === '--muted-foreground')).toBe(true);
  });
});

describe('the gate can fail (Scenario 2: observed red, permanently)', () => {
  it('goes red with the measured 2.88 in the message when --accent-pull regresses', () => {
    const regressed = new Map(palette);
    regressed.set('--accent-pull', '#fb6514');
    const results = runGate(regressed);
    const failures = results.filter((r) => !r.pass);
    expect(failures.length).toBeGreaterThan(0);
    expect(failures.every((r) => r.token === '--accent-pull')).toBe(true);
    const printed = formatResults(results);
    expect(printed).toContain('FAIL');
    // The exact historic number, from the gate's own computation: 2.88:1 on
    // the page surface (border bar 3.0) and 2.88 < 4.5 as badge text.
    expect(printed).toContain('2.88:1');
    expect(printed).toContain('--accent-pull');
  });

  it('goes red when an alias is re-pointed — audit entry 2, observed permanently', () => {
    // The exact shape of the hole the M3-10 audit found: `--muted-foreground`
    // re-pointed away from its leaf. The old parser never even saw the token;
    // this palette copy measures it by name, follows the value to its leaf,
    // and reports the ratio that leaf paints with.
    const repointed = parseRootTokens(
      globalsCss.replace(
        '--muted-foreground: var(--on-surface-variant);',
        '--muted-foreground: var(--outline);',
      ),
    );
    expect(repointed.get('--muted-foreground')).toBe('#d0d5dd');
    const failures = runGate(repointed).filter((r) => !r.pass);
    expect(failures.map((r) => r.token)).toContain('--muted-foreground');
    const printed = formatResults(failures);
    // 1.47:1 on the card, 1.41:1 on the page — near-white body text, both
    // computed by the gate, not quoted from here.
    expect(printed).toContain('1.47:1');
    expect(printed).toContain('1.41:1');
  });

  it('reports an unmeasurable value as a FAIL with its reason, not as a crash', () => {
    // Audit entry 1: the first parser threw at import time on a non-hex, so
    // the suite went red while telling the reader nothing. Red with a reason.
    const broken = parseRootTokens(
      globalsCss.replace(
        '--muted-foreground: var(--on-surface-variant);',
        '--muted-foreground: oklch(0.93 0.01 250);',
      ),
    );
    const failures = runGate(broken).filter((r) => !r.pass);
    const row = failures.find((r) => r.token === '--muted-foreground');
    expect(row, formatResults(failures)).toBeDefined();
    expect(row!.label).toContain('unmeasurable');
    expect(row!.pass).toBe(false);
  });
});

describe('the rows are generated from @theme inline, not enumerated (M4-39)', () => {
  it('derives one row per declared --color-* alias plus the primitive leaves', () => {
    // The old matrix was a hand-written literal: a *new* alias was invisible
    // until somebody remembered to add it. Now the stylesheet is the source.
    const colors = parseThemeColors(globalsCss);
    expect(colors.length).toBe(19);
    for (const row of GATE_MATRIX) {
      const isThemeRow = colors.some((color) => color.aliasToken === row.token);
      const isPrimitiveRow = row.source.startsWith('primitive ');
      expect(isThemeRow || isPrimitiveRow, row.label + ' (' + row.source + ')').toBe(true);
    }
  });

  it('measures a scratch-registered alias nobody declared, and goes red on it', () => {
    // The permanent control for the omission class audit entry 14 named:
    // register an alias in CSS only, touch no list here, and the gate must
    // both see it and fail it. --outline is the 1.47:1 leaf.
    const injected = globalsCss
      .replace(
        '  --ring: var(--focus-ring);',
        '  --ring: var(--focus-ring);\n  --scratch-foreground: var(--outline);',
      )
      .replace(
        '  --color-ring: var(--ring);',
        '  --color-ring: var(--ring);\n  --color-scratch-foreground: var(--scratch-foreground);',
      );
    expect(injected).not.toBe(globalsCss);

    const rows = deriveMatrix(injected);
    expect(rows.some((row) => row.token === '--scratch-foreground')).toBe(true);
    // The shipped matrix has no such row: the measurement came from the CSS.
    expect(GATE_MATRIX.some((row) => row.token === '--scratch-foreground')).toBe(false);

    const failures = runGate(parseRootTokens(injected), rows).filter((row) => !row.pass);
    expect(failures.map((row) => row.token)).toContain('--scratch-foreground');
    const printed = formatResults(failures);
    expect(printed).toContain('1.47:1');
    expect(printed).toContain('1.41:1');
    expect(printed).toContain('UNDECLARED');
  });

  it('refuses an allowlisted token that carries no machine-checked reason', () => {
    // The exclusions used to live in a comment, so deleting one was silent.
    // A declaration must say why, in at least MIN_REASON characters.
    const colors = parseThemeColors(globalsCss);
    const bare = { ...THEME_DECLARATIONS, '--ring': { kind: 'allowlist' as const, why: '' } };
    expect(() => validateDeclarations(bare, colors)).toThrow(/--ring.*machine-checked reason/);

    const terse = { ...THEME_DECLARATIONS, '--ring': { kind: 'allowlist' as const, why: 'not needed' } };
    expect(() => validateDeclarations(terse, colors)).toThrow(/at least 40 characters/);

    // And the shipped set passes its own check, with all three named exclusions.
    expect(() => validateDeclarations(THEME_DECLARATIONS, colors)).not.toThrow();
    for (const token of ['--ring', '--popover-foreground', '--accent-foreground']) {
      const declaration = THEME_DECLARATIONS[token];
      expect(declaration?.kind, token).toBe('allowlist');
      expect(declaration!.why.length, token).toBeGreaterThanOrEqual(MIN_REASON);
    }
  });

  it('refuses a declaration for a token @theme no longer registers', () => {
    const colors = parseThemeColors(globalsCss).filter((color) => color.aliasToken !== '--ring');
    expect(() => validateDeclarations(THEME_DECLARATIONS, colors)).toThrow(/Stale declaration: --ring/);
  });

  it('refuses a --color-* entry that is not a var() alias', () => {
    // A literal here would bypass the alias layer the gate resolves through,
    // and a gate that cannot resolve a token must not silently skip it.
    const broken = globalsCss.replace(
      '  --color-ring: var(--ring);',
      '  --color-ring: #000000;',
    );
    expect(() => parseThemeColors(broken)).toThrow(/must be a var\(\) alias/);
  });
});

describe('accent scoping is structural, not a promise', () => {
  it('#ecf3ff — the ≈1.1:1 DESIGN.md focus glow — appears nowhere in the app styles or components', () => {
    expect(codeOnly(globalsCss).toLowerCase()).not.toContain('#ecf3ff');
    for (const file of ['src/components/ui/button.tsx', 'src/components/ui/card.tsx', 'src/components/ui/badge.tsx']) {
      expect(codeOnly(readSrc(file)).toLowerCase(), file).not.toContain('#ecf3ff');
    }
  });

  it('the day accents have exactly one component home: badge.tsx', () => {
    // RFC §4.7: accents are the day badge and a 2px card border. The border
    // is a utility a screen applies; if a *primitive* ever grows an accent
    // variant, it must be an intentional act against this spec.
    for (const file of ['src/components/ui/button.tsx', 'src/components/ui/card.tsx']) {
      const src = readSrc(file);
      expect(src, file).not.toMatch(/--accent-(push|pull|legs|pull-bright)/);
    }
    const badge = readSrc('src/components/ui/badge.tsx');
    expect(badge).toContain('--accent-pull');
    expect(badge).toContain('--accent-legs');
  });

  it('#fb6514 survives exactly once in src/: as --accent-pull-bright (decorative only)', () => {
    const occurrences = (codeOnly(globalsCss).match(/#fb6514/gi) ?? []).length;
    expect(occurrences).toBe(1);
    expect(globalsCss).toMatch(/--accent-pull-bright:\s*#fb6514/);
  });

  it('no vendored primitive kills the ADR-0004 focus ring with outline-none/hidden', () => {
    for (const file of ['src/components/ui/button.tsx', 'src/components/ui/card.tsx', 'src/components/ui/badge.tsx']) {
      expect(readSrc(file), file).not.toMatch(/outline-(none|hidden)/);
    }
  });
});

describe('one file owns the visuals (RFC §4.7)', () => {
  it('every literal hex in globals.css sits in :root', () => {
    // Subtractive so nothing escapes: comments may name historical hexes
    // (they do), and anything outside the :root block — @theme, @layer base,
    // the reduced-motion block — must be literal-free.
    const outsideRoot = globalsCss
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/:root\s*\{[^}]*\}/, '');
    expect(outsideRoot.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [], 'literals leaked below :root').toEqual([]);
    const root = /:root\s*\{([^}]*)\}/.exec(globalsCss)![1]!;
    expect(root).toContain('--surface');
  });

  it('exactly one :root block exists (single scope, ADR-0005)', () => {
    expect((globalsCss.match(/:root\s*\{/g) ?? []).length).toBe(1);
    expect(globalsCss).not.toMatch(/\.dark\s*\{|prefers-color-scheme/);
  });

  it('parseRootTokens finds the shipped palette', () => {
    const tokens = parseRootTokens(globalsCss);
    expect(tokens.get('--surface')).toBe('#f9fafb');
    expect(tokens.get('--surface-bright')).toBe('#ffffff');
    expect(tokens.get('--accent-pull')).toBe('#c2410c');
    expect(tokens.get('--accent-legs')).toBe('#7a3ff2');
  });
});
