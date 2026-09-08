import { WorkoutRepository } from '../../repositories/workout-repository';
import {
  assertCompletionTimestamp,
  assertFinishAllowed,
  assertPhaseAdvance,
  assertSetMutationAllowed,
  assertTaskMutationAllowed,
} from './transition-table';
import {
  SessionValidationError,
  type SessionPhase,
  type SessionState,
  type TaskKey,
} from './types';

export interface CompleteSetInput {
  sessionId: string;
  exerciseId: string;
  setIndex: number;
  isCompleted: boolean;
  weightKg: number | null;
  reps: number | null;
  clientTs?: Date;
}

export interface CompleteTaskInput {
  sessionId: string;
  taskKey: TaskKey;
  completedAt: Date | null;
  clientTs?: Date;
}

export interface AdvancePhaseInput {
  sessionId: string;
  phase: SessionPhase;
}

export interface FinishSessionInput {
  sessionId: string;
  completedAt?: Date;
}

function currentUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function assertLocalDate(value: string): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new SessionValidationError('Local date must use YYYY-MM-DD format.');

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new SessionValidationError('Local date is not a real calendar date.');
  }
}

export class SessionEngine {
  constructor(private readonly repository: WorkoutRepository) {}

  start(
    userId: string,
    routineDayId: string,
    clientId: string,
    localDate = currentUtcDate(),
  ): Promise<SessionState> {
    assertLocalDate(localDate);
    return this.repository.startSession(userId, routineDayId, clientId, localDate);
  }

  completeSet(userId: string, input: CompleteSetInput): Promise<SessionState> {
    const clientTs = input.clientTs ?? new Date();
    return this.repository.mutateSession(userId, input.sessionId, async (mutation) => {
      assertSetMutationAllowed(mutation.state, { ...input, clientTs });
      await mutation.upsertSet({
        exerciseId: input.exerciseId,
        setIndex: input.setIndex,
        isCompleted: input.isCompleted,
        weightKg: input.weightKg,
        reps: input.reps,
        clientTs,
      });
    });
  }

  completeTask(userId: string, input: CompleteTaskInput): Promise<SessionState> {
    const clientTs = input.clientTs ?? new Date();
    return this.repository.mutateSession(userId, input.sessionId, async (mutation) => {
      assertTaskMutationAllowed(mutation.state, { ...input, clientTs });
      await mutation.completeTask({
        taskKey: input.taskKey,
        completedAt: input.completedAt,
        clientTs,
      });
    });
  }

  advancePhase(userId: string, input: AdvancePhaseInput): Promise<SessionState> {
    return this.repository.mutateSession(userId, input.sessionId, async (mutation) => {
      assertPhaseAdvance(mutation.state, input.phase);
      await mutation.advancePhase(input.phase);
    });
  }

  finish(userId: string, input: FinishSessionInput): Promise<SessionState> {
    const completedAt = input.completedAt ?? new Date();
    assertCompletionTimestamp(completedAt);

    return this.repository.mutateSession(userId, input.sessionId, async (mutation) => {
      assertFinishAllowed(mutation.state);
      await mutation.finish(completedAt);
    });
  }
}
