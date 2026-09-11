import { and, asc, desc, eq, inArray, isNotNull, lt, ne, or, sql } from 'drizzle-orm';
import * as schema from '../../db/schema/index';
import { assertUserContext } from '../db/auth-context';
import { withUser } from '../db/with-user';
import type { Db, Tx, JwtClaims } from '../db/with-user';
import type { SyncMutation, SyncRequest } from '../contracts/sync';
import type { PrefillData, SessionSummary } from '../contracts/sessions';
import { SyncEngine, ZERO_UUID } from '../domain/sync/sync-engine';
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
  SessionState,
  SessionTaskMutation,
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
      const context = this.createMutationContext(tx, session, state, refreshState);
      const receivedAt = new Date();
      const store = this.syncStore(
        tx,
        userId,
        session,
        context,
        state,
        refreshState,
        request.deviceId,
        receivedAt,
      );
      return new SyncEngine(store).apply(request);
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

      await operation(this.createMutationContext(tx, session, state, refreshState));
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
  ): SessionMutationContext {
    const progression = new ProgressionEngine(this.progressionStore(tx, session.userId));
    return {
      get state(): SessionState {
        return state.current;
      },
      upsertSet: async (input: Omit<SessionSetMutation, 'sessionId'>): Promise<void> => {
        assertSetMutationAllowed(state.current, { ...input, sessionId: session.id });
        await tx
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
          });
        await progression.materializePersonalRecord(input.exerciseId);
        await refreshState();
      },
      completeTask: async (input: Omit<SessionTaskMutation, 'sessionId'>): Promise<void> => {
        assertTaskMutationAllowed(state.current, { ...input, sessionId: session.id });
        await tx
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
          });
        await refreshState();
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

  private syncStore(
    tx: Tx,
    userId: string,
    session: typeof workoutSessions.$inferSelect,
    context: SessionMutationContext,
    state: MutableState,
    refreshState: () => Promise<void>,
    deviceId: string,
    receivedAt: Date,
  ): SyncStore {
    return {
      sessionId: session.id,
      deviceId,
      receivedAt,
      getState: async (): Promise<SessionState> => {
        await refreshState();
        return state.current;
      },
      reserveMutation: async (mutation: SyncMutation, payloadHash: string): Promise<SyncReservation> => {
        const [existing] = await tx
          .select()
          .from(syncMutations)
          .where(and(
            eq(syncMutations.mutationId, mutation.mutationId),
            eq(syncMutations.userId, userId),
          ))
          .limit(1);
        if (existing) return { kind: 'existing', record: asSyncMutationRecord(existing) };

        const [inserted] = await tx
          .insert(syncMutations)
          .values({
            mutationId: mutation.mutationId,
            userId,
            sessionId: session.id,
            deviceId,
            operation: mutation.op,
            payloadHash,
            status: 'processing',
            appliedAt: receivedAt,
          })
          .onConflictDoNothing()
          .returning({ mutationId: syncMutations.mutationId });
        if (inserted) return { kind: 'new' };

        const [afterConflict] = await tx
          .select()
          .from(syncMutations)
          .where(and(
            eq(syncMutations.mutationId, mutation.mutationId),
            eq(syncMutations.userId, userId),
          ))
          .limit(1);
        return afterConflict
          ? { kind: 'existing', record: asSyncMutationRecord(afterConflict) }
          : { kind: 'foreign' };
      },
      findEntityVersion: async (entityType: SyncEntityType, entityKey: string): Promise<SyncEntityVersion | null> => {
        const [version] = await tx
          .select()
          .from(syncEntityVersions)
          .where(and(
            eq(syncEntityVersions.userId, userId),
            eq(syncEntityVersions.sessionId, session.id),
            eq(syncEntityVersions.entityType, entityType),
            eq(syncEntityVersions.entityKey, entityKey),
          ))
          .limit(1);
        if (version) {
          return {
            entityType: version.entityType as SyncEntityType,
            entityKey: version.entityKey,
            clientTs: version.clientTs,
            effectiveTs: version.effectiveTs,
            deviceId: version.deviceId,
            mutationId: version.mutationId,
            serverSeq: version.serverSeq,
          };
        }

        if (entityType === 'set') {
          const parsed = parseSetEntityKey(entityKey);
          if (!parsed) return null;
          const [current] = await tx
            .select()
            .from(sessionSets)
            .where(and(
              eq(sessionSets.userId, userId),
              eq(sessionSets.sessionId, session.id),
              eq(sessionSets.exerciseId, parsed.exerciseId),
              eq(sessionSets.setIndex, parsed.setIndex),
            ))
            .limit(1);
          return current ? {
            entityType,
            entityKey,
            clientTs: current.clientTs,
            effectiveTs: current.clientTs,
            deviceId: ZERO_UUID,
            mutationId: ZERO_UUID,
            serverSeq: 0,
          } : null;
        }

        if (entityType === 'task') {
          const taskKey = parseTaskEntityKey(entityKey);
          if (!taskKey) return null;
          const [current] = await tx
            .select()
            .from(sessionTasks)
            .where(and(eq(sessionTasks.sessionId, session.id), eq(sessionTasks.taskKey, taskKey as 'warm_up' | 'main_workout' | 'stretch')))
            .limit(1);
          return current ? {
            entityType,
            entityKey,
            clientTs: current.clientTs,
            effectiveTs: current.clientTs,
            deviceId: ZERO_UUID,
            mutationId: ZERO_UUID,
            serverSeq: 0,
          } : null;
        }

        return {
          entityType,
          entityKey,
          clientTs: new Date(0),
          effectiveTs: new Date(0),
          deviceId: ZERO_UUID,
          mutationId: ZERO_UUID,
          serverSeq: 0,
        };
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
        const [updated] = await tx
          .update(workoutSessions)
          .set({ serverSeq: sql`${workoutSessions.serverSeq} + 1`, updatedAt: new Date() })
          .where(and(
            eq(workoutSessions.id, session.id),
            eq(workoutSessions.userId, userId),
          ))
          .returning({ serverSeq: workoutSessions.serverSeq });
        if (!updated) throw new SessionNotFoundError('Session disappeared during sync.');
        return updated.serverSeq;
      },
      upsertEntityVersion: async (version: SyncEntityVersion): Promise<void> => {
        await tx
          .insert(syncEntityVersions)
          .values({
            userId,
            sessionId: session.id,
            entityType: version.entityType,
            entityKey: version.entityKey,
            clientTs: version.clientTs,
            effectiveTs: version.effectiveTs,
            deviceId: version.deviceId,
            mutationId: version.mutationId,
            serverSeq: version.serverSeq,
          })
          .onConflictDoUpdate({
            target: [syncEntityVersions.sessionId, syncEntityVersions.entityType, syncEntityVersions.entityKey],
            set: {
              clientTs: version.clientTs,
              effectiveTs: version.effectiveTs,
              deviceId: version.deviceId,
              mutationId: version.mutationId,
              serverSeq: version.serverSeq,
            },
          });
      },
      appendChange: async (input): Promise<void> => {
        await tx.insert(syncChanges).values({
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
        await tx
          .update(syncMutations)
          .set({ status: 'applied', serverSeq, rejectionReason: null })
          .where(and(
            eq(syncMutations.mutationId, mutationId),
            eq(syncMutations.userId, userId),
          ));
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
