import { asc, desc, eq, inArray } from 'drizzle-orm';
import {
  importBatches,
  personalRecords,
  profiles,
  sessionSets,
  sessionTasks,
  workoutSessions,
} from '../../db/schema/index';
import { assertUserContext } from '../db/auth-context';
import { withUser } from '../db/with-user';
import type { Db, JwtClaims, Tx } from '../db/with-user';
import { EXPORT_SESSION_CAP } from '../contracts/export';
import type {
  ArchiveImportRow,
  ArchivePersonalRecordRow,
  ArchiveSessionRow,
  ArchiveSetRow,
  ArchiveTaskRow,
  ExportArchiveRows,
} from '../export/v1';

/**
 * M4-21 (#110): every per-user row the archive needs, read exactly once.
 *
 * ADR-0003 posture, identical to `ProfileRepository`: `userId` first,
 * `assertUserContext` against the verified claims, everything inside
 * `withUser()` — RLS is the second layer, never the mechanism. One
 * transaction, because an archive whose halves were read minutes apart would
 * quietly interleave two different states of the same session.
 *
 * Why this exists beside `WorkoutRepository` instead of reusing it: history
 * reads are *cursor-paginated by design* — a page is exactly what a session
 * export must not be. `limit(cap + 1)` here is the overflow detector for
 * [ASSUMPTION-m4-003]: the builder only learns `truncated` is true if somebody
 * read one row past the cap, and reading everything unbounded for a user with
 * a decade of history is the OOM the card's size decision exists to prevent.
 *
 * Raw drizzle row types deliberately stop at this file's return: the Date /
 * numeric-string / JSON-text normalizations belong to `lib/export/v1.ts`, so
 * the cap arithmetic and the envelope are testable without a database.
 */
export class ExportRepository {
  constructor(
    private readonly db: Db,
    private readonly claims: JwtClaims,
  ) {}

  /** Null means the signed-in user has no profile row — the route's 404 case. */
  async readArchive(userId: string): Promise<ExportArchiveRows | null> {
    assertUserContext(userId, this.claims);
    return withUser(this.db, this.claims, async (tx) => {
      const [user] = await tx
        .select({
          id: profiles.id,
          email: profiles.email,
          displayName: profiles.displayName,
          joinedAt: profiles.createdAt,
          preferredUnit: profiles.preferredUnit,
        })
        .from(profiles)
        .where(eq(profiles.id, userId))
        .limit(1);
      if (!user) return null;

      const sessionRows = await tx
        .select({
          id: workoutSessions.id,
          clientId: workoutSessions.clientId,
          routineDayId: workoutSessions.routineDayId,
          status: workoutSessions.status,
          phase: workoutSessions.phase,
          source: workoutSessions.source,
          localDate: workoutSessions.localDate,
          startedAt: workoutSessions.startedAt,
          completedAt: workoutSessions.completedAt,
          serverSeq: workoutSessions.serverSeq,
        })
        .from(workoutSessions)
        .where(eq(workoutSessions.userId, userId))
        .orderBy(
          desc(workoutSessions.localDate),
          desc(workoutSessions.startedAt),
          desc(workoutSessions.id),
        )
        .limit(EXPORT_SESSION_CAP + 1);

      const childIds = sessionRows.map((row) => row.id);
      const [setRows, taskRows] = childIds.length > 0
        ? await Promise.all([
            this.readSets(tx, userId, childIds),
            this.readTasks(tx, childIds),
          ])
        : [
            [] as (ArchiveSetRow & { sessionId: string })[],
            [] as (ArchiveTaskRow & { sessionId: string })[],
          ];

      // The cap slice keeps the *head* of a newest-first list, so children are
      // grouped per session and the builder never re-derives membership. The
      // cap+1-th session's children are read and simply not attached — honest
      // at the cost of one extra session's rows, never an unbounded scan.
      const sessions: ArchiveSessionRow[] = sessionRows.map((row) => ({
        ...row,
        sets: setRows.filter((set) => set.sessionId === row.id),
        tasks: taskRows.filter((task) => task.sessionId === row.id),
      }));

      const prRows: ArchivePersonalRecordRow[] = await tx
        .select({
          id: personalRecords.id,
          exerciseId: personalRecords.exerciseId,
          bestE1rm: personalRecords.bestE1rm,
          achievedAt: personalRecords.achievedAt,
          sessionId: personalRecords.sessionId,
        })
        .from(personalRecords)
        .where(eq(personalRecords.userId, userId))
        .orderBy(asc(personalRecords.achievedAt), asc(personalRecords.id));

      const importRows: ArchiveImportRow[] = await tx
        .select({
          id: importBatches.id,
          sourceFingerprint: importBatches.sourceFingerprint,
          report: importBatches.report,
          createdAt: importBatches.createdAt,
        })
        .from(importBatches)
        .where(eq(importBatches.userId, userId))
        .orderBy(asc(importBatches.createdAt), asc(importBatches.id));

      return { user, sessions, personalRecords: prRows, imports: importRows };
    });
  }

  private async readSets(
    tx: Tx,
    userId: string,
    sessionIds: string[],
  ): Promise<(ArchiveSetRow & { sessionId: string })[]> {
    const rows = await tx
      .select({
        id: sessionSets.id,
        sessionId: sessionSets.sessionId,
        exerciseId: sessionSets.exerciseId,
        setIndex: sessionSets.setIndex,
        isCompleted: sessionSets.isCompleted,
        weightKg: sessionSets.weightKg,
        reps: sessionSets.reps,
        clientTs: sessionSets.clientTs,
      })
      .from(sessionSets)
      .where(eq(sessionSets.userId, userId))
      .orderBy(asc(sessionSets.sessionId), asc(sessionSets.setIndex));
    return rows.filter((row) => sessionIds.includes(row.sessionId));
  }

  private async readTasks(
    tx: Tx,
    sessionIds: string[],
  ): Promise<(ArchiveTaskRow & { sessionId: string })[]> {
    return tx
      .select({
        id: sessionTasks.id,
        sessionId: sessionTasks.sessionId,
        taskKey: sessionTasks.taskKey,
        completedAt: sessionTasks.completedAt,
        clientTs: sessionTasks.clientTs,
      })
      .from(sessionTasks)
      .where(inArray(sessionTasks.sessionId, sessionIds))
      .orderBy(asc(sessionTasks.sessionId), asc(sessionTasks.taskKey));
  }
}
