import type { SyncMutation } from '../../../lib/contracts/sync';
import type { SessionView } from '../../../lib/views/session-view';
import type { OutboxStorage, StoredMutation } from '../../../src/app/state/outbox';
import { Outbox } from '../../../src/app/state/outbox';

/**
 * Shared fixtures for the M3-05 (#62) state tests.
 *
 * Deliberately a non-`.test.ts` file: vitest's include pattern matches only test
 * files, so this is imported rather than collected. The helpers exist because both the pure
 * reconciliation tests and the engine tests need the same *server view* and the same
 * mutation builders, and a divergent copy of a fixture is how two test files end up
 * agreeing with each other and disagreeing with the contract.
 *
 * Only storage-level helpers live here. Anything that has to construct a `SyncEngine`
 * belongs in `sync-engine.test.ts`, so this module never imports the file whose
 * commits are supposed to arrive after it.
 */

export const SESSION = '11111111-1111-4111-8111-111111111111';
export const EXERCISE = '22222222-2222-4222-8222-222222222222';
/** A stretch placement's exercise id: legal to display, impossible to store a set on. */
export const STRETCH_EXERCISE = '44444444-4444-4444-8444-444444444444';
export const DEVICE = '33333333-3333-4333-8333-333333333333';

/** Deterministic uuid-shaped ids, so a test can assert on identity precisely. */
export function id(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

export function stored(seq: number, payload: SyncMutation, attempt = 0): StoredMutation {
  return { mutationId: payload.mutationId, sessionId: SESSION, seq, payload, attempt, createdAt: 0 };
}

export function setMutation(n: number, setIndex: number): SyncMutation {
  return {
    op: 'set.upsert',
    mutationId: id(n),
    clientTs: '2026-09-11T09:00:00.000Z',
    sessionId: SESSION,
    exerciseId: EXERCISE,
    setIndex,
    isCompleted: true,
    weightKg: 100,
    reps: 8,
  };
}

/** The server's view of one exercise with three unstarted sets. */
export function serverView(): SessionView {
  return {
    id: SESSION,
    routineDayId: SESSION,
    status: 'in_progress',
    phase: 'exercise',
    localDate: '2026-09-11',
    routineDay: {
      id: SESSION,
      name: 'Push Day',
      exercises: [
        {
          id: SESSION,
          phase: 'main_workout',
          orderIndex: 0,
          targetSets: 3,
          targetReps: null,
          exercise: { id: EXERCISE, slug: 'bench-press', name: 'Bench Press', kind: 'strength' },
        },
        {
          id: '55555555-5555-5555-8555-555555555555',
          phase: 'stretch',
          orderIndex: 1,
          targetSets: 2,
          targetReps: null,
          exercise: { id: STRETCH_EXERCISE, slug: 'overhead-stretch', name: 'Overhead Stretch', kind: 'stretch' },
        },
      ],
    },
    // Empty by default: like `sets`, task rows only exist once completed, so a session
  // that has done nothing has none. Tests that need one pass it explicitly.
  // #64: the view now carries the session clock's endpoints, so the fixture must too.
  startedAt: '2026-09-11T17:00:00.000Z',
  completedAt: null as string | null,
  tasks: [] as {
    id: string;
    sessionId: string;
    taskKey: 'warm_up' | 'main_workout' | 'stretch';
    completedAt: string | null;
  }[],
  sets: [0, 1, 2].map((setIndex) => ({
      id: id(50 + setIndex),
      sessionId: SESSION,
      exerciseId: EXERCISE,
      setIndex,
      isCompleted: false,
      weightKg: null,
      reps: null,
    })),
  };
}

/** Storage that records calls, so ordering and deletion are assertable. */
export class MemoryStorage implements OutboxStorage {
  rows: StoredMutation[] = [];
  deletes: string[][] = [];
  putImpl: ((mutation: StoredMutation) => Promise<void>) | null = null;

  async put(mutation: StoredMutation): Promise<void> {
    if (this.putImpl !== null) return this.putImpl(mutation);
    this.rows.push({ ...mutation });
  }

  async delete(mutationIds: readonly string[]): Promise<void> {
    this.deletes.push([...mutationIds]);
    this.rows = this.rows.filter((row) => !mutationIds.includes(row.mutationId));
  }

  /**
   * Counted so a test can say something about cost, not just results: `enqueue` must not
   * read the whole queue to find the next `seq`.
   */
  listCalls = 0;

  async lastSeq(sessionId: string): Promise<number> {
    return this.rows
      .filter((row) => row.sessionId === sessionId)
      .reduce((highest, row) => Math.max(highest, row.seq), -1);
  }

  async list(sessionId: string): Promise<StoredMutation[]> {
    this.listCalls += 1;
    return this.rows.filter((row) => row.sessionId === sessionId).sort((a, b) => a.seq - b.seq);
  }

  async updateAttempt(mutationId: string, attempt: number): Promise<void> {
    const row = this.rows.find((candidate) => candidate.mutationId === mutationId);
    if (row) row.attempt = attempt;
  }
}

export function makeOutbox(storage = new MemoryStorage(), sessionId = SESSION) {
  let counter = 0;
  return {
    storage,
    outbox: new Outbox(sessionId, {
      storage,
      now: () => 1_700_000_000_000,
      newId: () => id(++counter),
    }),
  };
}
