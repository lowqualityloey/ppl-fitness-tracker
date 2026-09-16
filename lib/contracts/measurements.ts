import { z } from 'zod';
import { LocalDateSchema, WeightKgSchema } from './common';

/**
 * M4-20 (#109): body measurements — the contract half of the slice, written
 * before the migration per §3 of the planning workflow, and locked to the
 * spec §4.1 sketch the owner ratified (OC-1: the six kinds stay; no
 * `height_cm`, which belongs to the profile row, not the measurement stream).
 *
 * The units ride in the *kind names* — `body_weight` is kg, every `_cm` kind
 * is centimeters, `body_fat_pct` is a percentage (ADR-0005's body-measurement
 * clause: storage is canonical, the display layer converts at the boundary).
 * `WeightKgSchema`'s bounds (0–1000, two-decimal) are the ratified scalar for
 * all three unit families: no measurement kind can honestly exceed 1000 of
 * anything this app models, and a second numeric schema with the same bounds
 * would be two sources of truth for one decision.
 */
export const MeasurementKindSchema = z.enum([
  'body_weight',
  'body_fat_pct',
  'neck_cm',
  'waist_cm',
  'chest_cm',
  'hip_cm',
]);

/** The POST body. `.strict()` closes the drift door the spec's sketch left open. */
export const MeasurementUpsertSchema = z
  .object({
    measuredOn: LocalDateSchema,
    kind: MeasurementKindSchema,
    value: WeightKgSchema,
  })
  .strict();

/**
 * The row shape returned by both routes. No `id`: the unique triple
 * `(user_id, measured_on, kind)` *is* the identity, and exposing a surrogate
 * the client may never act on would invite update-by-id paths this contract
 * deliberately does not have.
 */
export const MeasurementSchema = MeasurementUpsertSchema.extend({}).strict();

/**
 * GET query grammar. `from`/`to` are both required — an unbounded list is not
 * a promise anyone wants to keep (OC-3). The optional `kind` filter is the
 * lever that makes the derived cap painless: a single-kind year is 366 rows.
 */
export const MeasurementListQuerySchema = z
  .object({
    from: LocalDateSchema,
    to: LocalDateSchema,
    kind: MeasurementKindSchema.optional(),
  })
  .refine((q) => q.from <= q.to, { message: 'from must not exceed to' });

/**
 * Cap on rows a single GET may return — derived, not round (grill finding
 * G-1): the worst honest year is every kind logged every day, 6 × 366 = 2,196
 * rows of ~60 bytes, so 2,500 means a maximum-logging athlete's year view can
 * never 400. The repository fetches CAP + 1 rows and the route turns the
 * presence of the extra row into an explicit 400 naming the remedy — silent
 * truncation is the failure this whole decision exists to prevent.
 */
export const MEASUREMENT_RANGE_CAP = 2_500;

export const MeasurementUpsertResponseSchema =
  MeasurementSchema;

export type MeasurementKind = z.infer<typeof MeasurementKindSchema>;
export type MeasurementUpsert = z.infer<typeof MeasurementUpsertSchema>;
export type Measurement = z.infer<typeof MeasurementSchema>;
export type MeasurementListQuery = z.infer<typeof MeasurementListQuerySchema>;
