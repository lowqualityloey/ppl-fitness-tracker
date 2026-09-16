import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
import { bodyMeasurements } from '../../db/schema/index';
import { assertUserContext } from '../db/auth-context';
import { withUser } from '../db/with-user';
import type { Db, JwtClaims, Tx } from '../db/with-user';
import {
  MEASUREMENT_RANGE_CAP,
  MeasurementSchema,
  type Measurement,
  type MeasurementKind,
  type MeasurementUpsert,
} from '../contracts/measurements';

/**
 * M4-20 (#109): the only write path to `body_measurements` besides a human
 * with psql. ADR-0003 applies without exception — `userId` first in every
 * method, asserted against the verified claims, `withUser()` sets the request
 * JWT before any statement runs, and RLS (migration `0008`) is the second
 * layer, never the mechanism.
 *
 * The repository is the authority on the row shape: `numeric` arrives back
 * from the driver as a *string*, so every read funnels through
 * `MeasurementSchema.parse` — a column this file cannot describe is a crash
 * here, not a `NaN` in an athlete's chart.
 *
 * There is no delete method. The triple key plus upsert makes "delete" a
 * misstatement of intent — the honest operations on a measurement are "make
 * it" and "correct it", and both are the same verb here.
 */
export class MeasurementsRepository {
  constructor(
    private readonly db: Db,
    private readonly claims: JwtClaims,
  ) {}

  private forUser<T>(userId: string, operation: (tx: Tx) => Promise<T>): Promise<T> {
    assertUserContext(userId, this.claims);
    return withUser(this.db, this.claims, operation);
  }

  /**
   * INSERT-or-correct on `(user_id, measured_on, kind)` in one statement —
   * no read-then-write window for a second device to slip inside, and the
   * `.returning()` read means the response is what the database holds, not
   * what the client asked for.
   */
  async upsertMeasurement(userId: string, input: MeasurementUpsert): Promise<Measurement> {
    return this.forUser(userId, async (tx) => {
      const [row] = await tx
        .insert(bodyMeasurements)
        .values({
          userId,
          measuredOn: input.measuredOn,
          kind: input.kind,
          value: String(input.value),
        })
        .onConflictDoUpdate({
          target: [bodyMeasurements.userId, bodyMeasurements.measuredOn, bodyMeasurements.kind],
          set: { value: String(input.value) },
        })
        .returning({
          measuredOn: bodyMeasurements.measuredOn,
          kind: bodyMeasurements.kind,
          value: bodyMeasurements.value,
        });

      if (!row) {
        // Unreachable under the 0008 policies — an upsert that satisfies
        // WITH CHECK and belongs to auth.uid() always returns. Reaching this
        // line means the RLS contract changed underneath us; lying about the
        // stored value would be worse.
        throw new Error('measurement upsert returned no row — RLS contract drift');
      }

      return toMeasurement(row);
    });
  }

  /**
   * The range read for the settings panel and the export builder. Ordered
   * `measured_on DESC, kind ASC` — the kind tie-break is load-bearing, not
   * decoration: multiple same-day kinds are otherwise unordered and every
   * caller's snapshot assertions would flake by design.
   *
   * Returns up to `MEASUREMENT_RANGE_CAP + 1` rows (G-1's overflow detector):
   * the extra fetch is how the route turns "would truncate" into an explicit
   * 400 without a second count query. The caller owns that decision; slicing
   * silently is precisely what this repository must not do.
   */
  async listRange(
    userId: string,
    from: string,
    to: string,
    kind?: MeasurementKind,
  ): Promise<Measurement[]> {
    return this.forUser(userId, async (tx) => {
      const rows = await tx
        .select({
          measuredOn: bodyMeasurements.measuredOn,
          kind: bodyMeasurements.kind,
          value: bodyMeasurements.value,
        })
        .from(bodyMeasurements)
        .where(
          and(
            eq(bodyMeasurements.userId, userId),
            gte(bodyMeasurements.measuredOn, from),
            lte(bodyMeasurements.measuredOn, to),
            kind ? eq(bodyMeasurements.kind, kind) : undefined,
          ),
        )
        .orderBy(desc(bodyMeasurements.measuredOn), asc(bodyMeasurements.kind))
        .limit(MEASUREMENT_RANGE_CAP + 1);

      return rows.map(toMeasurement);
    });
  }
}

function toMeasurement(row: {
  measuredOn: string;
  kind: string;
  value: string;
}): Measurement {
  return MeasurementSchema.parse({ ...row, value: Number(row.value) });
}
