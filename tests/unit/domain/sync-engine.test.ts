import { describe, expect, it } from 'vitest';
import type { SyncMutation, SyncRequest } from '../../../lib/contracts/sync';
import {
  canonicalMutationHash,
  clockSkewMs,
  compareEntityVersions,
  normalizeClientTimestamp,
  SyncEngine,
} from '../../../lib/domain/sync/sync-engine';
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
      { effectiveTs: timestamp, deviceId: deviceB, mutationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' },
      { effectiveTs: timestamp, deviceId: deviceA, mutationId: '00000000-0000-4000-8000-000000000000' },
    )).toBeGreaterThan(0);
    expect(compareEntityVersions(
      { effectiveTs: timestamp, deviceId: deviceA, mutationId: 'FFFFFFFF-FFFF-4FFF-8FFF-FFFFFFFFFFFF' },
      { effectiveTs: timestamp, deviceId: deviceA, mutationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' },
    )).toBe(0);
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
    expect(result.rejected).toEqual([{ mutationId: changed.mutationId, reason: 'MUTATION_ID_REUSE' }]);
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
    });

    const oldMutation = mutation({ clientTs: '2026-09-08T11:00:00.000Z' });
    const result = await new SyncEngine(store).apply(request([oldMutation]));

    expect(result.rejected).toEqual([{ mutationId: oldMutation.mutationId, reason: 'STALE_CONFLICT' }]);
    expect(store.appliedMutations).toEqual([]);
    expect(store.records.get(oldMutation.mutationId)?.status).toBe('rejected');
  });
});
