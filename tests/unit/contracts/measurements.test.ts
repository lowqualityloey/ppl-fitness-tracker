import { describe, expect, it } from 'vitest';
import { MeasurementExportSchema } from '../../../lib/contracts/export.js';
import {
  MEASUREMENT_RANGE_CAP,
  MeasurementKindSchema,
  MeasurementSchema,
  MeasurementListQuerySchema,
  MeasurementUpsertSchema,
} from '../../../lib/contracts/measurements.js';

const KINDS = [
  'body_weight',
  'body_fat_pct',
  'neck_cm',
  'waist_cm',
  'chest_cm',
  'hip_cm',
] as const;

describe('M4-20 (#109) measurement contracts', () => {
  it('pins the OC-1 ratified kind set — adding or dropping a kind must fail here first', () => {
    expect([...MeasurementKindSchema.options].sort()).toEqual([...KINDS].sort());
  });

  it('derives its cap from the kind set, so a 7th kind breaks the build, not the user (G-1)', () => {
    // The cap's whole justification is "a worst honest year never 400s".
    // Edit the enum without re-deriving and this arithmetic says so.
    expect(MEASUREMENT_RANGE_CAP).toBeGreaterThanOrEqual(
      MeasurementKindSchema.options.length * 366,
    );
  });

  describe('MeasurementUpsertSchema', () => {
    const valid = { measuredOn: '2026-09-16', kind: 'body_weight', value: 82.5 };

    it('accepts the honest shape', () => {
      expect(MeasurementUpsertSchema.parse(valid)).toEqual(valid);
    });

    it('rejects kinds the schema does not know — including the height_cm OC-1 said no to', () => {
      for (const kind of ['height_cm', 'biceps_cm', 'BODY_WEIGHT', '']) {
        expect(MeasurementUpsertSchema.safeParse({ ...valid, kind }).success).toBe(false);
      }
    });

    it('rejects unknown keys — .strict() closes the drift door the spec sketch left open', () => {
      expect(
        MeasurementUpsertSchema.safeParse({ ...valid, id: 'a0eebc99-...' }).success,
      ).toBe(false);
      expect(
        MeasurementUpsertSchema.safeParse({ ...valid, unit: 'lbs' }).success,
      ).toBe(false); // ADR-0005: the unit is a display concern, never a wire field
    });

    it('holds the shared date grammar, not a looser one', () => {
      for (const measuredOn of ['2026-9-16', '2026-09-16T00:00:00Z', 'yesterday', '']) {
        expect(MeasurementUpsertSchema.safeParse({ ...valid, measuredOn }).success).toBe(false);
      }
    });

    it('carries WeightKgSchema bounds onto every kind, percent included', () => {
      for (const value of [-0.01, 1000.01, 82.567, Number.NaN]) {
        expect(MeasurementUpsertSchema.safeParse({ ...valid, value }).success).toBe(false);
      }
      expect(MeasurementUpsertSchema.safeParse({ ...valid, value: 0 }).success).toBe(true);
      expect(MeasurementUpsertSchema.safeParse({ ...valid, value: 1000 }).success).toBe(true);
      // body_fat_pct of 100 is the maximum honest percent — the scalar permits
      // it and the CHECK column could hold it; the *UI* is where nonsense
      // percentages get steered, not a second bounds authority.
    });
  });

  describe('MeasurementListQuerySchema', () => {
    it('requires both window ends (OC-3: an unbounded list is not a promise)', () => {
      expect(MeasurementListQuerySchema.safeParse({ from: '2026-01-01' }).success).toBe(false);
      expect(MeasurementListQuerySchema.safeParse({ to: '2026-12-31' }).success).toBe(false);
    });

    it('rejects a backwards window', () => {
      expect(
        MeasurementListQuerySchema.safeParse({ from: '2026-09-16', to: '2026-09-15' }).success,
      ).toBe(false);
      expect(
        MeasurementListQuerySchema.safeParse({ from: '2026-09-16', to: '2026-09-16' }).success,
      ).toBe(true); // a single day is legal
    });

    it('takes kind as the optional filter G-1 made the cap humane', () => {
      expect(
        MeasurementListQuerySchema.safeParse({
          from: '2026-01-01',
          to: '2026-12-31',
          kind: 'waist_cm',
        }).success,
      ).toBe(true);
      expect(
        MeasurementListQuerySchema.safeParse({
          from: '2026-01-01',
          to: '2026-12-31',
          kind: 'thigh_cm',
        }).success,
      ).toBe(false);
    });
  });

  describe('export slot identity (OC-2 precondition)', () => {
    it('is literally the same kind schema object — import replaced the copy that promised not to drift', () => {
      expect(MeasurementExportSchema.shape.kind).toBe(MeasurementKindSchema);
    });

    it('shares the row field names with the upsert contract', () => {
      expect(Object.keys(MeasurementExportSchema.shape).sort()).toEqual(
        Object.keys(MeasurementSchema.shape).sort(),
      );
    });

    it('accepts a row the POST contract accepts — fill-time must not reject its own writes', () => {
      const row = { measuredOn: '2026-09-16', kind: 'chest_cm', value: 108.2 };
      expect(MeasurementUpsertSchema.parse(row)).toEqual(row);
      expect(MeasurementExportSchema.parse(row)).toEqual(row);
    });
  });
});
