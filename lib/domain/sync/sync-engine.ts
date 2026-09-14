import { createHash } from 'node:crypto';
import type { SyncMutation, SyncRequest } from '../../contracts/sync';
import { attachCorrelation, log } from '../../logger';
import { ProgressionValidationError } from '../progression/types';
import {
  SessionConflictError,
  SessionNotFoundError,
  SessionValidationError,
} from '../sessions/types';
import {
  SyncConflictError,
  SyncValidationError,
  type SyncEntityType,
  type SyncEntityVersion,
  type SyncApplyResult,
  type SyncMutationRecord,
  type SyncStore,
} from './types';

const CLOCK_SKEW_LIMIT_MS = 5 * 60 * 1000;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

function compareLexically(left: string, right: string): number {
  const normalizedLeft = left.toLowerCase();
  const normalizedRight = right.toLowerCase();
  if (normalizedLeft < normalizedRight) return -1;
  if (normalizedLeft > normalizedRight) return 1;
  return 0;
}

function sortForHash(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForHash);
  if (value === null || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortForHash(child)]),
  );
}

export function canonicalMutationHash(mutation: SyncMutation): string {
  return createHash('sha256')
    .update(JSON.stringify(sortForHash(mutation)))
    .digest('hex');
}

export function normalizeClientTimestamp(clientTs: Date, receivedAt: Date): Date {
  const clientMs = clientTs.getTime();
  const receivedMs = receivedAt.getTime();
  if (!Number.isFinite(clientMs) || !Number.isFinite(receivedMs)) {
    throw new SyncValidationError('Mutation timestamps must be valid dates.');
  }

  return new Date(Math.min(
    receivedMs + CLOCK_SKEW_LIMIT_MS,
    Math.max(receivedMs - CLOCK_SKEW_LIMIT_MS, clientMs),
  ));
}

export function clockSkewMs(clientTs: Date, receivedAt: Date): number {
  const difference = Math.abs(clientTs.getTime() - receivedAt.getTime());
  if (!Number.isFinite(difference)) throw new SyncValidationError('Mutation timestamps must be valid dates.');
  return Math.round(difference);
}

export function mutationEntity(mutation: SyncMutation): {
  entityType: SyncEntityType;
  entityKey: string;
} {
  switch (mutation.op) {
    case 'set.upsert':
      return {
        entityType: 'set',
        entityKey: `set:${mutation.exerciseId}:${mutation.setIndex}`,
      };
    case 'task.complete':
      return { entityType: 'task', entityKey: `task:${mutation.taskKey}` };
    case 'phase.advance':
    case 'session.finish':
      return { entityType: 'session', entityKey: 'session:state' };
  }
}

/** Positive means the candidate wins; zero means the versions are identical. */
export function compareEntityVersions(
  candidate: Pick<SyncEntityVersion, 'effectiveTs' | 'deviceId' | 'mutationId'>,
  current: Pick<SyncEntityVersion, 'effectiveTs' | 'deviceId' | 'mutationId'>,
): number {
  const timestampOrder = candidate.effectiveTs.getTime() - current.effectiveTs.getTime();
  if (timestampOrder !== 0) return timestampOrder;

  const deviceOrder = compareLexically(candidate.deviceId, current.deviceId);
  if (deviceOrder !== 0) return deviceOrder;

  return compareLexically(candidate.mutationId, current.mutationId);
}

function rejectionReason(error: unknown): string {
  if (error instanceof SessionNotFoundError) return 'NOT_FOUND';
  if (error instanceof SessionConflictError) return 'CONFLICT';
  if (error instanceof SessionValidationError) return 'INVALID_MUTATION';
  return 'MUTATION_REJECTED';
}

function addUnique(values: string[], value: string): void {
  if (!values.includes(value)) values.push(value);
}

function addRejection(values: Array<{ mutationId: string; reason: string }>, mutationId: string, reason: string): void {
  if (!values.some((entry) => entry.mutationId === mutationId)) values.push({ mutationId, reason });
}

function replayRecord(
  record: SyncMutationRecord,
  mutation: SyncMutation,
  payloadHash: string,
  applied: string[],
  rejected: Array<{ mutationId: string; reason: string }>,
): void {
  if (record.payloadHash !== null && record.payloadHash !== payloadHash) {
    addRejection(rejected, mutation.mutationId, 'MUTATION_ID_REUSE');
    return;
  }

  if (record.status === 'applied' || record.status === null) {
    addUnique(applied, mutation.mutationId);
    return;
  }
  if (record.status === 'rejected') {
    addRejection(rejected, mutation.mutationId, record.rejectionReason ?? 'MUTATION_REJECTED');
    return;
  }

  throw new SyncConflictError('The mutation is currently being processed.');
}

export class SyncEngine {
  constructor(private readonly store: SyncStore) {}

  async apply(request: SyncRequest): Promise<SyncApplyResult> {
    if (request.mutations.length === 0) {
      throw new SyncValidationError('At least one mutation is required.');
    }

    const sessionIds = new Set(request.mutations.map((mutation) => mutation.sessionId));
    if (sessionIds.size !== 1 || !sessionIds.has(this.store.sessionId)) {
      throw new SyncValidationError('All mutations must target one owned session.');
    }

    // M4-05 (#94): the single-session rule above is what makes this safe to
    // attach for the whole request — beneath this line there is exactly one
    // session the trail can belong to. Every line emitted below (including
    // the rejections at the end of this method) carries `session_id` from the
    // scope, not from a call site that could forget it.
    attachCorrelation({ sessionId: this.store.sessionId });

    const applied: string[] = [];
    const rejected: Array<{ mutationId: string; reason: string }> = [];
    let maximumClockSkewMs = 0;

    for (const mutation of request.mutations) {
      const clientTs = new Date(mutation.clientTs);
      maximumClockSkewMs = Math.max(maximumClockSkewMs, clockSkewMs(clientTs, this.store.receivedAt));
      const payloadHash = canonicalMutationHash(mutation);
      const reservation = await this.store.reserveMutation(mutation, payloadHash);

      if (reservation.kind === 'foreign') {
        // Do not reveal that a mutation ID exists under another user.
        addRejection(rejected, mutation.mutationId, 'MUTATION_REJECTED');
        continue;
      }
      if (reservation.kind === 'existing') {
        replayRecord(reservation.record, mutation, payloadHash, applied, rejected);
        continue;
      }

      const { entityType, entityKey } = mutationEntity(mutation);
      const effectiveTs = normalizeClientTimestamp(clientTs, this.store.receivedAt);
      const candidateVersion = {
        effectiveTs,
        deviceId: this.store.deviceId,
        mutationId: mutation.mutationId,
      };
      const currentVersion = await this.store.findEntityVersion(entityType, entityKey);

      if (currentVersion && compareEntityVersions(candidateVersion, currentVersion) <= 0) {
        await this.store.markRejected(mutation.mutationId, 'STALE_CONFLICT');
        addRejection(rejected, mutation.mutationId, 'STALE_CONFLICT');
        continue;
      }

      try {
        await this.store.applyMutation(mutation);
      } catch (error) {
        const reason = rejectionReason(error);
        if (
          error instanceof SessionNotFoundError ||
          error instanceof SessionConflictError ||
          (error instanceof SessionValidationError && !(error instanceof ProgressionValidationError))
        ) {
          await this.store.markRejected(mutation.mutationId, reason);
          addRejection(rejected, mutation.mutationId, reason);
          continue;
        }
        throw error;
      }

      const serverSeq = await this.store.allocateSequence();
      await this.store.upsertEntityVersion({
        entityType,
        entityKey,
        clientTs,
        effectiveTs,
        deviceId: this.store.deviceId,
        mutationId: mutation.mutationId,
        serverSeq,
      });
      await this.store.appendChange({
        serverSeq,
        mutationId: mutation.mutationId,
        entityType,
        entityKey,
        operation: mutation.op,
      });
      await this.store.markApplied(mutation.mutationId, serverSeq);
      addUnique(applied, mutation.mutationId);
    }

    // M4-05 (#94): the card's "reconstruction of a refused mutation" is this
    // loop — one line per rejection, carrying `mutationId` and the reason code
    // on the request's own id, so a partially-refused batch is traceable from
    // the route's completion line down without timestamps and luck. Deliberately
    // *after* the mutation loop and not inside `addRejection`: every rejection
    // reaches `rejected` (foreign, replay, stale, lifecycle), so this is the
    // one choke point that cannot be skipped, and the payload the mutation
    // carried is never re-read here — the line holds ids and codes only.
    for (const rejection of rejected) {
      log.warn('sync mutation rejected', {
        mutationId: rejection.mutationId,
        reason: rejection.reason,
      });
    }

    // The batch's own answer, and after #105 nothing else: the sequence the client is now
    // standing on, the item-level verdicts, and the skew the server observed. Authoritative
    // session state is `GET /api/sessions/[id]`'s to carry — this route is not a second copy
    // of it, and the client that refetches after any rejection (#63) is what makes that safe.
    return {
      serverSeq: await this.store.currentServerSeq(),
      applied,
      rejected,
      clockSkewMs: maximumClockSkewMs,
    };
  }
}

export { CLOCK_SKEW_LIMIT_MS, ZERO_UUID };
