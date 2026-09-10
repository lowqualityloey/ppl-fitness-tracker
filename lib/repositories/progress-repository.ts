import { and, asc, eq, isNull, or } from 'drizzle-orm';
import { exercises, personalRecords, sessionSets, workoutSessions } from '../../db/schema/index';
import type { E1rmPoint, ExerciseProgressData, PersonalRecord } from '../contracts/progress';
import { assertUserContext } from '../db/auth-context';
import { calculateE1rm } from '../domain/progression/progression-engine';
import { withUser } from '../db/with-user';
import type { Db, JwtClaims, Tx } from '../db/with-user';

/**
 * M2-06 (#42): read side of `GET /api/progress/:exerciseSlug`.
 *
 * The trendline is **computed from logged sets, not replayed from
 * `personal_records`**, which is the distinction that matters here.
 * `personal_records` holds exactly one row per (user, exercise) — the all-time
 * best — so it cannot answer "how has this lift moved". The per-session maxima
 * below can, and they are re-derived through the same `calculateE1rm` the write
 * path uses, so a trendline can never disagree with the record column by using a
 * different formula. Sets the legacy importer leaves at NULL weight/reps drop out
 * naturally: `calculateE1rm` returns null for anything it cannot progress, which
 * is also why an imported session never shows up as a phantom strength gain.
 *
 * Everything read is scoped twice: explicit `userId` predicates here, RLS under
 * the non-owner role underneath. Exercise resolution admits system content
 * (`owner_user_id IS NULL`) *and* this user's own custom exercises, and nothing
 * belonging to anyone else.
 */
export class ProgressRepository {
  constructor(
    private readonly db: Db,
    private readonly claims: JwtClaims,
  ) {}

  private forUser<T>(userId: string, operation: (tx: Tx) => Promise<T>): Promise<T> {
    assertUserContext(userId, this.claims);
    return withUser(this.db, this.claims, operation);
  }

  /** Returns null when no exercise with this slug is visible to the user. */
  async getExerciseProgress(userId: string, slug: string): Promise<ExerciseProgressData | null> {
    return this.forUser(userId, async (tx) => {
      const [exercise] = await tx
        .select({ id: exercises.id })
        .from(exercises)
        .where(and(
          eq(exercises.slug, slug),
          or(isNull(exercises.ownerUserId), eq(exercises.ownerUserId, userId)),
        ))
        .limit(1);
      if (!exercise) return null;

      const loggedSets = await tx
        .select({
          sessionId: sessionSets.sessionId,
          localDate: workoutSessions.localDate,
          clientTs: sessionSets.clientTs,
          weightKg: sessionSets.weightKg,
          reps: sessionSets.reps,
          isCompleted: sessionSets.isCompleted,
        })
        .from(sessionSets)
        .innerJoin(workoutSessions, eq(sessionSets.sessionId, workoutSessions.id))
        .where(and(
          eq(sessionSets.userId, userId),
          eq(sessionSets.exerciseId, exercise.id),
        ))
        .orderBy(asc(workoutSessions.localDate), asc(sessionSets.clientTs));

      // One point per session: the strongest progressable set in it. Ordering by
      // (date, sessionId) rather than date alone keeps the array identical across
      // requests, which matters because the response is cacheable.
      const bestPerSession = new Map<string, { date: string; e1rm: number }>();
      for (const set of loggedSets) {
        const e1rm = calculateE1rm({
          isCompleted: set.isCompleted,
          weightKg: set.weightKg === null ? null : Number(set.weightKg),
          reps: set.reps,
        });
        if (e1rm === null) continue;
        const current = bestPerSession.get(set.sessionId);
        if (!current || e1rm > current.e1rm) {
          bestPerSession.set(set.sessionId, { date: set.localDate, e1rm });
        }
      }

      const trendline: E1rmPoint[] = Array.from(bestPerSession, ([sessionId, point]) => ({
        date: point.date,
        e1rm: point.e1rm,
        sessionId,
      })).sort((left, right) =>
        left.date.localeCompare(right.date) || left.sessionId.localeCompare(right.sessionId));

      const recordRows = await tx
        .select({
          bestE1rm: personalRecords.bestE1rm,
          achievedAt: personalRecords.achievedAt,
          sessionId: personalRecords.sessionId,
        })
        .from(personalRecords)
        .where(and(
          eq(personalRecords.userId, userId),
          eq(personalRecords.exerciseId, exercise.id),
        ));

      const records: PersonalRecord[] = recordRows.map((row) => ({
        bestE1rm: Number(row.bestE1rm),
        achievedAt: row.achievedAt.toISOString(),
        sessionId: row.sessionId,
      }));

      return { exerciseSlug: slug, trendline, personalRecords: records };
    });
  }
}
