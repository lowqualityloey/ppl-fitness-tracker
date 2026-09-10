import { and, eq, isNull } from 'drizzle-orm';
import {
  importBatches,
  routineDays,
  routineExercises,
  sessionSets,
  workoutSessions,
} from '../../db/schema/index';
import { assertUserContext } from '../db/auth-context';
import { withUser } from '../db/with-user';
import type { Db, JwtClaims, Tx } from '../db/with-user';
import type { ImportReport } from '../contracts/import';
import type { LegacyImportedCounts } from '../domain/import/types';
import type { LegacyDaySlug, LegacySessionPlan } from '../domain/import/legacy-importer';
import { LegacyImportNothingWrittenError } from '../domain/import/types';
import { legacySlotToOrderIndex } from '../domain/import/legacy-importer';

/**
 * M2-05: persistence for legacy imports.
 *
 * A second repository next to `WorkoutRepository` is a deliberate, contained
 * duplication: it re-uses the same two security primitives as the invariant
 * requires (`assertUserContext` before `withUser`, `userId` as the first
 * argument of every method, explicit `userId` predicates on every owned table),
 * but it keeps archived-import writes out of an already 878-line session
 * repository. If a third seam appears, the shared guard should be extracted
 * rather than copied a third time.
 *
 * The whole batch commits or nothing does. The `import_batches` row is written
 * in the same transaction as the sessions it describes, so a report can never
 * claim rows that were rolled back, and a rolled-back batch leaves no fingerprint
 * behind to short-circuit a retry.
 */

const DAY_SLUGS: Record<LegacyDaySlug, string> = {
  push: 'push',
  legs: 'legs',
  pull: 'pull',
};

interface DayContent {
  routineDayId: string;
  exerciseIdByOrderIndex: Map<number, string>;
}

export interface LegacyImportCommitResult {
  /** A stored batch was found, so nothing was written and its report replayed. */
  replayed: boolean;
  report: ImportReport;
}

function parseStoredReport(raw: string): ImportReport | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const candidate = parsed as Record<string, unknown>;
    if (
      typeof candidate['sessionsCreated'] !== 'number' ||
      typeof candidate['setsRecovered'] !== 'number' ||
      !Array.isArray(candidate['fieldsNotRecovered'])
    ) {
      return null;
    }
    return parsed as ImportReport;
  } catch {
    return null;
  }
}

/**
 * `started_at` and `local_date` agree. The legacy app stored no start time (only
 * push's last-save timestamp, and no date at all for legs), so the session's
 * date is the honest boundary and the timestamp is placed at midnight UTC of
 * that date rather than at the import moment, which would file every legacy
 * workout under "today". The report's `dateConfidence` carries the uncertainty.
 */
function startOfLocalDate(localDate: string): Date {
  return new Date(`${localDate}T00:00:00.000Z`);
}

export class LegacyImportRepository {
  constructor(
    private readonly db: Db,
    private readonly claims: JwtClaims,
  ) {}

  private forUser<T>(userId: string, operation: (tx: Tx) => Promise<T>): Promise<T> {
    assertUserContext(userId, this.claims);
    return withUser(this.db, this.claims, operation);
  }

  /** Idempotency lookup: the stored report for this exact source payload. */
  async findStoredReport(userId: string, fingerprint: string): Promise<ImportReport | null> {
    return this.forUser(userId, async (tx) => {
      const [row] = await tx
        .select({ report: importBatches.report })
        .from(importBatches)
        .where(and(
          eq(importBatches.userId, userId),
          eq(importBatches.sourceFingerprint, fingerprint),
        ))
        .limit(1);
      return row ? parseStoredReport(row.report) : null;
    });
  }

  /**
   * Write the batch and its report in one transaction.
   *
   * `buildReport` is called inside the transaction with the number of set rows
   * actually inserted, because that is the only value the persisted report can
   * honestly carry. It is passed in rather than computed here so the domain
   * module keeps ownership of what a report means.
   */
  async commitBatch(
    userId: string,
    fingerprint: string,
    plans: LegacySessionPlan[],
    buildReport: (written: LegacyImportedCounts) => ImportReport,
  ): Promise<LegacyImportCommitResult> {
    return this.forUser(userId, async (tx) => {
      // Re-check inside the transaction: two concurrent requests can both pass
      // the pre-flight lookup, and this is where the second one turns into a
      // replay instead of a duplicated batch.
      const [existing] = await tx
        .select({ report: importBatches.report })
        .from(importBatches)
        .where(and(
          eq(importBatches.userId, userId),
          eq(importBatches.sourceFingerprint, fingerprint),
        ))
        .limit(1);
      if (existing) {
        const stored = parseStoredReport(existing.report);
        if (stored) return { replayed: true, report: stored };
      }

      let sessionsInserted = 0;
      let setsInserted = 0;
      for (const plan of plans) {
        const content = await this.resolveDayContent(tx, plan.daySlug);
        if (!content) continue;

        const startedAt = startOfLocalDate(plan.localDate);
        const inserted = await tx
          .insert(workoutSessions)
          .values({
            userId,
            routineDayId: content.routineDayId,
            clientId: plan.clientId,
            localDate: plan.localDate,
            status: 'archived',
            phase: plan.phase,
            source: 'legacy_import',
            startedAt,
            // Deliberately NULL: no legacy payload recorded when a session ended.
            completedAt: null,
            serverSeq: 0,
          })
          .onConflictDoNothing({
            target: [workoutSessions.userId, workoutSessions.clientId],
          })
          .returning({ id: workoutSessions.id });

        const sessionId = inserted[0]?.id;
        if (!sessionId) continue;
        sessionsInserted += 1;

        for (const planned of plan.sets) {
          const orderIndex = legacySlotToOrderIndex(planned.slot);
          const exerciseId = content.exerciseIdByOrderIndex.get(orderIndex);
          if (!exerciseId) continue;
          const sets = await tx
            .insert(sessionSets)
            .values({
              userId,
              sessionId,
              exerciseId,
              setIndex: planned.setIndex,
              isCompleted: true,
              // weightKg and reps stay NULL: the legacy app never captured load.
              clientTs: startedAt,
            })
            .onConflictDoNothing({
              target: [
                sessionSets.sessionId,
                sessionSets.exerciseId,
                sessionSets.setIndex,
              ],
            })
            .returning({ id: sessionSets.id });
          if (sets.length > 0) setsInserted += 1;
        }
      }

      // Zero rows has two causes, and they get opposite handling.
      //
      // A concurrent twin can win the same fingerprint while this transaction
      // was blocked on the derived `client_id` unique index. Its rows are
      // committed and visible to fresh statements here, so re-reading turns this
      // request into a replay — reporting the batch that now exists instead of
      // failing a user whose second request raced its first.
      //
      // Anything else means the seeded content this plan depends on is absent.
      // Raise so nothing commits: persisting a fingerprint against an empty
      // batch would make every later retry replay an empty result even after the
      // seeds were fixed.
      if (sessionsInserted === 0) {
        const [winner] = await tx
          .select({ report: importBatches.report })
          .from(importBatches)
          .where(and(
            eq(importBatches.userId, userId),
            eq(importBatches.sourceFingerprint, fingerprint),
          ))
          .limit(1);
        const raced = winner ? parseStoredReport(winner.report) : null;
        if (raced) return { replayed: true, report: raced };

        throw new LegacyImportNothingWrittenError(
          'Legacy import produced no sessions: seeded routine content is unavailable.',
        );
      }

      const counts: LegacyImportedCounts = { sessionsInserted, setsInserted };
      const report = buildReport(counts);
      await tx
        .insert(importBatches)
        .values({ userId, sourceFingerprint: fingerprint, report: JSON.stringify(report) })
        .onConflictDoNothing({
          target: [importBatches.userId, importBatches.sourceFingerprint],
        });

      return { replayed: false, report };
    });
  }

  /**
   * Resolve the seeded system day and its ordered exercises.
   *
   * The importer does not mint routine days: the seeded content already provides
   * push/legs/pull (`db/seed/exercises.ts`), `routine_days.slug` is globally
   * unique so a per-user copy would collide on the second importer anyway, and
   * `workout_sessions.routine_day_id` is NOT NULL. When the content is absent or
   * incomplete, the caller's report says so rather than inventing a container.
   */
  private async resolveDayContent(tx: Tx, slug: LegacyDaySlug): Promise<DayContent | null> {
    const [day] = await tx
      .select({ id: routineDays.id })
      .from(routineDays)
      .where(and(
        eq(routineDays.slug, DAY_SLUGS[slug]),
        // System content only: `owner_user_id IS NULL` is what distinguishes a
        // seeded day from a user's own routine, and the importer must never
        // attach imported history to a hand-built routine the user made later.
        isNull(routineDays.ownerUserId),
      ))
      .limit(1);
    if (!day) return null;

    const rows = await tx
      .select({
        exerciseId: routineExercises.exerciseId,
        orderIndex: routineExercises.orderIndex,
      })
      .from(routineExercises)
      .where(and(
        eq(routineExercises.routineDayId, day.id),
        eq(routineExercises.phase, 'main_workout'),
      ));

    const exerciseIdByOrderIndex = new Map<number, string>();
    for (const row of rows) {
      exerciseIdByOrderIndex.set(row.orderIndex, row.exerciseId);
    }
    return { routineDayId: day.id, exerciseIdByOrderIndex };
  }
}
