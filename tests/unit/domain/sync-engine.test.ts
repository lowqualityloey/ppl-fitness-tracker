import { describe, expect, it } from 'vitest';
import type { SyncMutation, SyncRequest } from '../../../lib/contracts/sync';
import {
  canonicalMutationHash,
  clockSkewMs,
  compareEntityVersions,
  normalizeClientTimestamp,
  SyncEngine,
} from '../../../lib/domain/sync/sync-engine';
import { SessionConflictError } from '../../../lib/domain/sessions/types';
import type {
  SyncEntityType,
  SyncEntityVersion,
  SyncMutationRecord,
  SyncReservation,
  SyncStore,
} from '../../../lib/domain/sync/types';

const sessionId = '11111111-1111-4111-8111-111111111111';
const exerciseId = '22222222-2222-4222-8222-222222222222';
const deviceA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const deviceB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const receivedAt = new Date('2026-09-08T12:00:00.000Z');

function mutation(overrides: Partial<SyncMutation> = {}): SyncMutation {
  return {
    op: 'set.upsert',
    mutationId: '33333333-3333-4333-8333-333333333333',
    clientTs: '2026-09-08T12:00:00.000Z',
    sessionId,
    exerciseId,
    setIndex: 0,
    isCompleted: true,
    weightKg: 60,
    reps: 8,
    ...overrides,
  } as SyncMutation;
}

function request(mutations: SyncMutation[]): SyncRequest {
  return { deviceId: deviceA, sinceSeq: 0, mutations };
}

class FakeSyncStore implements SyncStore {
  readonly sessionId = sessionId;
  readonly deviceId: string;
  readonly receivedAt = new Date(receivedAt);
  readonly appliedMutations: string[] = [];
  readonly records = new Map<string, SyncMutationRecord>();
  readonly versions = new Map<string, SyncEntityVersion>();
  /**
   * A counter, not a session.
   *
   * This fake used to carry `state = { serverSeq: 0 } as unknown as SessionState`, and every
   * other field of that type — id, status, phase, routineDay, sets, tasks — was absent behind a
   * double assertion (`as unknown as`) whose purpose was to stop the compiler noticing. It
   * existed because `SyncStore.getState` had to return a session graph so the batch answer could
   * ship one; #105 removed the field, so the seam now asks for the one integer it actually uses
   * and the fake has no lie left in it.
   */
  serverSeq = 0;

  constructor(deviceId = deviceA) {
    this.deviceId = deviceId;
  }

  async currentServerSeq(): Promise<number> {
    return this.serverSeq;
  }

  async reserveMutation(mutationInput: SyncMutation, payloadHash: string): Promise<SyncReservation> {
    const existing = this.records.get(mutationInput.mutationId);
    if (existing) return { kind: 'existing', record: existing };
    this.records.set(mutationInput.mutationId, {
      mutationId: mutationInput.mutationId,
      payloadHash,
      status: 'processing',
      serverSeq: null,
      rejectionReason: null,
    });
    return { kind: 'new' };
  }

  async findEntityVersion(entityType: SyncEntityType, entityKey: string): Promise<SyncEntityVersion | null> {
    return this.versions.get(`${entityType}:${entityKey}`) ?? null;
  }

  async applyMutation(mutationInput: SyncMutation): Promise<void> {
    this.appliedMutations.push(mutationInput.mutationId);
  }

  async allocateSequence(): Promise<number> {
    this.serverSeq += 1;
    return this.serverSeq;
  }

  async upsertEntityVersion(version: SyncEntityVersion): Promise<void> {
    this.versions.set(`${version.entityType}:${version.entityKey}`, version);
  }

  async appendChange(): Promise<void> {}

  async markApplied(mutationId: string, serverSeq: number): Promise<void> {
    const record = this.records.get(mutationId);
    if (!record) throw new Error('Missing mutation reservation.');
    record.status = 'applied';
    record.serverSeq = serverSeq;
  }

  async markRejected(mutationId: string, reason: string): Promise<void> {
    const record = this.records.get(mutationId);
    if (!record) throw new Error('Missing mutation reservation.');
    record.status = 'rejected';
    record.rejectionReason = reason;
  }
}

describe('SyncEngine policy', () => {
  it('hashes equivalent mutation objects independent of key order', () => {
    const left = mutation();
    const right = {
      reps: 8,
      weightKg: 60,
      isCompleted: true,
      setIndex: 0,
      exerciseId,
      sessionId,
      clientTs: '2026-09-08T12:00:00.000Z',
      mutationId: left.mutationId,
      op: 'set.upsert',
    } as SyncMutation;

    expect(canonicalMutationHash(left)).toBe(canonicalMutationHash(right));
  });

  it('clamps untrusted client time and reports the original absolute skew', () => {
    const clientTs = new Date('2026-09-07T12:00:00.000Z');
    expect(normalizeClientTimestamp(clientTs, receivedAt)).toEqual(
      new Date('2026-09-08T11:55:00.000Z'),
    );
    expect(clockSkewMs(clientTs, receivedAt)).toBe(86_400_000);
  });

  it('uses device ID and mutation ID as deterministic tie-breakers', () => {
    const timestamp = new Date('2026-09-08T12:00:00.000Z');
    expect(compareEntityVersions(
      { effectiveTs: timestamp, deviceId: deviceB, clientSeq: 0, mutationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' },
      { effectiveTs: timestamp, deviceId: deviceA, clientSeq: 0, mutationId: '00000000-0000-4000-8000-000000000000' },
    )).toBeGreaterThan(0);
    expect(compareEntityVersions(
      { effectiveTs: timestamp, deviceId: deviceA, clientSeq: 0, mutationId: 'FFFFFFFF-FFFF-4FFF-8FFF-FFFFFFFFFFFF' },
      { effectiveTs: timestamp, deviceId: deviceA, clientSeq: 0, mutationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' },
    )).toBe(0);
  });

  it('orders a same-millisecond pair on one device by the outbox sequence (#78)', () => {
    const timestamp = new Date('2026-09-08T12:00:00.000Z');
    const later = { effectiveTs: timestamp, deviceId: deviceA, clientSeq: 2, mutationId: '11111111-1111-4111-8111-111111111111' };
    const earlier = { effectiveTs: timestamp, deviceId: deviceA, clientSeq: 1, mutationId: '99999999-9999-4999-8999-999999999999' };

    // The sequence decides even though the losing mutation id sorts higher.
    expect(compareEntityVersions(later, earlier)).toBeGreaterThan(0);
    expect(compareEntityVersions(earlier, later)).toBeLessThan(0);
  });

  it('keeps the device ahead of the sequence so a bigger counter cannot cross devices (#78)', () => {
    const timestamp = new Date('2026-09-08T12:00:00.000Z');
    const fromA = { effectiveTs: timestamp, deviceId: deviceA, clientSeq: 9, mutationId: '11111111-1111-4111-8111-111111111111' };
    const fromB = { effectiveTs: timestamp, deviceId: deviceB, clientSeq: 1, mutationId: '11111111-1111-4111-8111-111111111111' };

    // deviceB sorts after deviceA lexically, so it wins despite the smaller sequence.
    expect(compareEntityVersions(fromA, fromB)).toBeLessThan(0);
    expect(compareEntityVersions(fromB, fromA)).toBeGreaterThan(0);
  });

  it('falls through to the mutation id when neither side recorded a sequence (#78)', () => {
    const timestamp = new Date('2026-09-08T12:00:00.000Z');
    const unknown = { effectiveTs: timestamp, deviceId: deviceA, clientSeq: 0, mutationId: '00000000-0000-4000-8000-000000000000' };
    const alsoUnknown = { effectiveTs: timestamp, deviceId: deviceA, clientSeq: 0, mutationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' };

    // 0 is "unknown", not "first": pre-#78 rows keep the order they were accepted under.
    expect(compareEntityVersions(alsoUnknown, unknown)).toBeGreaterThan(0);
    expect(compareEntityVersions(unknown, alsoUnknown)).toBeLessThan(0);
    expect(compareEntityVersions(unknown, { ...unknown })).toBe(0);
  });

  it('applies a mutation once and makes an identical replay side-effect free', async () => {
    const store = new FakeSyncStore();
    const engine = new SyncEngine(store);
    const input = request([mutation()]);

    const firstMutation = input.mutations[0]!;
    const first = await engine.apply(input);
    const second = await engine.apply(input);

    expect(first.applied).toEqual([firstMutation.mutationId]);
    expect(second.applied).toEqual([firstMutation.mutationId]);
    expect(first.rejected).toEqual([]);
    expect(store.appliedMutations).toEqual([firstMutation.mutationId]);
    expect(store.serverSeq).toBe(1);
    /*
     * #105, counted rather than described: what a batch answers with, exactly.
     *
     * The shape used to be the contract's four fields *plus* a session graph the domain mapped and
     * no client read. Asserting the key list here is what keeps the two halves of the removal
     * honest — the domain result and the wire body are the same shape by construction, so a field
     * added on one side and not the other is a `ContractViolationError` in the route, and this is
     * the assertion that names the pair before a request has to be made to find out.
     */
    expect(Object.keys(first).sort()).toEqual(['applied', 'clockSkewMs', 'rejected', 'serverSeq']);
    expect(first.serverSeq).toBe(1);
  });

  it('rejects changed payload reuse without invoking the domain mutation', async () => {
    const store = new FakeSyncStore();
    const engine = new SyncEngine(store);
    await engine.apply(request([mutation()]));

    const changed = mutation({ weightKg: 61 });
    const result = await engine.apply(request([changed]));

    expect(result.applied).toEqual([]);
    expect(result.rejected).toEqual([{
      mutationId: changed.mutationId,
      reason: 'MUTATION_ID_REUSE',
      message: 'This change was already sent with different contents.',
    }]);
    expect(store.appliedMutations).toHaveLength(1);
  });

  it('rejects an older entity version before applying the domain operation', async () => {
    const store = new FakeSyncStore();
    store.versions.set(`set:set:${exerciseId}:0`, {
      entityType: 'set',
      entityKey: `set:${exerciseId}:0`,
      clientTs: new Date('2026-09-08T11:59:00.000Z'),
      effectiveTs: new Date('2026-09-08T11:59:00.000Z'),
      deviceId: deviceB,
      mutationId: '44444444-4444-4444-8444-444444444444',
      serverSeq: 1,
      clientSeq: 1,
    });

    const oldMutation = mutation({ clientTs: '2026-09-08T11:00:00.000Z' });
    const result = await new SyncEngine(store).apply(request([oldMutation]));

    expect(result.rejected).toEqual([{
      mutationId: oldMutation.mutationId,
      reason: 'STALE_CONFLICT',
      message: 'A newer change to this set already reached the server.',
    }]);
    expect(store.appliedMutations).toEqual([]);
    expect(store.records.get(oldMutation.mutationId)?.status).toBe('rejected');
  });

  /*
   * #78 — two writes to one entity in the same millisecond.
   *
   * The comparison used to end on `mutationId`, a random UUID, so which of two same-millisecond
   * taps survived was a coin flip that could differ between two devices syncing the same batch.
   * The outbox already numbers its rows; the sequence now decides, and the mutation id is only
   * reached when neither side recorded one.
   */
  it('applies a same-millisecond pair on one device in outbox order (#78)', async () => {
    const store = new FakeSyncStore();
    const engine = new SyncEngine(store);
    const first = mutation({ mutationId: '11111111-1111-4111-8111-111111111111', clientSeq: 1, weightKg: 60 });
    const second = mutation({ mutationId: '22222222-2222-4222-8222-222222222222', clientSeq: 2, weightKg: 62 });

    const result = await engine.apply(request([first, second]));

    expect(result.rejected).toEqual([]);
    expect(result.applied).toEqual([first.mutationId, second.mutationId]);
    expect(store.versions.get(`set:set:${exerciseId}:0`)?.clientSeq).toBe(2);
  });

  it('rejects the earlier of a same-millisecond pair when it arrives second (#78)', async () => {
    const store = new FakeSyncStore();
    const engine = new SyncEngine(store);
    const earlier = mutation({ mutationId: '11111111-1111-4111-8111-111111111111', clientSeq: 1, weightKg: 60 });
    const later = mutation({ mutationId: '22222222-2222-4222-8222-222222222222', clientSeq: 2, weightKg: 62 });

    await engine.apply(request([later]));
    const result = await engine.apply(request([earlier]));

    expect(result.applied).toEqual([]);
    expect(result.rejected).toEqual([{
      mutationId: earlier.mutationId,
      reason: 'STALE_CONFLICT',
      message: 'A newer change to this set already reached the server.',
    }]);
    // The winner still stands: the version the earlier write tried to displace is untouched.
    expect(store.versions.get(`set:set:${exerciseId}:0`)?.clientSeq).toBe(2);
    expect(store.appliedMutations).toEqual([later.mutationId]);
  });

  /*
   * #77 — the sentence the domain already wrote, carried instead of discarded.
   *
   * `rejectionReason` maps the error *type* to a code and drops `error.message` on the floor;
   * the runner then had to reconstruct the rule locally to say anything a person could act on.
   * The sentence below is the one `assertSetMutationAllowed` really throws, and the assertion
   * is that it arrives verbatim — not paraphrased, not re-derived from the code.
   */
  it('carries the domain error’s own sentence beside the code it maps to', async () => {
    class RefusingStore extends FakeSyncStore {
      readonly refusal: Error;

      constructor(refusal: Error) {
        super();
        this.refusal = refusal;
      }

      override async applyMutation(): Promise<void> {
        throw this.refusal;
      }
    }

    const sentence = 'Sets can only be changed during the main workout.';
    const store = new RefusingStore(new SessionConflictError(sentence));
    const result = await new SyncEngine(store).apply(request([mutation()]));

    expect(result.rejected).toEqual([{
      mutationId: mutation().mutationId,
      reason: 'CONFLICT',
      message: sentence,
    }]);
    // The code is what the row stores, and #77 adds no migration: the column keeps the code.
    expect(store.records.get(mutation().mutationId)?.rejectionReason).toBe('CONFLICT');
  });

  /*
   * #77 — a replayed refusal still explains itself.
   *
   * `sync_mutations.rejection_reason` stores the code and nothing else, and #77 deliberately
   * added no migration, so a replay has no stored sentence to hand back. It reconstructs one
   * from the code instead. The assertion is that the replay is *not* silent: a client that
   * retried a refused mutation must still get a sentence it can render, even though the
   * original domain error is long gone.
   */
  it('gives a replayed refusal a sentence, because the column stores only the code', async () => {
    class RefusingStore extends FakeSyncStore {
      override async applyMutation(): Promise<void> {
        throw new SessionConflictError('Sets can only be changed during the main workout.');
      }
    }

    const store = new RefusingStore();
    const engine = new SyncEngine(store);
    const input = request([mutation()]);
    await engine.apply(input);
    const replay = await engine.apply(input);

    expect(replay.rejected).toEqual([{
      mutationId: mutation().mutationId,
      reason: 'CONFLICT',
      message: 'The session changed since this change was queued.',
    }]);
  });
});
