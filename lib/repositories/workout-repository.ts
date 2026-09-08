import { and, asc, desc, eq, lt, or } from 'drizzle-orm';
import * as schema from '../../db/schema/index';
import { assertUserContext } from '../db/auth-context';
import { withUser } from '../db/with-user';
import type { Db, Tx, JwtClaims } from '../db/with-user';
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
  routineDays,
  routineExercises,
  sessionSets,
  sessionTasks,
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

  async mutateSession(
    userId: string,
    sessionId: string,
    operation: SessionMutation,
  ): Promise<SessionState> {
    return this.forUser(userId, async (tx) => {
      const [session] = await tx
        .select()
        .from(workoutSessions)
        .where(and(
          eq(workoutSessions.id, sessionId),
          eq(workoutSessions.userId, userId),
        ))
        .for('update')
        .limit(1);

      if (!session) {
        throw new SessionNotFoundError('Session not found.');
      }
      if (session.status !== 'in_progress') {
        throw new SessionConflictError('Only in-progress sessions can be mutated.');
      }

      let currentState = await this.mapSessionInTx(tx, session);
      const refreshState = async (): Promise<void> => {
        const [updated] = await tx
          .select()
          .from(workoutSessions)
          .where(and(
            eq(workoutSessions.id, session.id),
            eq(workoutSessions.userId, userId),
          ))
          .limit(1);
        if (!updated) {
          throw new SessionNotFoundError('Session disappeared during mutation.');
        }
        currentState = await this.mapSessionInTx(tx, updated);
      };

      const context: SessionMutationContext = {
        get state(): SessionState {
          return currentState;
        },
        upsertSet: async (input: Omit<SessionSetMutation, 'sessionId'>): Promise<void> => {
          assertSetMutationAllowed(currentState, { ...input, sessionId: session.id });
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
          await refreshState();
        },
        completeTask: async (input: Omit<SessionTaskMutation, 'sessionId'>): Promise<void> => {
          assertTaskMutationAllowed(currentState, { ...input, sessionId: session.id });
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
          assertPhaseAdvance(currentState, phase);
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
          assertFinishAllowed(currentState);
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

      await operation(context);
      return currentState;
    });
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
