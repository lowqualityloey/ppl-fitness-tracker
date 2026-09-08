import {
  ProgressionValidationError,
  type E1rmInput,
  type PersonalRecordValue,
  type ProgressionSet,
  type ProgressionStore,
} from './types';

export const MAX_PROGRESSABLE_E1RM = 9999.99;

function assertProgressionInput(input: E1rmInput): void {
  if (typeof input.isCompleted !== 'boolean') {
    throw new ProgressionValidationError('Set completion must be a boolean.');
  }
  if (
    input.weightKg !== null &&
    (!Number.isFinite(input.weightKg) || input.weightKg < 0 || input.weightKg > 1000)
  ) {
    throw new ProgressionValidationError('Weight must be null or a finite value from 0 through 1000 kg.');
  }
  if (
    input.reps !== null &&
    (!Number.isInteger(input.reps) || input.reps < 0 || input.reps > 1000)
  ) {
    throw new ProgressionValidationError('Reps must be null or an integer from 0 through 1000.');
  }
}

function roundToTwoDecimals(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isValidDate(value: Date): boolean {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/**
 * Calculates an Epley one-rep max in canonical kilograms.
 *
 * Incomplete sets, nullable inputs, and zero values are valid logs but are not
 * progressable. The PR column is numeric(6,2), so values above its safe range
 * are rejected before a transaction can persist an unrepresentable record.
 */
export function calculateE1rm(input: E1rmInput): number | null {
  assertProgressionInput(input);
  if (
    !input.isCompleted ||
    input.weightKg === null ||
    input.reps === null ||
    input.weightKg === 0 ||
    input.reps === 0
  ) {
    return null;
  }

  const rounded = roundToTwoDecimals(input.weightKg * (1 + input.reps / 30));
  if (!Number.isFinite(rounded) || rounded > MAX_PROGRESSABLE_E1RM) {
    throw new ProgressionValidationError('Calculated e1RM exceeds the supported personal-record range.');
  }
  return rounded;
}

interface ProgressionCandidate {
  exerciseId: string;
  sessionId: string;
  setIndex: number;
  bestE1rm: number;
  achievedAt: Date;
}

function compareCandidates(left: ProgressionCandidate, right: ProgressionCandidate): number {
  if (left.bestE1rm !== right.bestE1rm) return right.bestE1rm - left.bestE1rm;
  const timeOrder = right.achievedAt.getTime() - left.achievedAt.getTime();
  if (timeOrder !== 0) return timeOrder;
  const sessionOrder = left.sessionId.localeCompare(right.sessionId);
  return sessionOrder || left.setIndex - right.setIndex;
}

function sameRecord(left: PersonalRecordValue, right: PersonalRecordValue): boolean {
  return left.exerciseId === right.exerciseId &&
    left.bestE1rm === right.bestE1rm &&
    left.achievedAt.getTime() === right.achievedAt.getTime() &&
    left.sessionId === right.sessionId;
}

export class ProgressionEngine {
  constructor(private readonly store: ProgressionStore) {}

  calculateE1rm(input: E1rmInput): number | null {
    return calculateE1rm(input);
  }

  async materializePersonalRecord(exerciseId: string): Promise<PersonalRecordValue | null> {
    let current = await this.store.lockPersonalRecord(exerciseId);
    let best = this.findBest(exerciseId, await this.store.listSets(exerciseId));

    if (!best) {
      if (current) await this.store.deletePersonalRecord(exerciseId);
      return null;
    }

    const record = this.toRecord(best);
    if (!current) {
      const inserted = await this.store.insertPersonalRecordIfAbsent(record);
      if (inserted) return record;

      // Another transaction won the natural-key race. Lock its row and rerun
      // the candidate query so a lower concurrent set cannot overwrite it.
      current = await this.store.lockPersonalRecord(exerciseId);
      best = this.findBest(exerciseId, await this.store.listSets(exerciseId));
      if (!best) {
        if (current) await this.store.deletePersonalRecord(exerciseId);
        return null;
      }
    }

    const refreshedRecord = this.toRecord(best);
    if (current && sameRecord(current, refreshedRecord)) return current;
    await this.store.replacePersonalRecord(refreshedRecord);
    return refreshedRecord;
  }

  private toRecord(candidate: ProgressionCandidate): PersonalRecordValue {
    return {
      exerciseId: candidate.exerciseId,
      bestE1rm: candidate.bestE1rm,
      achievedAt: candidate.achievedAt,
      sessionId: candidate.sessionId,
    };
  }

  private findBest(exerciseId: string, sets: readonly ProgressionSet[]): ProgressionCandidate | null {
    const candidates: ProgressionCandidate[] = [];
    for (const set of sets) {
      if (!isValidDate(set.clientTs)) {
        throw new ProgressionValidationError('Set client timestamp must be a valid date.');
      }
      const bestE1rm = this.calculateE1rm(set);
      if (bestE1rm === null) continue;
      candidates.push({
        exerciseId,
        sessionId: set.sessionId,
        setIndex: set.setIndex,
        bestE1rm,
        achievedAt: set.clientTs,
      });
    }

    candidates.sort(compareCandidates);
    const best = candidates[0];
    return best ? best : null;
  }
}
