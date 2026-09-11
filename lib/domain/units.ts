import type { PreferredUnit } from '../contracts/profile';

/**
 * Display-unit conversion — the only place it is allowed to happen.
 *
 * ADR-0005 makes kilograms canonical for storage and `profiles.preferred_unit` a
 * pure *display* preference. `ProfileRepository` states the negative half of that
 * rule ("there is deliberately no conversion anywhere in this file"); this module
 * is the positive half. It exists as a single named seam for one reason: a weight
 * converted on the way into the database, or converted twice on the way out,
 * corrupts history invisibly until someone compares two screens. So this file is
 * read-side only — nothing here is imported by a write path, and `kgToDisplay`
 * deliberately has no inverse.
 */

/** Exact by definition: 1 lb = 0.45359237 kg. */
const KG_PER_LB = 0.45359237;

/**
 * Decimal places shown in pounds.
 *
 * The legacy app displayed one decimal (`72.6 lb`), and lb plate increments are
 * fractional, so rounding to an integer would print a 20 kg plate as "44 lb"
 * beside someone's "45 lb" plate. Matching legacy precision is an
 * observable-behaviour decision, which is why it is a named constant and not a
 * literal inside `toFixed`.
 */
const LB_DECIMALS = 1;

export function kgToDisplay(weightKg: number, unit: PreferredUnit): number {
  return unit === 'kg' ? weightKg : Number((weightKg / KG_PER_LB).toFixed(LB_DECIMALS));
}

/**
 * Render a stored kilogram value in a user's preferred unit.
 *
 * `null` means "no weight recorded" (an unlogged set, or a bodyweight movement),
 * which is a different fact from "0 kg" — so it renders an em dash instead of
 * coercing to zero. `session_sets.weight_kg` is nullable for exactly that reason.
 */
export function formatWeight(weightKg: number | null, unit: PreferredUnit): string {
  if (weightKg === null) return '—';
  if (unit === 'kg') return `${trimTrailingZero(weightKg)} kg`;
  return `${kgToDisplay(weightKg, 'lbs').toFixed(LB_DECIMALS)} lb`;
}

/**
 * Kilograms print without trailing zeros.
 *
 * Stored values are `numeric(6,2)`, so an untrimmed render of the common case
 * reads "60.0 kg" everywhere it appears. Trimming happens at the display edge
 * only — never on the value used for arithmetic or comparison — so personal
 * records and prefill maths keep the full stored precision.
 */
function trimTrailingZero(valueKg: number): string {
  return String(Number(valueKg.toFixed(2)));
}
