import { describe, expect, it } from 'vitest';
import type { SyncMutation } from '../../../lib/contracts/sync';
import { Outbox, OutboxQuotaExceededError } from '../../../src/app/state/outbox';
import { SESSION, EXERCISE, id, makeOutbox, MemoryStorage } from './fixtures';

/**
 * M3-05 (#62) — RFC §4.3's invariants, each as a named test.
 *
 * These run against `MemoryStorage` from `./fixtures`, and that is the whole argument
 * for the seam: the invariants are about durability, id order, and idempotency-key
 * lifetime, none of which need IndexedDB to state, and all of which would be
 * untestable in a unit suite if `Outbox` had reached for `indexedDB` itself. The
 * browser half (`indexeddb-outbox-storage.ts`) is exercised by M3-06's E2E specs.
 */

function setUpsert(outbox: Outbox, setIndex: number, isCompleted = true): SyncMutation {
  return {
    op: 'set.upsert',
    mutationId: outbox.nextMutationId(),
    clientTs: '2026-09-11T09:00:00.000Z',
    sessionId: SESSION,
    exerciseId: EXERCISE,
    setIndex,
    isCompleted,
    weightKg: 100,
    reps: 8,
  };
}

describe('Outbox — RFC §4.3 invariants', () => {
  it('durable before acknowledged: enqueue resolves only after storage holds the row', async () => {
    const { outbox, storage } = makeOutbox();
    const stored = await outbox.enqueue(setUpsert(outbox, 0));

    // The assertion is about *when* the promise resolves: if storage had not been
    // written, the row would not be readable here. A tap may paint optimistically
    // before this, but the promise a caller awaits is this one.
    expect(storage.rows).toHaveLength(1);
    expect(stored.seq).toBe(0);
    expect(await outbox.pendingCount()).toBe(1);
  });

  it('a storage failure rejects loudly rather than dropping the tap', async () => {
    const storage = new MemoryStorage();
    storage.putImpl = async () => {
      throw new Error('QuotaExceededError');
    };
    const { outbox } = makeOutbox(storage);

    // The dangerous outcome is silence: a vanished tap looks exactly like a saved
    // one until the workout is over. The error is typed so callers can distinguish
    // "out of quota, degrade to online-only" from "no signal, keep queueing".
    await expect(outbox.enqueue(setUpsert(outbox, 0))).rejects.toBeInstanceOf(OutboxQuotaExceededError);
    expect(storage.rows).toHaveLength(0);
  });

  it('idempotent forever: the mutationId is generated once and never regenerated', async () => {
    const { outbox, storage } = makeOutbox();
    const mutation = setUpsert(outbox, 0);
    const originalId = mutation.mutationId;

    await outbox.enqueue(mutation);
    // Retries and backoff touch `attempt` only. A new id per attempt is exactly how
    // a lost response becomes a duplicated set, so the id is asserted after a
    // retry-recording pass too.
    await outbox.recordAttempt(originalId, 3);
    await outbox.recordAttempt(originalId, 4);

    expect(storage.rows.map((row) => row.mutationId)).toEqual([originalId]);
    const [row] = await outbox.peek();
    expect(row?.mutationId).toBe(originalId);
    expect(row?.attempt).toBe(4);
  });

  it('orders by seq even when createdAt says otherwise', async () => {
    const storage = new MemoryStorage();
    const { outbox } = makeOutbox(storage);

    // Rows written directly, with `createdAt` running *against* `seq`. That is the
    // case the rule exists for: a device clock can move backwards (NTP correction,
    // timezone change, a user fixing the date), and a queue that sorted by wall time
    // would silently reorder a workout's taps. `createdAt` is diagnosis-only.
    storage.rows = [0, 1, 2].map((index) => ({
      mutationId: id(900 + index),
      sessionId: SESSION,
      seq: index,
      payload: {
        op: 'set.upsert',
        mutationId: id(900 + index),
        clientTs: '2026-09-11T09:00:00.000Z',
        sessionId: SESSION,
        exerciseId: EXERCISE,
        setIndex: index,
        isCompleted: true,
        weightKg: 100,
        reps: 8,
      },
      attempt: 0,
      createdAt: 1_700_000_000_000 - index * 60_000,
    }));

    const queued = await outbox.peek();
    expect(queued.map((row) => row.seq)).toEqual([0, 1, 2]);
    // Narrowed through the op discriminant: reading `setIndex` off the union without
    // checking `op` is exactly the mistake the discriminated union exists to prevent.
    expect(queued.map((row) => (row.payload.op === 'set.upsert' ? row.payload.setIndex : -1)))
      .toEqual([0, 1, 2]);
  });

  it('assigns seq in enqueue order, so the queue is FIFO by construction', async () => {
    const { outbox } = makeOutbox();
    // Enqueue deliberately out of set order: `seq` is the order taps arrived, not the
    // order sets appear in the plan. Sending them in plan order would reorder a
    // user's actions, and the server would see a set completed before it was opened.
    await outbox.enqueue(setUpsert(outbox, 1));
    await outbox.enqueue(setUpsert(outbox, 2));
    await outbox.enqueue(setUpsert(outbox, 0));

    const queued = await outbox.peek();
    expect(queued.map((row) => (row.payload.op === 'set.upsert' ? row.payload.setIndex : -1)))
      .toEqual([1, 2, 0]);
    expect(queued.map((row) => row.seq)).toEqual([0, 1, 2]);
  });

  it('keeps sessions separate, so a batch can never span two (contract requirement)', async () => {
    const storage = new MemoryStorage();
    const otherSession = '44444444-4444-4444-8444-444444444444';
    const { outbox } = makeOutbox(storage, SESSION);
    const { outbox: other } = makeOutbox(storage, otherSession);

    await outbox.enqueue(setUpsert(outbox, 0));
    await other.enqueue({ ...setUpsert(other, 0), sessionId: otherSession });

    expect(await outbox.peek()).toHaveLength(1);
    expect(await other.peek()).toHaveLength(1);
    // SyncRequestSchema refuses a batch whose mutations target two sessions, so the
    // partition has to exist before the request is built.
    expect(storage.rows.map((row) => row.sessionId).sort()).toEqual([SESSION, otherSession].sort());
  });

  it('marks applied ids exactly, and never clears the batch wholesale', async () => {
    const { outbox, storage } = makeOutbox();
    const a = await outbox.enqueue(setUpsert(outbox, 0));
    const b = await outbox.enqueue(setUpsert(outbox, 1));
    const c = await outbox.enqueue(setUpsert(outbox, 2));

    // A partially-applied batch (§8.2): only `a` and `c` confirmed.
    await outbox.markApplied([a.mutationId, c.mutationId]);

    expect(storage.deletes).toEqual([[a.mutationId, c.mutationId]]);
    const remaining = await outbox.peek();
    expect(remaining.map((row) => row.mutationId)).toEqual([b.mutationId]);
  });

  it('discards refused mutations by id, and reports that it did', async () => {
    const { outbox, storage } = makeOutbox();
    const a = await outbox.enqueue(setUpsert(outbox, 0));
    const b = await outbox.enqueue(setUpsert(outbox, 1));

    await outbox.discardRefused([b.mutationId]);
    // Named separately from `markApplied` on purpose: a refused mutation and an
    // acknowledged one both leave the queue, and the UI has to be able to tell that
    // this one happened *to* the user rather than *because of* them.
    expect(storage.deletes).toEqual([[b.mutationId]]);
    expect((await outbox.peek()).map((row) => row.mutationId)).toEqual([a.mutationId]);
  });

  it('caps a batch at the contract maximum without dropping the remainder', async () => {
    const { outbox } = makeOutbox();
    for (let index = 0; index < 205; index += 1) {
      await outbox.enqueue(setUpsert(outbox, index % 50));
    }

    const batch = await outbox.peek(200);
    expect(batch).toHaveLength(200);
    // The five that did not fit stay queued: a cap that discarded them would lose
    // taps silently at exactly the moment a long workout was flushed.
    expect(await outbox.pendingCount()).toBe(205);
  });
});
