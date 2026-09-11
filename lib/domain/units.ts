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
/** `WeightKgSchema`'s ceiling, named so a component can say why it refused. */
export const MAX_WEIGHT_KG = 1000;

/**
 * Parse a user-entered weight into **canonical kilograms** (ADR-0005).
 *
 * This is the input half of the boundary §3.2 assigns to `UnitDisplay`, and it exists
 * here rather than in a component because the invariant it protects is a data one: "a
 * mutation must never carry a display-unit value". A user on `lbs` who types 220 and
 * whose tap stores `220` has not logged a bench press, they have logged 220 kg, and
 * nothing downstream can tell. So the only place a unit can be consulted is this
 * function, and the only thing that leaves it is kg.
 *
 * Returns `null` for empty or unparseable input — which is *absence* of a value, the
 * same thing `weightKg: null` means on the wire. Out-of-range is deliberately **not**
 * silently clamped: the caller is told by the exported maximum and decides what to
 * print, because quietly turning 5000 into 1000 would write a number the user never
 * entered.
 *
 * Rounding to the stored `numeric(6,2)` precision is not cosmetic: `WeightKgSchema` is
 * `multipleOf(0.01)`, so an unrounded lbs→kg result can be rejected by the very
 * contract the request must satisfy.
 */
export function parseWeightToKg(input: string, unit: PreferredUnit): number | null {
  const trimmed = input.trim().replace(',', '.');
  if (trimmed === '') return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0 || value > MAX_WEIGHT_KG) return null;

  const asKg = unit === 'kg' ? value : value * KG_PER_LB;
  return Math.round(asKg * 100) / 100;
}

/** Reps are unitless and integral; the contract's 0–1000 range is the caller's check. */
export function parseReps(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) return null;
  return value;
}

function trimTrailingZero(valueKg: number): string {
  return String(Number(valueKg.toFixed(2)));
}
