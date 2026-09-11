/**
 * `UnitDisplay` (M3-09, #66) — the client-facing rules for showing and accepting a weight.
 *
 * **This module contains no kg↔lb conversion factor, on purpose.**
 *
 * The card says `UnitDisplay` is "the only place a kg↔lb conversion exists". That place is already
 * `lib/domain/units.ts`: it holds `KG_PER_LB`, and the server imports it (the progress route converts
 * through it) as well as the client. Writing a second converter here would have created exactly the
 * thing the invariant forbids — two constants, one of which is stale the day someone retunes
 * rounding. So this file is a **façade over** that module and owns the two things it does not:
 *
 * 1. **Display precision** — how many decimals a weight is painted with, and what re-entering that
 *    painted value means for a stored record.
 * 2. **Locale-tolerant parsing** — what a human typing into a weight field may legitimately produce.
 *
 * A test scans this file for the conversion factor, because that is the only way the rule survives
 * someone "just moving the conversion in here" during a later slice.
 */

import { MAX_WEIGHT_KG, kgToDisplay, parseWeightToKg } from '../../../lib/domain/units';
import type { PreferredUnit } from '../../../lib/contracts/profile';

/** One decimal place on screen, which is also the smallest plate most gyms own. */
export const DISPLAY_DECIMALS = 1;

/**
 * Half a percent of a kilogram, or 5 g, whichever is larger.
 *
 * The tolerance exists because kg→lb→kg cannot be exact in binary floating point at two stored
 * decimals. It is deliberately far below any difference that would decide a personal record: the
 * smallest loading change in the wild is 0.5 kg and the display resolves 0.1, so a real new record
 * is always outside this band and a rounding artefact is always inside it.
 */
export const STORAGE_TOLERANCE_KG = 0.005;

/** Re-exported so a client input can bound itself without importing ADR-0005 wholesale. */
export const MAX_WEIGHT_KG_DISPLAY = MAX_WEIGHT_KG;

/**
 * The weight as it should be painted, without a unit suffix.
 *
 * Suffix is separate because the runner puts the unit in a label and the number in an input, and a
 * pre-suffixed value would have to be string-mangled apart later — the kind of small wrongness that
 * becomes a parse bug in the next slice.
 */
export function formatForDisplay(weightKg: number, unit: PreferredUnit): string {
  const fixed = kgToDisplay(weightKg, unit).toFixed(DISPLAY_DECIMALS);
  const trimmed = fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
  // A value that rounds to zero at display precision must not be painted as `0`: the same glyph is
  // what an empty field looks like here, so "the app lost my weight" and "I have not typed anything"
  // would be indistinguishable. One display step up is the honest floor.
  return trimmed === '' || trimmed === '0' ? String(1 / 10 ** DISPLAY_DECIMALS) : trimmed;
}

/** The unit's label, spelled the way the app spells it everywhere (display only, ADR-0005). */
export function unitSuffix(unit: PreferredUnit): string {
  return unit === 'kg' ? 'kg' : 'lb';
}

export interface ParsedWeight {
  readonly kg: number | null;
  /**
   * True when the text was genuinely ambiguous and this function chose one reading.
   *
   * `1.234` is a thousands group in de-DE and a decimal point in en-US. There is no locale-free
   * answer, so the choice is made from the shape of the text — a single separator followed by
   * exactly three digits reads as grouping — and **reported** rather than hidden. A caller that
   * confirms the value on screen can show `1234` beside it and let the athlete catch the other
   * reading; a caller that silently guessed would lose a set with no explanation.
   */
  readonly assumedGrouping: boolean;
}

const DIGITS_AND_SEPARATORS = /^[0-9]+(?:[.,][0-9]*)*[.,]?[0-9]*$/;

/**
 * Parse what a person typed into the canonical kilograms the wire and storage require (RFC §8.1).
 *
 * Accepts `12.5`, `12,5`, `1.234,56`, `1,234.56`, and a bare thousands group. Rejects — as `null`,
 * which the field renders as "not a number" rather than as zero — anything with several separators
 * that does not group in threes (`12,5,5`), non-numerics, negatives, and values past the domain's
 * ceiling.
 *
 * The domain's own `parseWeightToKg` replaces the *first* comma with a dot, which handles `12,5` and
 * silently returns `null` for the grouped forms: a valid entry that reads as a rejection, on the one
 * field where a rejection loses someone's set. The range and rounding rules stay where they are.
 */
export function parseForInput(text: string, unit: PreferredUnit): ParsedWeight {
  const trimmed = text.trim();
  if (trimmed === '' || !DIGITS_AND_SEPARATORS.test(trimmed)) {
    return { kg: null, assumedGrouping: false };
  }

  const lastSeparator = Math.max(trimmed.lastIndexOf('.'), trimmed.lastIndexOf(','));
  if (lastSeparator < 0) return { kg: parseWeightToKg(trimmed, unit), assumedGrouping: false };

  const fraction = trimmed.slice(lastSeparator + 1);
  const head = trimmed.slice(0, lastSeparator);
  const headHasSeparator = /[.,]/.test(head);
  const separators = [...trimmed].filter((ch) => ch === '.' || ch === ',');

  // With more than one separator, everything before the last is a thousands mark and must actually
  // group in threes. `1.234,56` and `1,234.56` are both well-formed; `12,5,5` is somebody's typo and
  // is rejected rather than read as 125.5, because guessing here silently changes a set's load.
  if (headHasSeparator && !groupsInThrees(head)) {
    return { kg: null, assumedGrouping: false };
  }

  const grouping = headHasSeparator || (separators.length === 1 && fraction.length === 3);

  if (grouping && headHasSeparator) {
    // `1,234.5` / `1.234,5`: the earlier separators are thousands marks and the last one is the
    // decimal point, so the value keeps its fraction. `1234.5`, not `12345` — the shape of that
    // mistake is a 2000 kg squat, which the ceiling then rejects as `null`, i.e. a lost set.
    return { kg: parseWeightToKg(`${head.replace(/[.,]/g, '')}.${fraction}`, unit), assumedGrouping: false };
  }

  if (grouping) {
    // A lone separator with exactly three digits after it (`1.234`): read as a thousands group, so
    // the digits on both sides belong to one integer — and the flag says the choice was made.
    return { kg: parseWeightToKg(head + fraction, unit), assumedGrouping: true };
  }

  return {
    kg: parseWeightToKg(`${head.replace(/[.,]/g, '')}.${fraction}`, unit),
    assumedGrouping: false,
  };
}

/** `1.234,56`'s head `1.234` groups; `12,5`'s head `12` does not need to. */
function groupsInThrees(text: string): boolean {
  const parts = text.split(/[.,]/);
  const head = parts.shift() ?? '';
  if (head === '' || head.length > 3) return false;
  return parts.length > 0 && parts.every((part) => part.length === 3);
}

/**
 * The kg that would be stored if the athlete re-entered exactly what the screen showed them.
 *
 * This is the guard for the card's rounding invariant. It reports rather than enforces: PRs are
 * stored and compared in canonical kg, so the display can never touch a record directly — what it
 * *can* do is show a number that is not the record, and that is what this surfaces to a test.
 */
export function roundTripKg(weightKg: number, unit: PreferredUnit): number | null {
  return parseForInput(formatForDisplay(weightKg, unit), unit).kg;
}

export function isRoundTripStable(weightKg: number, unit: PreferredUnit): boolean {
  const again = roundTripKg(weightKg, unit);
  return again !== null && Math.abs(again - weightKg) <= roundingToleranceKg();
}

/**
 * The module-load ordering this function exists to avoid: a `const` initialised by calling
 * `parseForInput` sits in the temporal-dead-zone of that parser's own regex, and the import throws
 * `Cannot access 'DIGITS_AND_SEPARATORS' before initialization` — which reaches a test runner as a
 * file with **no tests at all**, the least legible failure available.
 */
/**
 * Half of one display step, expressed in kilograms, plus the storage rounding.
 *
 * This was 5 g until a test proved that number incoherent: **0.1 lb is 45 g**, so the display is
 * coarser than the stored value by an order of magnitude, and no lb-shown weight can round-trip
 * inside 5 g. The bound has to come from the display's own resolution, not from a guess — and it is
 * derived by asking the parser what `0.1 lb` is in kg, which keeps the conversion factor in the
 * domain module where it belongs.
 *
 * The invariant survives the widening, because the smallest difference that could decide a record
 * (a 0.5 kg plate step, ~1.1 lb) is twenty times this band.
 */
export function roundingToleranceKg(): number {
  const halfDisplayStepKg = parseForInput(String(1 / 10 ** DISPLAY_DECIMALS), 'lbs').kg ?? 0;
  return Math.max(
    halfDisplayStepKg / 2 + STORAGE_TOLERANCE_KG,
    STORAGE_TOLERANCE_KG,
  );
}
