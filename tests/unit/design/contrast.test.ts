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
  formatResults,
  GATE_MATRIX,
  loadShippedPalette,
  parseRootTokens,
  runGate,
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
    // The gate reads :root literals; an unresolved var() reference would
    // have thrown already. Belt: every accent/focus token is a real hex.
    for (const token of ['--accent-push', '--accent-pull', '--accent-legs', '--focus-ring']) {
      expect(palette.get(token), token).toMatch(/^#[0-9a-f]{6}$/);
    }
    // And the redefinition actually happened: pull is no longer the old orange.
    expect(palette.get('--accent-pull')).not.toBe('#fb6514');
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
