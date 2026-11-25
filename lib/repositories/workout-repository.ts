import { and, asc, desc, eq, gte, inArray, isNotNull, lt, lte, ne, or, sql } from 'drizzle-orm';
import * as schema from '../../db/schema/index';
import { assertUserContext } from '../db/auth-context';
import { withUser } from '../db/with-user';
import type { Db, Tx, JwtClaims } from '../db/with-user';
import { shiftIsoDate } from '../domain/local-date';
import type { TrainingDayBucket } from '../views/dashboard-view';
import type { SyncMutation, SyncRequest } from '../contracts/sync';
import type { PrefillData, SessionSummary } from '../contracts/sessions';
import { SyncEngine, ZERO_UUID, canonicalMutationHash, mutationEntity } from '../domain/sync/sync-engine';
import type {
  SyncEntityType,
  SyncEntityVersion,
  SyncMutationRecord,
  SyncReservation,
  SyncStore,
  SyncApplyResult,
} from '../domain/sync/types';
import { SyncValidationError } from '../domain/sync/types';
import { ProgressionEngine } from '../domain/progression/progression-engine';
import type {
  PersonalRecordValue,
  ProgressionSet,
  ProgressionStore,
} from '../domain/progression/types';
import {
  mapRoutineExercisePlan,
  mapSessionSet,
  mapSessionState,
  mapSessionSummary,
  mapSessionTask,
} from '../domain/sessions/mappers';
import {
  assertCompletionTimestamp,
  assertFinishAllowed,
  assertPhaseAdvance,
  assertSetMutationAllowed,
  assertTaskMutationAllowed,
} from '../domain/sessions/transition-table';
import type {
  RoutineExercisePlan,
  SessionMutation,
  SessionMutationContext,
  SessionPage,
  SessionSetMutation,
  SessionSetState,
  SessionState,
  SessionTaskMutation,
  SessionTaskState,
} from '../domain/sessions/types';
import {
  InvalidSessionCursorError,
  SessionConflictError,
  SessionNotFoundError,
  SessionStartConflictError,
} from '../domain/sessions/types';

const {
  exercises,
  personalRecords,
  routineDays,
  routineExercises,
  sessionSets,
  sessionTasks,
  syncChanges,
  syncEntityVersions,
  syncMutations,
  workoutSessions,
} = schema;

const PAGE_SIZE = 20;
const SESSION_PHASE_ORDER: Record<string, number> = {
  main_workout: 0,
  stretch: 1,
};
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// Mirrors the pgEnum label definition order for task_key, which is what
// `asc(sessionTasks.taskKey)` sorts by — alphabetical order would differ.
const TASK_KEY_ORDER: Record<string, number> = {
  warm_up: 0,
  main_workout: 1,
  stretch: 2,
};

function compareSetStates(left: SessionSetState, right: SessionSetState): number {
  if (left.exerciseId !== right.exerciseId) {
    return left.exerciseId < right.exerciseId ? -1 : 1;
  }
  return left.setIndex - right.setIndex;
}

function compareTaskStates(left: SessionTaskState, right: SessionTaskState): number {
  return TASK_KEY_ORDER[left.taskKey]! - TASK_KEY_ORDER[right.taskKey]!;
}

/**
 * In-memory equivalent of the `mapSessionInTx` remap for a set/task upsert: splice in the row
 * the database just returned (`.returning()`, so ids and timestamps are the DB's canonical
 * values) and restore the exact ORDER BY the removed remap applied. M4-27 (#167).
 */
function patchSets(sets: readonly SessionSetState[], written: SessionSetState): SessionSetState[] {
  return [
    ...sets.filter((set) =>
      !(set.exerciseId === written.exerciseId && set.setIndex === written.setIndex)),
    written,
  ].sort(compareSetStates);
}

function patchTasks(tasks: readonly SessionTaskState[], written: SessionTaskState): SessionTaskState[] {
  return [
    ...tasks.filter((task) => task.taskKey !== written.taskKey),
    written,
  ].sort(compareTaskStates);
}

type SessionCursor = {
  localDate: string;
  id: string;
};

type PlanRow = {
  placement: typeof routineExercises.$inferSelect;
  exercise: typeof exercises.$inferSelect;
};

type MutableState = { current: SessionState };

function asSyncMutationRecord(row: typeof syncMutations.$inferSelect): SyncMutationRecord {
  const status = row.status === 'processing' || row.status === 'applied' || row.status === 'rejected'
    ? row.status
    : null;
  return {
    mutationId: row.mutationId,
    payloadHash: row.payloadHash,
    status,
    serverSeq: row.serverSeq,
    rejectionReason: row.rejectionReason,
  };
}

function parseSetEntityKey(entityKey: string): { exerciseId: string; setIndex: number } | null {
  const match = /^set:([^:]+):(\d+)$/.exec(entityKey);
  if (!match) return null;
  return { exerciseId: match[1]!, setIndex: Number(match[2]) };
}

function parseTaskEntityKey(entityKey: string): string | null {
  return entityKey.startsWith('task:') ? entityKey.slice('task:'.length) : null;
}

function isValidLocalDate(value: string): boolean {
  const match = LOCAL_DATE_PATTERN.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function encodeCursor(cursor: SessionCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): SessionCursor {
  try {
    const decoded: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      typeof decoded !== 'object' ||
      decoded === null ||
      typeof (decoded as { localDate?: unknown }).localDate !== 'string' ||
      typeof (decoded as { id?: unknown }).id !== 'string'
    ) {
      throw new Error('invalid shape');
    }

    const localDate = (decoded as { localDate: string }).localDate;
    const id = (decoded as { id: string }).id;
    if (!isValidLocalDate(localDate) || !UUID_PATTERN.test(id)) {
      throw new Error('invalid values');
    }

    return { localDate, id };
  } catch {
    throw new InvalidSessionCursorError('Invalid session cursor.');
  }
}

function orderPlan(plan: RoutineExercisePlan[]): RoutineExercisePlan[] {
  return [...plan].sort((left, right) => {
    const phaseOrder = (SESSION_PHASE_ORDER[left.phase] ?? Number.MAX_SAFE_INTEGER) -
      (SESSION_PHASE_ORDER[right.phase] ?? Number.MAX_SAFE_INTEGER);
    return phaseOrder || left.orderIndex - right.orderIndex;
  });
}

/**
 * M3-04 (#61): one day's state for the dashboard. Deliberately narrow — it answers
 * "has this day been started, and how far did it get", nothing else. The full
 * session graph stays behind `findSession`, which the runner owns.
 */
export interface DaySessionSnapshot {
  routineDayId: string;
  sessionId: string;
  status: SessionSummary['status'];
  phase: SessionSummary['phase'];
  setsCompleted: number;
  setsTotal: number;
}

export class WorkoutRepository {
  constructor(
    private readonly db: Db,
    private readonly claims: JwtClaims,
  ) {}

  async listSessions(userId: string, cursor?: string): Promise<SessionPage> {
    return this.forUser(userId, async (tx) => {
      const decodedCursor = cursor ? decodeCursor(cursor) : undefined;
      const cursorFilter = decodedCursor
        ? or(
            lt(workoutSessions.localDate, decodedCursor.localDate),
            and(
              eq(workoutSessions.localDate, decodedCursor.localDate),
              lt(workoutSessions.id, decodedCursor.id),
            ),
          )
        : undefined;

      const rows = await tx
        .select()
        .from(workoutSessions)
        .where(and(
          eq(workoutSessions.userId, userId),
          cursorFilter,
        ))
        .orderBy(desc(workoutSessions.localDate), desc(workoutSessions.id))
        .limit(PAGE_SIZE + 1);

      const pageRows = rows.slice(0, PAGE_SIZE);
      const lastRow = pageRows.at(-1);
      return {
        sessions: pageRows.map(mapSessionSummary),
        nextCursor: rows.length > PAGE_SIZE && lastRow
          ? encodeCursor({ localDate: lastRow.localDate, id: lastRow.id })
          : null,
      };
    });
  }

  async findSession(userId: string, sessionId: string): Promise<SessionState | null> {
    return this.forUser(userId, (tx) => this.findSessionInTx(tx, userId, sessionId));
  }

  /**
   * M3-01 (#58): the `since` version token, read without loading the session
   * graph. The delta contract (lib/contracts/sessions.ts) compares `since` to
   * `workout_sessions.server_seq` and nothing else, so this returns exactly
   * that number — null only when the session does not exist for this user,
   * which the route answers 404 regardless of `since`.
   */
  /**
   * M3-04 (#61): every session this user has on one local date, with its set
   * counts — the three numbers a day card needs to say Start / Resume / Done.
   *
   * `workout_sessions` is unique on (user_id, routine_day_id, local_date), so a day
   * yields at most one row here. The return type is still a list, because that
   * uniqueness is a fact about today's schema and not a promise about tomorrow's: a
   * caller written against "at most one" would degrade silently into showing the
   * wrong session if the constraint ever moved, whereas a list makes the last-write
   * decision visible in the view layer where it can be asserted.
   *
   * Counts are aggregated in SQL rather than by loading `session_sets` rows. The
   * card displays two integers; shipping the rows to compute them client-side would
   * be the same mistake as counting routine exercises in the browser, and it would
   * also grow with workout length instead of staying constant.
   */
  async getSessionsOnDate(
    userId: string,
    localDate: string,
  ): Promise<DaySessionSnapshot[]> {
    return this.forUser(userId, async (tx) => {
      const sessions = await tx
        .select({
          routineDayId: workoutSessions.routineDayId,
          sessionId: workoutSessions.id,
          status: workoutSessions.status,
          phase: workoutSessions.phase,
        })
        .from(workoutSessions)
        .where(and(
          eq(workoutSessions.userId, userId),
          eq(workoutSessions.localDate, localDate),
        ))
        .orderBy(asc(workoutSessions.startedAt));

      if (sessions.length === 0) return [];

      const counts = await tx
        .select({
          sessionId: sessionSets.sessionId,
          setsCompleted: sql<number>`count(*) filter (where ${sessionSets.isCompleted})::int`,
          setsTotal: sql<number>`count(*)::int`,
        })
        .from(sessionSets)
        .where(and(
          eq(sessionSets.userId, userId),
          inArray(sessionSets.sessionId, sessions.map((row) => row.sessionId)),
        ))
        .groupBy(sessionSets.sessionId);

      const bySession = new Map(counts.map((row) => [row.sessionId, row]));
      return sessions.map((row) => ({
        routineDayId: row.routineDayId,
        sessionId: row.sessionId,
        status: row.status,
        phase: row.phase,
        setsCompleted: bySession.get(row.sessionId)?.setsCompleted ?? 0,
        setsTotal: bySession.get(row.sessionId)?.setsTotal ?? 0,
      }));
    });
  }

  /**
   * M4-19 (#108): one counted week for the dashboard, aggregated in SQL.
   *
   * The dashboard precedent (M3-04) holds: the screen renders integers, so the rows
   * stay behind the query. One grouped read over completed sessions in
   * `[endDate-6, endDate]` joined to their sets, plus the distinct completed dates
   * (for the streak, which needs history beyond the window) — both user-scoped,
   * both constant in shape regardless of workout length.
   *
   * Volume is `SUM(weight_kg * reps)` over completed sets carrying **both** numbers,
   * in canonical kg (ADR-0005 — the profile changes rendering, never this). A set
   * with a null weight or null reps contributes nothing to the sum but still counts
   * in `loadSets` only when both are present; sessions without any load-carrying set
   * surface as coverage in the view layer, not as a zero that claims measurement.
   * `in_progress` and `archived` sessions are excluded — only `completed` is a fact
   * about training. Days with no sessions are zero-filled here so the view layer
   * classifies rather than counts.
   */
  async getTrainingWeek(
    userId: string,
    endDate: string,
  ): Promise<{ days: TrainingDayBucket[]; trainingDates: string[] }> {
    return this.forUser(userId, async (tx) => {
      const startDate = shiftIsoDate(endDate, -6);
      const loadFilter = and(
        eq(sessionSets.isCompleted, true),
        isNotNull(sessionSets.weightKg),
        isNotNull(sessionSets.reps),
      );
      const buckets = await tx
        .select({
          localDate: workoutSessions.localDate,
          sessions: sql<number>`count(distinct ${workoutSessions.id})::int`,
          volumeKg: sql<string>`coalesce(sum(${sessionSets.weightKg} * ${sessionSets.reps}) filter (where ${loadFilter}), 0)`,
          loadSets: sql<number>`count(*) filter (where ${loadFilter})::int`,
        })
        .from(workoutSessions)
        .leftJoin(
          sessionSets,
          and(
            eq(sessionSets.sessionId, workoutSessions.id),
            eq(sessionSets.userId, userId),
          ),
        )
        .where(
          and(
            eq(workoutSessions.userId, userId),
            eq(workoutSessions.status, 'completed'),
            gte(workoutSessions.localDate, startDate),
            lte(workoutSessions.localDate, endDate),
          ),
        )
        .groupBy(workoutSessions.localDate);

      const byDate = new Map(buckets.map((row) => [row.localDate, row]));
      const days: TrainingDayBucket[] = [];
      for (let back = 6; back >= 0; back -= 1) {
        const localDate = shiftIsoDate(endDate, -back);
        const row = byDate.get(localDate);
        days.push({
          localDate,
          sessions: row?.sessions ?? 0,
          volumeKg: row ? Number(row.volumeKg) : 0,
          loadSets: row?.loadSets ?? 0,
        });
      }

      const dateRows = await tx
        .selectDistinct({ localDate: workoutSessions.localDate })
        .from(workoutSessions)
        .where(
          and(
            eq(workoutSessions.userId, userId),
            eq(workoutSessions.status, 'completed'),
          ),
        )
        .orderBy(desc(workoutSessions.localDate))
        .limit(400);

      return { days, trainingDates: dateRows.map((row) => row.localDate) };
    });
  }

  async getSessionServerSeq(userId: string, sessionId: string): Promise<number | null> {
    return this.forUser(userId, async (tx) => {
      const [session] = await tx
        .select({ serverSeq: workoutSessions.serverSeq })
        .from(workoutSessions)
        .where(and(
          eq(workoutSessions.id, sessionId),
          eq(workoutSessions.userId, userId),
        ))
        .limit(1);
      return session ? session.serverSeq : null;
    });
  }

  /**
   * M3-00 (#57): "what did I lift last time" for this routine day, resolved by
   * one indexed read instead of a client downloading its history.
   *
   * The source is `status IN ('completed','archived')` — an in-progress session
   * is someone still deciding, not a fact worth remembering — ordered exactly
   * like `listSessions` (`desc(localDate), desc(id)`) so "most recent" means
   * one thing in this codebase. `excludeSessionId` drops the session currently
   * being started; without it the second tap of Start would prefill from the
   * resumed first tap.
   *
   * A completed set is kept when it carries **either** number: a reps-only
   * legacy slot still has a real suggestion, and a weight-only slot too. Only
   * the both-null slot is omitted — there is genuinely nothing to remember.
   * `weightKg` is emitted in canonical kg (ADR-0005); the unit preference in
   * the profile changes what the client renders, never what this returns.
   */
  async getPrefill(userId: string, routineDayId: string, excludeSessionId?: string): Promise<PrefillData> {
    return this.forUser(userId, async (tx) => {
      const [source] = await tx
        .select({ id: workoutSessions.id, localDate: workoutSessions.localDate })
        .from(workoutSessions)
        .where(and(
          eq(workoutSessions.userId, userId),
          eq(workoutSessions.routineDayId, routineDayId),
          inArray(workoutSessions.status, ['completed', 'archived']),
          excludeSessionId ? ne(workoutSessions.id, excludeSessionId) : undefined,
        ))
        .orderBy(desc(workoutSessions.localDate), desc(workoutSessions.id))
        .limit(1);

      if (!source) {
        return { entries: [], sourceSessionId: null, sourceLocalDate: null };
      }

      const rows = await tx
        .select({
          exerciseId: sessionSets.exerciseId,
          setIndex: sessionSets.setIndex,
          weightKg: sessionSets.weightKg,
          reps: sessionSets.reps,
        })
        .from(sessionSets)
        .where(and(
          eq(sessionSets.userId, userId),
          eq(sessionSets.sessionId, source.id),
          eq(sessionSets.isCompleted, true),
          or(isNotNull(sessionSets.weightKg), isNotNull(sessionSets.reps)),
        ))
        .orderBy(asc(sessionSets.exerciseId), asc(sessionSets.setIndex));

      return {
        entries: rows.map((row) => ({
          exerciseId: row.exerciseId,
          setIndex: row.setIndex,
          weightKg: row.weightKg === null ? null : Number(row.weightKg),
          reps: row.reps,
          sourceLocalDate: source.localDate,
        })),
        sourceSessionId: source.id,
        sourceLocalDate: source.localDate,
      };
    });
  }

  async findPersonalRecord(userId: string, exerciseId: string): Promise<PersonalRecordValue | null> {
    return this.forUser(userId, async (tx) => {
      const [record] = await tx
        .select()
        .from(personalRecords)
        .where(and(
          eq(personalRecords.userId, userId),
          eq(personalRecords.exerciseId, exerciseId),
        ))
        .limit(1);

      return record ? {
        exerciseId: record.exerciseId,
        bestE1rm: Number(record.bestE1rm),
        achievedAt: record.achievedAt,
        sessionId: record.sessionId,
      } : null;
    });
  }

  async findByClientId(userId: string, clientId: string): Promise<SessionState | null> {
    return this.forUser(userId, async (tx) => {
      const [session] = await tx
        .select()
        .from(workoutSessions)
        .where(and(
          eq(workoutSessions.userId, userId),
          eq(workoutSessions.clientId, clientId),
        ))
        .limit(1);

      return session ? this.mapSessionInTx(tx, session) : null;
    });
  }

  async startSession(
    userId: string,
    routineDayId: string,
    clientId: string,
    localDate: string,
  ): Promise<SessionState> {
    return this.forUser(userId, async (tx) => {
      const [byClient] = await tx
        .select()
        .from(workoutSessions)
        .where(and(
          eq(workoutSessions.userId, userId),
          eq(workoutSessions.clientId, clientId),
        ))
        .limit(1);

      if (byClient) {
        return this.mapSessionInTx(tx, byClient);
      }

      const inserted = await tx
        .insert(workoutSessions)
        .values({
          userId,
          routineDayId,
          clientId,
          localDate,
          status: 'in_progress',
          phase: 'pre_workout',
          source: 'app',
          serverSeq: 0,
        })
        .onConflictDoNothing()
        .returning();

      const created = inserted[0];
      if (created) {
        return this.mapSessionInTx(tx, created);
      }

      const [existingByClient] = await tx
        .select()
        .from(workoutSessions)
        .where(and(
          eq(workoutSessions.userId, userId),
          eq(workoutSessions.clientId, clientId),
        ))
        .limit(1);

      if (existingByClient) {
        return this.mapSessionInTx(tx, existingByClient);
      }

      const [activeSession] = await tx
        .select()
        .from(workoutSessions)
        .where(and(
          eq(workoutSessions.userId, userId),
          eq(workoutSessions.routineDayId, routineDayId),
          eq(workoutSessions.localDate, localDate),
          eq(workoutSessions.status, 'in_progress'),
        ))
        .limit(1);

      if (activeSession) {
        return this.mapSessionInTx(tx, activeSession);
      }

      throw new SessionStartConflictError('Could not resolve the conflicting session start.');
    });
  }

  async applySync(userId: string, request: SyncRequest): Promise<SyncApplyResult> {
    if (request.mutations.length === 0) {
      throw new SyncValidationError('At least one mutation is required.');
    }
    return this.forUser(userId, async (tx) => {
      // Replays must be readable after a session reaches a terminal state. New
      // mutations still go through the lifecycle assertions in the context.
      const session = await this.lockSession(tx, userId, request.mutations[0]?.sessionId);
      const state: MutableState = { current: await this.mapSessionInTx(tx, session) };
      const refreshState = async (): Promise<void> => {
        const [updated] = await tx
          .select()
          .from(workoutSessions)
          .where(and(
            eq(workoutSessions.id, session.id),
            eq(workoutSessions.userId, userId),
          ))
          .limit(1);
        if (!updated) throw new SessionNotFoundError('Session disappeared during sync.');
        state.current = await this.mapSessionInTx(tx, updated);
      };
      const touchedExercises = new Set<string>();
      const context = this.createMutationContext(tx, session, state, refreshState, touchedExercises);
      const receivedAt = new Date();
      const sync = this.syncStore(
        tx,
        userId,
        session,
        context,
        request.deviceId,
        receivedAt,
        request.mutations,
      );
      const result = await new SyncEngine(sync.store).apply(request);
      // M4-28 (#168): the batch's ledger tail — the sequence it claimed, the versions it wrote, its
      // change rows and its `applied` stamps — is one round of statements for the whole request,
      // settled here once the domain loop has decided which mutations actually applied. The answer's
      // `serverSeq` is read back from the bumped session row, not recomputed, so the sequence the
      // client stores is the one the database holds.
      const endServerSeq = await sync.flushTail();
      state.current = { ...state.current, serverSeq: endServerSeq };
      await this.flushPersonalRecords(tx, userId, touchedExercises);
      return { ...result, serverSeq: endServerSeq };
    });
  }

  async mutateSession(
    userId: string,
    sessionId: string,
    operation: SessionMutation,
  ): Promise<SessionState> {
    return this.forUser(userId, async (tx) => {
      const session = await this.lockMutableSession(tx, userId, sessionId);
      const state: MutableState = { current: await this.mapSessionInTx(tx, session) };
      const refreshState = async (): Promise<void> => {
        const [updated] = await tx
          .select()
          .from(workoutSessions)
          .where(and(
            eq(workoutSessions.id, session.id),
            eq(workoutSessions.userId, userId),
          ))
          .limit(1);
        if (!updated) throw new SessionNotFoundError('Session disappeared during mutation.');
        state.current = await this.mapSessionInTx(tx, updated);
      };
      const touchedExercises = new Set<string>();

      await operation(this.createMutationContext(tx, session, state, refreshState, touchedExercises));
      await this.flushPersonalRecords(tx, userId, touchedExercises);
      return state.current;
    });
  }

  private async lockSession(
    tx: Tx,
    userId: string,
    sessionId: string | undefined,
  ): Promise<typeof workoutSessions.$inferSelect> {
    if (!sessionId) throw new SessionNotFoundError('Session not found.');
    const [session] = await tx
      .select()
      .from(workoutSessions)
      .where(and(
        eq(workoutSessions.id, sessionId),
        eq(workoutSessions.userId, userId),
      ))
      .for('update')
      .limit(1);

    if (!session) throw new SessionNotFoundError('Session not found.');
    return session;
  }

  private async lockMutableSession(
    tx: Tx,
    userId: string,
    sessionId: string | undefined,
  ): Promise<typeof workoutSessions.$inferSelect> {
    const session = await this.lockSession(tx, userId, sessionId);
    if (session.status !== 'in_progress') {
      throw new SessionConflictError('Only in-progress sessions can be mutated.');
    }
    return session;
  }

  private createMutationContext(
    tx: Tx,
    session: typeof workoutSessions.$inferSelect,
    state: MutableState,
    refreshState: () => Promise<void>,
    touchedExercises: Set<string>,
  ): SessionMutationContext {
    return {
      get state(): SessionState {
        return state.current;
      },
      upsertSet: async (input: Omit<SessionSetMutation, 'sessionId'>): Promise<void> => {
        assertSetMutationAllowed(state.current, { ...input, sessionId: session.id });
        const [written] = await tx
          .insert(sessionSets)
          .values({
            userId: session.userId,
            sessionId: session.id,
            exerciseId: input.exerciseId,
            setIndex: input.setIndex,
            isCompleted: input.isCompleted,
            weightKg: input.weightKg === null ? null : input.weightKg.toFixed(2),
            reps: input.reps,
            clientTs: input.clientTs,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [sessionSets.sessionId, sessionSets.exerciseId, sessionSets.setIndex],
            set: {
              isCompleted: input.isCompleted,
              weightKg: input.weightKg === null ? null : input.weightKg.toFixed(2),
              reps: input.reps,
              clientTs: input.clientTs,
              updatedAt: new Date(),
            },
          })
          .returning();
        if (!written) throw new Error('Set upsert returned no row.');
        // M4-27 (#167): the per-mutation `refreshState()` remapped the whole session graph to
        // re-derive state this write already knows, and `materializePersonalRecord` ran per set
        // instead of once per distinct exercise. The patch mirrors what the remap produced (the
        // returned row is the DB's canonical copy); the sequence it leaves one step behind
        // belongs to `currentServerSeq()`, same as before.
        state.current = { ...state.current, sets: patchSets(state.current.sets, mapSessionSet(written)) };
        touchedExercises.add(written.exerciseId);
      },
      completeTask: async (input: Omit<SessionTaskMutation, 'sessionId'>): Promise<void> => {
        assertTaskMutationAllowed(state.current, { ...input, sessionId: session.id });
        const [written] = await tx
          .insert(sessionTasks)
          .values({
            sessionId: session.id,
            taskKey: input.taskKey,
            completedAt: input.completedAt,
            clientTs: input.clientTs,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [sessionTasks.sessionId, sessionTasks.taskKey],
            set: {
              completedAt: input.completedAt,
              clientTs: input.clientTs,
              updatedAt: new Date(),
            },
          })
          .returning();
        if (!written) throw new Error('Task upsert returned no row.');
        state.current = { ...state.current, tasks: patchTasks(state.current.tasks, mapSessionTask(written)) };
      },
      advancePhase: async (phase): Promise<void> => {
        assertPhaseAdvance(state.current, phase);
        await tx
          .update(workoutSessions)
          .set({ phase, updatedAt: new Date() })
          .where(and(
            eq(workoutSessions.id, session.id),
            eq(workoutSessions.userId, session.userId),
          ));
        await refreshState();
      },
      finish: async (completedAt): Promise<void> => {
        assertFinishAllowed(state.current);
        assertCompletionTimestamp(completedAt);
        await tx
          .update(workoutSessions)
          .set({ status: 'completed', completedAt, updatedAt: new Date() })
          .where(and(
            eq(workoutSessions.id, session.id),
            eq(workoutSessions.userId, session.userId),
          ));
        await refreshState();
      },
    };
  }

  /**
   * M4-27 (#167): one `materializePersonalRecord` per distinct touched exercise, after the
   * mutation loop but inside the same transaction — a `ProgressionValidationError` still aborts
   * the whole request and the all-or-nothing rollback shape is unchanged. Sorted order gives
   * concurrent batches one deterministic `personal_records` lock sequence.
   */
  private async flushPersonalRecords(
    tx: Tx,
    userId: string,
    touchedExercises: Set<string>,
  ): Promise<void> {
    if (touchedExercises.size === 0) return;
    const progression = new ProgressionEngine(this.progressionStore(tx, userId));
    for (const exerciseId of [...touchedExercises].sort()) {
      await progression.materializePersonalRecord(exerciseId);
    }
  }

  /**
   * The batch's sync seam: one store per request, built around the request's own mutation list.
   *
   * `SyncStore` is unchanged on purpose — `SyncEngine.apply` still asks once per mutation, in
   * order, and still owns every decision (replay, foreign, STALE_CONFLICT, lifecycle rejection).
   * What changed is *when the database is asked*: the reads the loop used to repeat per mutation
   * are prefetched once, on first touch, from the session this transaction already holds
   * `FOR UPDATE`; the writes it used to repeat per applied mutation are buffered and flushed once
   * by `flushTail()`, which the caller must await before the transaction ends (M4-28 / #168).
   */
  private syncStore(
    tx: Tx,
    userId: string,
    session: typeof workoutSessions.$inferSelect,
    context: SessionMutationContext,
    deviceId: string,
    receivedAt: Date,
    batch: readonly SyncMutation[],
  ): { store: SyncStore; flushTail: () => Promise<number> } {
    const versionKey = (entityType: SyncEntityType, entityKey: string): string => `${entityType}|${entityKey}`;

    // ── prefetched reads ────────────────────────────────────────────────────────────────────────
    const reservations = new Map<string, SyncReservation>();
    let reservationsLoaded = false;
    const versionCache = new Map<string, SyncEntityVersion | null>();
    let versionsLoaded = false;

    // ── buffered tail ───────────────────────────────────────────────────────────────────────────
    const pendingVersions = new Map<string, typeof syncEntityVersions.$inferInsert>();
    const pendingChanges: Array<typeof syncChanges.$inferInsert> = [];
    const changeSeqByMutation = new Map<string, number>();
    let allocated = 0;
    let markedApplied = 0;
    let flushed: number | null = null;

    /**
     * One reservation pass for the batch, in three statements instead of two-or-three per mutation.
     *
     * The classification the engine reads is assembled here, not decided here: rows this user can
     * already see are replays, rows this statement claims are new, and a mutation id that neither
     * the read nor the insert can account for belongs to somebody else. `ON CONFLICT DO NOTHING`
     * also absorbs a duplicate id *inside* the batch, where the per-mutation form inserted the
     * first occurrence and then refused the request on the second — the same refusal, one round trip.
     */
    const loadReservations = async (): Promise<void> => {
      const known = new Map<string, SyncMutationRecord>();
      const existing = await tx
        .select()
        .from(syncMutations)
        .where(and(
          eq(syncMutations.userId, userId),
          inArray(syncMutations.mutationId, batch.map((mutation) => mutation.mutationId)),
        ));
      for (const row of existing) known.set(row.mutationId, asSyncMutationRecord(row));

      const unseen = batch.filter((mutation) => !known.has(mutation.mutationId));
      if (unseen.length > 0) {
        const inserted = await tx
          .insert(syncMutations)
          .values(unseen.map((mutation) => ({
            mutationId: mutation.mutationId,
            userId,
            sessionId: session.id,
            deviceId,
            operation: mutation.op,
            payloadHash: canonicalMutationHash(mutation),
            status: 'processing',
            appliedAt: receivedAt,
          })))
          .onConflictDoNothing()
          .returning({ mutationId: syncMutations.mutationId });
        const claimed = new Set(inserted.map((row) => row.mutationId));

        const contested = unseen.filter((mutation) => !claimed.has(mutation.mutationId));
        if (contested.length > 0) {
          const rows = await tx
            .select()
            .from(syncMutations)
            .where(and(
              eq(syncMutations.userId, userId),
              inArray(syncMutations.mutationId, contested.map((mutation) => mutation.mutationId)),
            ));
          for (const row of rows) known.set(row.mutationId, asSyncMutationRecord(row));
        }
        for (const mutation of unseen) {
          if (claimed.has(mutation.mutationId)) reservations.set(mutation.mutationId, { kind: 'new' });
        }
      }

      for (const [mutationId, record] of known) reservations.set(mutationId, { kind: 'existing', record });
      reservationsLoaded = true;
    };

    /**
     * One read of the session's version partition plus the set/task fallbacks for keys it cannot
     * describe, replacing one point read (and up to two fallbacks) per mutation.
     *
     * The read is the whole partition rather than an IN-list of composite keys because it is
     * bounded by the session's own entity count and served by `sessionLookup` — cheaper than
     * building, and trusting, a 60-pair predicate on the hot path.
     */
    const loadVersions = async (): Promise<void> => {
      const wanted = new Map<string, { entityType: SyncEntityType; entityKey: string }>();
      for (const mutation of batch) {
        const entity = mutationEntity(mutation);
        wanted.set(versionKey(entity.entityType, entity.entityKey), entity);
      }

      const rows = await tx
        .select()
        .from(syncEntityVersions)
        .where(and(
          eq(syncEntityVersions.userId, userId),
          eq(syncEntityVersions.sessionId, session.id),
        ));
      for (const row of rows) {
        versionCache.set(versionKey(row.entityType as SyncEntityType, row.entityKey), {
          entityType: row.entityType as SyncEntityType,
          entityKey: row.entityKey,
          clientTs: row.clientTs,
          effectiveTs: row.effectiveTs,
          deviceId: row.deviceId,
          mutationId: row.mutationId,
          serverSeq: row.serverSeq,
          clientSeq: row.clientSeq,
        });
      }

      const missingSets = new Map<string, { exerciseId: string; setIndex: number }>();
      const missingTasks = new Set<string>();
      for (const [key, entity] of wanted) {
        if (versionCache.has(key)) continue;
        if (entity.entityType === 'set') {
          const parsed = parseSetEntityKey(entity.entityKey);
          if (!parsed) versionCache.set(key, null);
          else missingSets.set(`${parsed.exerciseId}:${parsed.setIndex}`, parsed);
        } else if (entity.entityType === 'task') {
          const taskKey = parseTaskEntityKey(entity.entityKey);
          if (!taskKey) versionCache.set(key, null);
          else missingTasks.add(taskKey);
        }
        // 'session' keys intentionally fall through to the zero-version default below.
      }

      if (missingSets.size > 0) {
        const setRows = await tx
          .select()
          .from(sessionSets)
          .where(and(
            eq(sessionSets.userId, userId),
            eq(sessionSets.sessionId, session.id),
            inArray(sessionSets.exerciseId, [...new Set([...missingSets.values()].map((set) => set.exerciseId))]),
          ));
        const setsBySlot = new Map(setRows.map((row) => [`${row.exerciseId}:${row.setIndex}`, row]));
        // Iterate the *wanted* keys, not `missingSets`: the slot string is only the lookup key into
        // `setsBySlot`, and caching under it would leave every engine question a cache miss — the
        // shape that silently turns a stale write into an applied one (caught by the legacy-backfill
        // integration case). `missingSets` is a query parameter list, never a cache key.
        for (const [key, entity] of wanted) {
          if (versionCache.has(key) || entity.entityType !== 'set') continue;
          const parsed = parseSetEntityKey(entity.entityKey);
          if (!parsed) continue;
          const current = setsBySlot.get(`${parsed.exerciseId}:${parsed.setIndex}`);
          versionCache.set(key, current ? {
            entityType: 'set',
            entityKey: entity.entityKey,
            clientTs: current.clientTs,
            effectiveTs: current.clientTs,
            deviceId: ZERO_UUID,
            mutationId: ZERO_UUID,
            serverSeq: 0,
            clientSeq: 0,
          } : null);
        }
      }

      if (missingTasks.size > 0) {
        const taskRows = await tx
          .select()
          .from(sessionTasks)
          .where(and(
            eq(sessionTasks.sessionId, session.id),
            inArray(sessionTasks.taskKey, [...missingTasks] as Array<'warm_up' | 'main_workout' | 'stretch'>),
          ));
        const tasksByKey = new Map(taskRows.map((row) => [row.taskKey, row]));
        for (const [key, entity] of wanted) {
          if (versionCache.has(key) || entity.entityType !== 'task') continue;
          const taskKey = parseTaskEntityKey(entity.entityKey);
          if (!taskKey) continue;
          const current = tasksByKey.get(taskKey as 'warm_up' | 'main_workout' | 'stretch');
          versionCache.set(key, current ? {
            entityType: 'task',
            entityKey: entity.entityKey,
            clientTs: current.clientTs,
            effectiveTs: current.clientTs,
            deviceId: ZERO_UUID,
            mutationId: ZERO_UUID,
            serverSeq: 0,
            clientSeq: 0,
          } : null);
        }
      }

      // Anything still unseen is the session's own state entity: a zero version, not `null`, so the
      // first write on it always wins — the fallback the per-mutation form ended on.
      for (const [key, entity] of wanted) {
        if (versionCache.has(key)) continue;
        versionCache.set(key, {
          entityType: entity.entityType,
          entityKey: entity.entityKey,
          clientTs: new Date(0),
          effectiveTs: new Date(0),
          deviceId: ZERO_UUID,
          mutationId: ZERO_UUID,
          serverSeq: 0,
          clientSeq: 0,
        });
      }

      versionsLoaded = true;
    };

    /**
     * Settle the batch's tail in four statements: claim the sequence, write the versions, write the
     * changes, stamp the mutations. Idempotent, and the only writer of `workout_sessions.server_seq`
     * for this request.
     */
    const flushTail = async (): Promise<number> => {
      if (flushed !== null) return flushed;
      if (allocated !== pendingChanges.length || allocated !== markedApplied) {
        // Unreachable unless the engine's per-mutation call order changes: an applied mutation
        // allocates one sequence, records one change and is stamped once. Loud, never silent.
        throw new Error('Sync tail flush saw an unbalanced mutation ledger.');
      }
      if (allocated === 0) {
        flushed = session.serverSeq;
        return flushed;
      }

      // One claim for the whole batch. `session.serverSeq` is the row this transaction holds
      // `FOR UPDATE` and nothing below moves it, so the r-th applied mutation keeps exactly the
      // sequence the per-mutation increments gave it: contiguous, in order, no wider than the batch.
      const [bumped] = await tx
        .update(workoutSessions)
        .set({ serverSeq: sql`${workoutSessions.serverSeq} + ${allocated}`, updatedAt: new Date() })
        .where(and(
          eq(workoutSessions.id, session.id),
          eq(workoutSessions.userId, userId),
        ))
        .returning({ serverSeq: workoutSessions.serverSeq });
      if (!bumped) throw new SessionNotFoundError('Session disappeared during sync.');

      // Versions: one statement, deduped by entity key keeping the last write — which is what the
      // sequential upserts produced, and what Postgres demands: an `ON CONFLICT DO UPDATE` batch
      // that touches one row twice is rejected outright (`cannot affect row a second time`).
      if (pendingVersions.size > 0) {
        await tx
          .insert(syncEntityVersions)
          .values([...pendingVersions.values()])
          .onConflictDoUpdate({
            target: [syncEntityVersions.sessionId, syncEntityVersions.entityType, syncEntityVersions.entityKey],
            set: {
              clientTs: sql`excluded.client_ts`,
              effectiveTs: sql`excluded.effective_ts`,
              deviceId: sql`excluded.device_id`,
              mutationId: sql`excluded.mutation_id`,
              serverSeq: sql`excluded.server_seq`,
              clientSeq: sql`excluded.client_seq`,
            },
          });
      }

      // Changes and stamps: one row (and one update) per applied mutation, in application order,
      // so a client replaying by sequence replays the order the batch was decided in.
      await tx.insert(syncChanges).values(pendingChanges);

      const seqPairs = sql.join(
        pendingChanges.map((row) => sql`(${row.mutationId}::uuid, ${row.serverSeq}::integer)`),
        sql`, `,
      );
      const stamped = await tx.execute(sql`
        UPDATE sync_mutations AS target
           SET status = 'applied', server_seq = pair.server_seq, rejection_reason = NULL
          FROM (VALUES ${seqPairs}) AS pair(mutation_id, server_seq)
         WHERE target.user_id = ${userId} AND target.mutation_id = pair.mutation_id
      `);
      if (stamped.rowCount !== allocated) {
        throw new Error('Sync tail flush stamped a different number of mutations than it applied.');
      }

      flushed = bumped.serverSeq;
      return flushed;
    };

    const store: SyncStore = {
      sessionId: session.id,
      deviceId,
      receivedAt,
      // One column, not the graph. `allocateSequence` runs *after* the lifecycle write that
      // refreshes `state.current`, so the in-memory copy is one sequence behind — this read is
      // the only correct source for the batch's answer, and it is a single indexed row read on
      // a row this transaction already holds `FOR UPDATE`. (#105 replaced a `getState()` here
      // that re-mapped every set, task, and placement to be thrown away an arm's length away.)
      currentServerSeq: async (): Promise<number> => {
        // Answerable without a read: this transaction holds the session row, nothing else in it
        // moves `server_seq`, and the batch's claim is `allocated` wide — so the settled value is
        // the base plus what this request applied, which is also what `flushTail` writes back.
        return flushed ?? session.serverSeq + allocated;
      },
      reserveMutation: async (mutation: SyncMutation): Promise<SyncReservation> => {
        if (!reservationsLoaded) await loadReservations();
        return reservations.get(mutation.mutationId) ?? { kind: 'foreign' };
      },
      findEntityVersion: async (entityType: SyncEntityType, entityKey: string): Promise<SyncEntityVersion | null> => {
        if (!versionsLoaded) await loadVersions();
        return versionCache.get(versionKey(entityType, entityKey)) ?? null;
      },
      applyMutation: async (mutation: SyncMutation): Promise<void> => {
        switch (mutation.op) {
          case 'set.upsert':
            await context.upsertSet({
              exerciseId: mutation.exerciseId,
              setIndex: mutation.setIndex,
              isCompleted: mutation.isCompleted,
              weightKg: mutation.weightKg,
              reps: mutation.reps,
              clientTs: new Date(mutation.clientTs),
            });
            return;
          case 'task.complete':
            await context.completeTask({
              taskKey: mutation.taskKey,
              completedAt: mutation.completedAt === null ? null : new Date(mutation.completedAt),
              clientTs: new Date(mutation.clientTs),
            });
            return;
          case 'phase.advance':
            await context.advancePhase(mutation.phase);
            return;
          case 'session.finish':
            await context.finish(mutation.completedAt ? new Date(mutation.completedAt) : receivedAt);
            return;
        }
      },
      allocateSequence: async (): Promise<number> => {
        // Arithmetic, not a write: the batch claims its whole range once, in `flushTail`. The r-th
        // applied mutation gets base + r either way, and the surrounding row lock is what makes
        // promising the number here safe.
        allocated += 1;
        return session.serverSeq + allocated;
      },
      upsertEntityVersion: async (version: SyncEntityVersion): Promise<void> => {
        // Write-through, so a later mutation in the same batch comparing against this entity sees
        // this version — the guarantee the immediate write used to provide by landing first.
        versionCache.set(versionKey(version.entityType, version.entityKey), { ...version });
        pendingVersions.set(versionKey(version.entityType, version.entityKey), {
          userId,
          sessionId: session.id,
          entityType: version.entityType,
          entityKey: version.entityKey,
          clientTs: version.clientTs,
          effectiveTs: version.effectiveTs,
          deviceId: version.deviceId,
          mutationId: version.mutationId,
          serverSeq: version.serverSeq,
          clientSeq: version.clientSeq,
        });
      },
      appendChange: async (input): Promise<void> => {
        changeSeqByMutation.set(input.mutationId, input.serverSeq);
        pendingChanges.push({
          userId,
          sessionId: session.id,
          serverSeq: input.serverSeq,
          mutationId: input.mutationId,
          entityType: input.entityType,
          entityKey: input.entityKey,
          operation: input.operation,
        });
      },
      markApplied: async (mutationId: string, serverSeq: number): Promise<void> => {
        if (changeSeqByMutation.get(mutationId) !== serverSeq) {
          throw new Error('Sync tail flush saw a mutation stamped before its change was recorded.');
        }
        markedApplied += 1;
      },
      markRejected: async (mutationId: string, reason: string): Promise<void> => {
        await tx
          .update(syncMutations)
          .set({ status: 'rejected', serverSeq: null, rejectionReason: reason })
          .where(and(
            eq(syncMutations.mutationId, mutationId),
            eq(syncMutations.userId, userId),
          ));
      },
    };

    return { store, flushTail };
  }

  private progressionStore(tx: Tx, userId: string): ProgressionStore {
    return {
      listSets: async (exerciseId: string): Promise<readonly ProgressionSet[]> => {
        const rows = await tx
          .select({
            sessionId: sessionSets.sessionId,
            setIndex: sessionSets.setIndex,
            isCompleted: sessionSets.isCompleted,
            weightKg: sessionSets.weightKg,
            reps: sessionSets.reps,
            clientTs: sessionSets.clientTs,
          })
          .from(sessionSets)
          .innerJoin(workoutSessions, eq(sessionSets.sessionId, workoutSessions.id))
          .where(and(
            eq(sessionSets.userId, userId),
            eq(workoutSessions.userId, userId),
            eq(sessionSets.exerciseId, exerciseId),
            eq(sessionSets.isCompleted, true),
          ));

        return rows.map((row) => ({
          sessionId: row.sessionId,
          setIndex: row.setIndex,
          isCompleted: row.isCompleted,
          weightKg: row.weightKg === null ? null : Number(row.weightKg),
          reps: row.reps,
          clientTs: row.clientTs,
        }));
      },
      lockPersonalRecord: async (exerciseId: string): Promise<PersonalRecordValue | null> => {
        const [record] = await tx
          .select()
          .from(personalRecords)
          .where(and(
            eq(personalRecords.userId, userId),
            eq(personalRecords.exerciseId, exerciseId),
          ))
          .for('update')
          .limit(1);

        return record ? {
          exerciseId: record.exerciseId,
          bestE1rm: Number(record.bestE1rm),
          achievedAt: record.achievedAt,
          sessionId: record.sessionId,
        } : null;
      },
      insertPersonalRecordIfAbsent: async (record: PersonalRecordValue): Promise<boolean> => {
        const inserted = await tx
          .insert(personalRecords)
          .values({
            userId,
            exerciseId: record.exerciseId,
            bestE1rm: record.bestE1rm.toFixed(2),
            achievedAt: record.achievedAt,
            sessionId: record.sessionId,
            updatedAt: new Date(),
          })
          .onConflictDoNothing({
            target: [personalRecords.userId, personalRecords.exerciseId],
          })
          .returning({ id: personalRecords.id });
        return inserted.length > 0;
      },
      replacePersonalRecord: async (record: PersonalRecordValue): Promise<void> => {
        await tx
          .update(personalRecords)
          .set({
            bestE1rm: record.bestE1rm.toFixed(2),
            achievedAt: record.achievedAt,
            sessionId: record.sessionId,
            updatedAt: new Date(),
          })
          .where(and(
            eq(personalRecords.userId, userId),
            eq(personalRecords.exerciseId, record.exerciseId),
          ));
      },
      deletePersonalRecord: async (exerciseId: string): Promise<void> => {
        await tx
          .delete(personalRecords)
          .where(and(
            eq(personalRecords.userId, userId),
            eq(personalRecords.exerciseId, exerciseId),
          ));
      },
    };
  }

  private forUser<T>(userId: string, operation: (tx: Tx) => Promise<T>): Promise<T> {
    assertUserContext(userId, this.claims);
    return withUser(this.db, this.claims, operation);
  }

  private async findSessionInTx(
    tx: Tx,
    userId: string,
    sessionId: string,
  ): Promise<SessionState | null> {
    const [session] = await tx
      .select()
      .from(workoutSessions)
      .where(and(
        eq(workoutSessions.id, sessionId),
        eq(workoutSessions.userId, userId),
      ))
      .limit(1);

    return session ? this.mapSessionInTx(tx, session) : null;
  }

  private async mapSessionInTx(
    tx: Tx,
    session: typeof workoutSessions.$inferSelect,
  ): Promise<SessionState> {
    const [routineDay] = await tx
      .select()
      .from(routineDays)
      .where(eq(routineDays.id, session.routineDayId))
      .limit(1);

    if (!routineDay) {
      throw new Error(`Routine day ${session.routineDayId} is not visible to the current user.`);
    }

    const planRows: PlanRow[] = await tx
      .select({ placement: routineExercises, exercise: exercises })
      .from(routineExercises)
      .innerJoin(exercises, eq(routineExercises.exerciseId, exercises.id))
      .where(eq(routineExercises.routineDayId, routineDay.id))
      .orderBy(asc(routineExercises.orderIndex));

    const plan = orderPlan(planRows.map(({ placement, exercise }) =>
      mapRoutineExercisePlan(placement, exercise)));

    const setRows = await tx
      .select()
      .from(sessionSets)
      .where(and(
        eq(sessionSets.sessionId, session.id),
        eq(sessionSets.userId, session.userId),
      ))
      .orderBy(asc(sessionSets.exerciseId), asc(sessionSets.setIndex));

    const taskRows = await tx
      .select()
      .from(sessionTasks)
      .where(eq(sessionTasks.sessionId, session.id))
      .orderBy(asc(sessionTasks.taskKey));

    return mapSessionState(
      session,
      routineDay,
      plan,
      setRows.map(mapSessionSet),
      taskRows.map(mapSessionTask),
    );
  }
}
