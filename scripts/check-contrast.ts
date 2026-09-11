/**
 * M3-02 (#59): the contrast gate — RFC §4.4's "gate, not note."
 *
 * This script is the single computation of WCAG 2.2 ratios in the repo.
 * It reads the shipped token values **out of `src/app/globals.css`**, so the
 * thing being measured is the thing that renders: a hex can no longer be
 * "fixed" in one place and rot in another. `tests/unit/design/contrast.test.ts`
 * runs it over the shipped palette, and — as a permanent negative control —
 * over an injected palette with `--accent-pull` reverted to its old value,
 * asserting the gate goes red with the measured ratio in the message. A
 * control that has never been observed to fail is not a control.
 *
 * Usage:  npx tsx scripts/check-contrast.ts   (exit 1 on any failure)
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface GateRow {
  /** what is being measured, e.g. '--accent-pull as badge text' */
  label: string;
  /** token name whose value is read from :root */
  token: string;
  role: 'text' | 'non-text';
  /** surfaces this token actually renders against, by token name or literal */
  against: string[];
}

export interface GateResult {
  label: string;
  token: string;
  surface: string;
  ratio: number;
  min: number;
  pass: boolean;
}

export const TEXT_MIN = 4.5;
export const NON_TEXT_MIN = 3.0;

/**
 * The matrix enumerates every token with a sanctioned rendering surface in
 * the foundation (accents per RFC §4.7, focus per ADR-0004, and the text
 * pairs the vendored primitives paint). Deliberately absent: `--outline`
 * (1px decorative form/card edging — WCAG 1.4.11 requires 3:1 only for
 * boundaries required to identify a component, and these are identified by
 * label, fill, and context; the decision and its measured ratios live in
 * PR #71's description, not in a comment that can rot).
 */
export const GATE_MATRIX: GateRow[] = [
  // Day accents as badge text on the surfaces a badge can sit on (card/page).
  { label: 'day accent (Push)', token: '--accent-push', role: 'text', against: ['--surface-bright', '--surface'] },
  { label: 'day accent (Pull)', token: '--accent-pull', role: 'text', against: ['--surface-bright', '--surface'] },
  { label: 'day accent (Legs)', token: '--accent-legs', role: 'text', against: ['--surface-bright', '--surface'] },
  // Day accents as the 2px card border — non-text identification of a
  // component boundary, so the 3:1 bar.
  { label: 'day accent border (Push)', token: '--accent-push', role: 'non-text', against: ['--surface-bright', '--surface'] },
  { label: 'day accent border (Pull)', token: '--accent-pull', role: 'non-text', against: ['--surface-bright', '--surface'] },
  { label: 'day accent border (Legs)', token: '--accent-legs', role: 'non-text', against: ['--surface-bright', '--surface'] },
  // ADR-0004 focus indicator: the ring is the only affordance for keyboard
  // focus, so it is exactly what SC 1.4.11 protects.
  { label: 'focus ring', token: '--focus-ring', role: 'non-text', against: ['--surface-bright', '--surface'] },
  // Text pairs the primitives ship today.
  { label: 'CTA label on primary', token: '--on-primary', role: 'text', against: ['--primary'] },
  { label: 'destructive label on error', token: '--on-error', role: 'text', against: ['--error'] },
  { label: 'error text', token: '--error', role: 'text', against: ['--surface-bright', '--surface'] },
  { label: 'primary as link text', token: '--primary', role: 'text', against: ['--surface-bright', '--surface'] },
  { label: 'body text', token: '--on-surface', role: 'text', against: ['--surface-bright', '--surface'] },
  { label: 'muted text', token: '--on-surface-variant', role: 'text', against: ['--surface-bright', '--surface'] },
  { label: 'secondary-label text (tertiary)', token: '--tertiary', role: 'text', against: ['--surface-bright', '--surface'] },
];

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Not a #rrggbb hex: ${JSON.stringify(hex)}`);
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG 2.2 relative luminance. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** WCAG 2.2 contrast ratio, rounded to two decimals — the printed unit. */
export function contrastRatio(a: string, b: string): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** Extract literal hex values declared in the `:root` block of a CSS file. */
export function parseRootTokens(css: string): Map<string, string> {
  const root = /:root\s*\{([^}]*)\}/.exec(css);
  if (!root) throw new Error('No :root block found — the gate reads shipped values, so it must find them.');
  const tokens = new Map<string, string>();
  for (const m of root[1]!.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    tokens.set(m[1]!, m[2]!.toLowerCase());
  }
  return tokens;
}

export function loadShippedPalette(globalsPath = join(process.cwd(), 'src/app/globals.css')): Map<string, string> {
  return parseRootTokens(readFileSync(globalsPath, 'utf8'));
}

/** Resolve a surface name (token or literal) to a hex against the palette. */
function resolveSurface(name: string, palette: Map<string, string>): string {
  if (name.startsWith('#')) return name.toLowerCase();
  const value = palette.get(name);
  if (!value) throw new Error(`Gate references unknown token ${name}`);
  return value;
}

export function runGate(palette: Map<string, string>): GateResult[] {
  const results: GateResult[] = [];
  for (const row of GATE_MATRIX) {
    const fg = palette.get(row.token);
    if (!fg) throw new Error(`Gate references unknown token ${row.token}`);
    for (const surface of row.against) {
      const bg = resolveSurface(surface, palette);
      const ratio = contrastRatio(fg, bg);
      const min = row.role === 'text' ? TEXT_MIN : NON_TEXT_MIN;
      results.push({ label: row.label, token: row.token, surface, ratio, min, pass: ratio >= min });
    }
  }
  return results;
}

export function formatResults(results: GateResult[]): string {
  const width = Math.max(...results.map((r) => r.label.length));
  const lines = results.map((r) =>
    `  ${r.pass ? 'PASS' : 'FAIL'}  ${r.label.padEnd(width)}  ${r.token} on ${r.surface}: ` +
    `${r.ratio.toFixed(2)}:1 (min ${r.min.toFixed(1)}:1)`);
  const failures = results.filter((r) => !r.pass);
  lines.push('');
  lines.push(failures.length === 0
    ? `${results.length}/${results.length} measured pairs pass.`
    : `${failures.length} of ${results.length} measured pairs FAIL:`);
  for (const f of failures) {
    lines.push(`  ✗ ${f.label}: ${f.token} vs ${f.surface} measures ${f.ratio.toFixed(2)}:1, needs ${f.min.toFixed(1)}:1`);
  }
  return lines.join('\n');
}

// CLI entry: print every measured ratio (the card asks the run to print them),
// exit 1 if any fails.
if (process.argv[1] && process.argv[1].endsWith('check-contrast.ts')) {
  const results = runGate(loadShippedPalette());
  console.log(formatResults(results));
  process.exit(results.every((r) => r.pass) ? 0 : 1);
}
