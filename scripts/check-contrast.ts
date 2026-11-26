/**
 * Contrast gate — RFC §4.4, "a gate, not a note".
 *
 * Every number in DESIGN.md is re-measured here against the values that
 * actually ship in src/app/globals.css, so a quoted number cannot go stale.
 *
 * ## Where the rows come from
 *
 * The measured pairs are DERIVED, not enumerated. deriveMatrix() reads the
 * @theme inline block — the nineteen --color-* aliases Tailwind exposes — and
 * resolves each one through the :root alias layer to the leaf hex it renders
 * as. A brand-new --color-* alias is therefore measured the moment it is
 * registered, with nobody editing a list here. That closes the class of
 * omission the M3-10 audit recorded as entry 14's residual limit ("a *new*
 * alias token nobody added to the matrix is still invisible to it").
 *
 * What CSS cannot say is what a token renders *against*, and in which role.
 * That knowledge lives in THEME_DECLARATIONS: one written decision per alias,
 * of three kinds —
 *
 *   - pair       measured as text (4.5:1) or non-text (3:1) on named surfaces
 *   - surface    a fill, measured as the backdrop of the rows that name it
 *   - allowlist  deliberately not measured, and the reason why is checked
 *
 * A declaration whose "why" is missing or too short fails the gate, and so does
 * a declaration for a token that no longer exists in @theme inline. Removing a
 * row is a written, reviewed decision rather than a deletion.
 *
 * An alias with no declaration is still measured: it falls back to a
 * conservative default rule and its provenance line says UNDECLARED.
 *
 * Primitive tokens (the day accents, the focus ring, the --on-* labels) are not
 * --color-* aliases — they are the leaves those aliases resolve to — so their
 * RFC §4.7 role knowledge stays declared in PRIMITIVE_ROWS.
 *
 * ## The control
 *
 * tests/unit/design/contrast.test.ts keeps a permanent negative control: it
 * re-points --accent-pull at the pre-redefinition #fb6514 and requires the gate
 * to go red at 2.88:1, plus the alias re-pointing and the unmeasurable-value
 * cases from audit entry 14. A control that has never been observed to fail is
 * not a control.
 *
 * Usage:  npx tsx scripts/check-contrast.ts   (exit 1 on any failure)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface GateRow {
  label: string;
  token: string;
  role: 'text' | 'non-text';
  against: string[];
  /** Where this row came from, printed so a measurement traces to its decision. */
  source: string;
}

export interface GateResult {
  label: string;
  token: string;
  surface: string;
  ratio: number;
  min: number;
  pass: boolean;
  /** Provenance carried through from the row that produced this measurement. */
  source: string;
}

export const TEXT_MIN = 4.5;
export const NON_TEXT_MIN = 3.0;

/** Shortest acceptable "why" — long enough to be a reason, not a restatement. */
export const MIN_REASON = 40;

export type Declaration =
  | { kind: 'pair'; label: string; role: 'text' | 'non-text'; against: string[]; why: string }
  | { kind: 'surface'; why: string }
  | { kind: 'allowlist'; why: string };

/**
 * One written decision per shipped --color-* alias, keyed by the :root alias the
 * @theme inline entry points at.
 *
 * The allowlist entries are the exclusions that used to live only in a comment.
 * They are load-bearing: validateDeclarations() requires a reason on every one,
 * and rejects a declaration whose token is no longer registered.
 */
export const THEME_DECLARATIONS: Record<string, Declaration> = {
  '--background': {
    kind: 'surface',
    why: 'Page fill. Measured as the backdrop of every text row that names it; it never paints as a foreground.',
  },
  '--foreground': {
    kind: 'pair',
    label: 'body text (alias)',
    role: 'text',
    against: ['--background', '--card', '--muted', '--accent'],
    why: 'text-foreground renders on bg-background and bg-card, and over the bg-muted and bg-accent hover fills of the outline and ghost buttons.',
  },
  '--card': {
    kind: 'surface',
    why: 'Card fill. Measured as the backdrop of card text, muted text, link text, error text and destructive text.',
  },
  '--card-foreground': {
    kind: 'pair',
    label: 'card text (alias)',
    role: 'text',
    against: ['--card'],
    why: 'text-card-foreground is the only foreground Card paints, so the card fill is its only sanctioned surface.',
  },
  '--popover': {
    kind: 'allowlist',
    why: 'No vendored primitive renders a popover surface; --popover resolves to the same white leaf as --card, so the card rows already cover text over it.',
  },
  '--popover-foreground': {
    kind: 'allowlist',
    why: 'No vendored primitive consumes text-popover-foreground: the dropdown, menu and command primitives are not installed. Record a row when one is.',
  },
  '--primary': {
    kind: 'pair',
    label: 'primary as link text (alias)',
    role: 'text',
    against: ['--background', '--card'],
    why: 'Primary is link text (button variant="link") and the push badge label, both of which render on page and card fills.',
  },
  '--primary-foreground': {
    kind: 'pair',
    label: 'CTA label (alias)',
    role: 'text',
    against: ['--primary'],
    why: 'Label on the default button and the default badge, whose only fill is --primary.',
  },
  '--secondary': {
    kind: 'surface',
    why: 'Secondary button and secondary badge fill. Measured as the backdrop of the secondary-foreground row.',
  },
  '--secondary-foreground': {
    kind: 'pair',
    label: 'secondary badge text (alias)',
    role: 'text',
    against: ['--secondary'],
    why: 'Label on the secondary button and secondary badge, whose only fill is --secondary.',
  },
  '--muted': {
    kind: 'surface',
    why: 'Hover fill for the outline and ghost buttons. Measured as a backdrop by the --foreground row, which names it.',
  },
  '--muted-foreground': {
    kind: 'pair',
    label: 'muted text (alias)',
    role: 'text',
    against: ['--card', '--background'],
    why: 'Muted copy on cards and pages. This is the token whose re-pointing slipped past the leaf-only gate in the M3-10 audit (entry 2).',
  },
  '--accent': {
    kind: 'surface',
    why: 'shadcn hover fill for menu items. No vendored primitive paints it yet, and the --foreground row measures text over it so it cannot drift unseen.',
  },
  '--accent-foreground': {
    kind: 'allowlist',
    why: 'No vendored primitive consumes text-accent-foreground: the menu and dropdown primitives that would are not installed. Record a row when one is.',
  },
  '--destructive': {
    kind: 'pair',
    label: 'destructive text (alias)',
    role: 'text',
    against: ['--background', '--card'],
    why: 'Destructive renders as text (the runner error line) as well as a fill, so its own legibility on page and card is measured.',
  },
  '--destructive-foreground': {
    kind: 'pair',
    label: 'destructive label (alias)',
    role: 'text',
    against: ['--destructive'],
    why: 'Label on the destructive button and destructive badge, whose only fill is --destructive.',
  },
  '--border': {
    kind: 'allowlist',
    why: '1px decorative card and input edging. WCAG 1.4.11 asks 3:1 only of a boundary required to identify a component; these are identified by label, fill and context. Decision and measured ratios live in PR #71.',
  },
  '--input': {
    kind: 'allowlist',
    why: 'The same 1px decorative edging as --border; both resolve to --outline. An input is identified by its label and placeholder, not by its outline.',
  },
  '--ring': {
    kind: 'allowlist',
    why: 'ADR-0004 renders focus as the global :focus-visible outline on --focus-ring, which the focus-ring primitive row measures at 2px. Nothing consumes ring-* utilities.',
  },
};

/**
 * Tokens that are not --color-* aliases: the leaves the aliases resolve to, and
 * the RFC §4.7 roles CSS cannot express.
 */
const PRIMITIVE_ROWS: GateRow[] = [
  {
    label: 'day accent (Push)',
    token: '--accent-push',
    role: 'text',
    against: ['--surface-bright', '--surface'],
    source: 'primitive --accent-push (RFC §4.7 day accent, text)',
  },
  {
    label: 'day accent (Pull)',
    token: '--accent-pull',
    role: 'text',
    against: ['--surface-bright', '--surface'],
    source: 'primitive --accent-pull (RFC §4.7 day accent, text)',
  },
  {
    label: 'day accent (Legs)',
    token: '--accent-legs',
    role: 'text',
    against: ['--surface-bright', '--surface'],
    source: 'primitive --accent-legs (RFC §4.7 day accent, text)',
  },
  {
    label: 'day accent border (Push)',
    token: '--accent-push',
    role: 'non-text',
    against: ['--surface-bright', '--surface'],
    source: 'primitive --accent-push (RFC §4.7 day accent, border)',
  },
  {
    label: 'day accent border (Pull)',
    token: '--accent-pull',
    role: 'non-text',
    against: ['--surface-bright', '--surface'],
    source: 'primitive --accent-pull (RFC §4.7 day accent, border)',
  },
  {
    label: 'day accent border (Legs)',
    token: '--accent-legs',
    role: 'non-text',
    against: ['--surface-bright', '--surface'],
    source: 'primitive --accent-legs (RFC §4.7 day accent, border)',
  },
  {
    label: 'focus ring',
    token: '--focus-ring',
    role: 'non-text',
    against: ['--surface-bright', '--surface'],
    source: 'primitive --focus-ring (ADR-0004 focus outline)',
  },
  {
    label: 'CTA label on primary',
    token: '--on-primary',
    role: 'text',
    against: ['--primary'],
    source: 'primitive --on-primary (label on the primary fill)',
  },
  {
    label: 'destructive label on error',
    token: '--on-error',
    role: 'text',
    against: ['--error'],
    source: 'primitive --on-error (label on the error fill)',
  },
  {
    label: 'error text',
    token: '--error',
    role: 'text',
    against: ['--surface-bright', '--surface'],
    source: 'primitive --error (error copy on page and card)',
  },
  {
    label: 'body text',
    token: '--on-surface',
    role: 'text',
    against: ['--surface-bright', '--surface'],
    source: 'primitive --on-surface (body copy on page and card)',
  },
  {
    label: 'muted text',
    token: '--on-surface-variant',
    role: 'text',
    against: ['--surface-bright', '--surface'],
    source: 'primitive --on-surface-variant (muted copy on page and card)',
  },
  {
    label: 'secondary-label text (tertiary)',
    token: '--tertiary',
    role: 'text',
    against: ['--surface-bright', '--surface'],
    source: 'primitive --tertiary (secondary labels on page and card)',
  },
];

export interface ThemeColor {
  /** The Tailwind token, e.g. --color-muted-foreground. */
  themeToken: string;
  /** The :root alias it points at, e.g. --muted-foreground. */
  aliasToken: string;
}

/** Slice out the body of a top-level at-rule by brace matching. */
function extractBlock(css: string, atRule: string): string {
  const escaped = atRule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const opener = new RegExp(escaped + '\\s*\\{').exec(css);
  if (!opener) {
    throw new Error('No ' + atRule + ' block found — the gate derives its rows from it, so it must find it.');
  }
  const open = opener.index + opener[0].length - 1;
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    const ch = css[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error('Unterminated ' + atRule + ' block.');
}

/**
 * Read the --color-* aliases out of the @theme inline block.
 *
 * Each one must be a plain var(--alias); anything else means the gate cannot
 * resolve it to a measured leaf, and a gate that silently skips a token is the
 * hole this function exists to close.
 */
export function parseThemeColors(css: string): ThemeColor[] {
  const block = extractBlock(css, '@theme inline');
  const colors: ThemeColor[] = [];
  for (const match of block.matchAll(/(--color-[\w-]+)\s*:\s*([^;]+);/g)) {
    const themeToken = match[1]!;
    const value = match[2]!.trim();
    const alias = /^var\(\s*(--[\w-]+)\s*\)$/.exec(value);
    if (!alias) {
      throw new Error(
        '@theme inline ' + themeToken + ' must be a var() alias so the gate can resolve it to a measured leaf; found ' + JSON.stringify(value) + '.',
      );
    }
    colors.push({ themeToken, aliasToken: alias[1]! });
  }
  if (colors.length === 0) {
    throw new Error('No --color-* aliases found in @theme inline — the gate derives its rows from them.');
  }
  return colors;
}

/**
 * Check every declaration: a reason on each, no declaration for a token that is
 * no longer registered, and at least one surface on each pair row.
 */
export function validateDeclarations(
  declarations: Record<string, Declaration>,
  themeColors: ThemeColor[],
): void {
  const registered = new Set(themeColors.map((color) => color.aliasToken));
  for (const [token, declaration] of Object.entries(declarations)) {
    if (!registered.has(token)) {
      throw new Error(
        'Stale declaration: ' + token + ' is declared but no @theme inline --color-* alias maps to it. Remove the declaration or restore the alias.',
      );
    }
    const why = declaration.why.trim();
    if (why.length < MIN_REASON) {
      throw new Error(
        'Declaration for ' + token + ' carries no machine-checked reason: every ' + declaration.kind + ' entry needs a why string of at least ' + MIN_REASON + ' characters saying what was deliberately left unmeasured. Found ' + JSON.stringify(declaration.why) + '.',
      );
    }
    if (declaration.kind === 'pair' && declaration.against.length === 0) {
      throw new Error('Declaration for ' + token + ' is a pair row with no against surfaces.');
    }
  }
}

function defaultLabel(aliasToken: string): string {
  return aliasToken.replace(/^--/, '').replace(/-/g, ' ') + ' (generated)';
}

/** The conservative rule for an alias nobody declared: measure it, loudly. */
function defaultRows(themeToken: string, aliasToken: string, registered: Set<string>): GateRow[] {
  const isForeground = aliasToken.endsWith('-foreground');
  const base = aliasToken.slice(0, -'-foreground'.length);
  const against = isForeground && registered.has(base)
    ? [base, '--background', '--card']
    : ['--background', '--card'];
  return [
    {
      label: defaultLabel(aliasToken),
      token: aliasToken,
      role: isForeground ? 'text' : 'non-text',
      against,
      source: 'theme ' + themeToken + ' -> ' + aliasToken + ' (UNDECLARED: default ' + (isForeground ? 'text' : 'non-text') + ' rule)',
    },
  ];
}

/**
 * Build the measured matrix from the stylesheet: derived theme rows first, then
 * the declared primitive rows, so the printout reads alias layer then leaf layer.
 */
export function deriveMatrix(css: string): GateRow[] {
  const themeColors = parseThemeColors(css);
  validateDeclarations(THEME_DECLARATIONS, themeColors);
  const registered = new Set(themeColors.map((color) => color.aliasToken));
  const rows: GateRow[] = [];
  for (const { themeToken, aliasToken } of themeColors) {
    const declaration = THEME_DECLARATIONS[aliasToken];
    if (!declaration) {
      rows.push(...defaultRows(themeToken, aliasToken, registered));
      continue;
    }
    if (declaration.kind !== 'pair') continue;
    rows.push({
      label: declaration.label,
      token: aliasToken,
      role: declaration.role,
      against: declaration.against,
      source: 'theme ' + themeToken + ' -> ' + aliasToken,
    });
  }
  return [...rows, ...PRIMITIVE_ROWS];
}

export function hexToRgb(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) throw new Error('Not a #rrggbb hex: ' + JSON.stringify(hex));
  const value = Number.parseInt(match[1]!, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  const channel = (raw: number): number => {
    const c = raw / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

function parseRootDeclarations(css: string): Map<string, string> {
  const match = /:root\s*\{([^}]*)\}/.exec(css);
  if (!match) {
    throw new Error('No :root block found — the gate reads shipped values, so it must find them.');
  }
  const raw = new Map<string, string>();
  for (const declaration of match[1]!.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    raw.set(declaration[1]!, declaration[2]!.trim());
  }
  return raw;
}

/**
 * Resolve every :root token to the leaf value it renders as, following var()
 * chains (audit entry 14: the gate must measure the alias a primitive consumes,
 * not only the primitive it points at).
 */
export function parseRootTokens(css: string): Map<string, string> {
  const raw = parseRootDeclarations(css);
  const resolved = new Map<string, string>();

  const walk = (name: string, seen: Set<string>): string | undefined => {
    const value = raw.get(name);
    if (value === undefined) return undefined;
    const alias = /^var\(\s*(--[\w-]+)\s*\)$/.exec(value);
    if (!alias) return value.toLowerCase();
    const target = alias[1]!;
    if (seen.has(target)) return undefined;
    seen.add(target);
    return walk(target, seen);
  };

  for (const [name, declared] of raw) {
    resolved.set(name, walk(name, new Set([name])) ?? declared.toLowerCase());
  }
  return resolved;
}

/** The shipped stylesheet, located from this file so the cwd cannot mislead it. */
export const DEFAULT_GLOBALS_PATH = fileURLToPath(new URL('../src/app/globals.css', import.meta.url));

export function loadShippedPalette(globalsPath = DEFAULT_GLOBALS_PATH): Map<string, string> {
  return parseRootTokens(readFileSync(globalsPath, 'utf8'));
}

function resolveSurface(name: string, palette: Map<string, string>): string {
  if (name.startsWith('#')) return name.toLowerCase();
  const value = palette.get(name);
  if (!value) throw new Error('Gate references unknown token ' + name);
  return value;
}

const HEX_ONLY = /^#[0-9a-f]{6}$/;

export function runGate(palette: Map<string, string>, matrix: GateRow[] = GATE_MATRIX): GateResult[] {
  const results: GateResult[] = [];
  for (const row of matrix) {
    const fg = palette.get(row.token);
    if (!fg) throw new Error('Gate references unknown token ' + row.token);
    for (const surface of row.against) {
      const bg = resolveSurface(surface, palette);
      const min = row.role === 'text' ? TEXT_MIN : NON_TEXT_MIN;
      if (!HEX_ONLY.test(fg) || !HEX_ONLY.test(bg)) {
        results.push({
          label: row.label + ' [unmeasurable: ' + (!HEX_ONLY.test(fg) ? fg : bg) + ']',
          token: row.token,
          surface,
          ratio: 0,
          min,
          pass: false,
          source: row.source,
        });
        continue;
      }
      const ratio = contrastRatio(fg, bg);
      results.push({
        label: row.label,
        token: row.token,
        surface,
        ratio,
        min,
        pass: ratio >= min,
        source: row.source,
      });
    }
  }
  return results;
}

export function formatResults(results: GateResult[]): string {
  const width = results.reduce((widest, result) => Math.max(widest, result.label.length), 0);
  const lines = results.map(
    (result) =>
      '  ' + (result.pass ? 'PASS' : 'FAIL') + '  ' + result.label.padEnd(width) + '  ' + result.token +
      ' on ' + result.surface + ': ' + result.ratio.toFixed(2) + ':1 (min ' + result.min.toFixed(1) + ':1)',
  );
  const failures = results.filter((result) => !result.pass);
  lines.push('');
  if (failures.length === 0) {
    lines.push(results.length + '/' + results.length + ' measured pairs pass.');
  } else {
    lines.push(failures.length + ' of ' + results.length + ' measured pairs FAIL:');
    for (const failure of failures) {
      lines.push(
        '  x ' + failure.label + ': ' + failure.token + ' vs ' + failure.surface + ' measures ' +
          failure.ratio.toFixed(2) + ':1, needs ' + failure.min.toFixed(1) + ':1',
      );
    }
  }
  lines.push('');
  lines.push('Row provenance (label <- the declaration that produced it):');
  for (const result of results) {
    lines.push('  ' + result.label.padEnd(width) + '  <-  ' + result.source);
  }
  return lines.join('\n');
}

/**
 * Print the declarations that produced no measurement, with their reasons — the
 * allowlist is only trustworthy if a reader can see what it says.
 */
export function formatDeclarationReport(css: string): string {
  const themeColors = parseThemeColors(css);
  const measured = new Set(deriveMatrix(css).map((row) => row.token));
  const lines = ['Declared, not measured (each entry carries a machine-checked reason):'];
  let shown = 0;
  for (const { themeToken, aliasToken } of themeColors) {
    if (measured.has(aliasToken)) continue;
    const declaration = THEME_DECLARATIONS[aliasToken];
    if (!declaration || declaration.kind === 'pair') continue;
    lines.push('  ' + aliasToken + '  (' + themeToken + ')  ' + declaration.kind + ' — ' + declaration.why);
    shown += 1;
  }
  if (shown === 0) lines.push('  (none)');
  return lines.join('\n');
}

/**
 * The shipped matrix: derived from the shipped stylesheet at import time, so a
 * newly registered alias is measured without anyone touching this file.
 */
export const GATE_MATRIX: GateRow[] = deriveMatrix(readFileSync(DEFAULT_GLOBALS_PATH, 'utf8'));

if (process.argv[1] && process.argv[1].endsWith('check-contrast.ts')) {
  const results = runGate(loadShippedPalette());
  console.log(formatResults(results));
  console.log('');
  console.log(formatDeclarationReport(readFileSync(DEFAULT_GLOBALS_PATH, 'utf8')));
  process.exit(results.every((result) => result.pass) ? 0 : 1);
}
