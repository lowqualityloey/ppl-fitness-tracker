import { createHash } from 'node:crypto';
import type { SyncMutation, SyncRejection, SyncRequest } from '../../contracts/sync';
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
  candidate: Pick<SyncEntityVersion, 'effectiveTs' | 'deviceId' | 'clientSeq' | 'mutationId'>,
  current: Pick<SyncEntityVersion, 'effectiveTs' | 'deviceId' | 'clientSeq' | 'mutationId'>,
): number {
  const timestampOrder = candidate.effectiveTs.getTime() - current.effectiveTs.getTime();
  if (timestampOrder !== 0) return timestampOrder;

  // Device before sequence, deliberately: the outbox counter is per session and
  // per device, so comparing two devices' counters would hand a systematic win
  // to whichever device happens to hold the larger number. Across devices the
  // device id is the order; the sequence only decides within one.
  const deviceOrder = compareLexically(candidate.deviceId, current.deviceId);
  if (deviceOrder !== 0) return deviceOrder;

  // 0 means the sender did not record a position, which is true of every row
  // written before #78. Two unknown positions fall through to the mutation id,
  // so historical data keeps the ordering it was accepted under.
  const seqOrder = candidate.clientSeq - current.clientSeq;
  if (seqOrder !== 0) return seqOrder;

  return compareLexically(candidate.mutationId, current.mutationId);
}

/**
 * The two halves of a refusal: the code the machine switches on, and the sentence a person
 * reads. #77 — the sentence was always here, one call site away, and this function used to
 * drop it on the floor.
 *
 * The fallback is not dead code: `applyMutation` can throw something that is none of these
 * three (a driver error, a bug), and that path rethrows rather than rejecting — but a
 * `SessionValidationError` subclass that is *not* a `ProgressionValidationError` still lands
 * here, and so does anything else the store chooses to raise. A refusal with no sentence of
 * its own still owes the client one, because the contract says every rejection explains
 * itself.
 */
function rejectionFor(error: unknown): { reason: string; message: string } {
  if (error instanceof SessionNotFoundError) return { reason: 'NOT_FOUND', message: error.message };
  if (error instanceof SessionConflictError) return { reason: 'CONFLICT', message: error.message };
  if (error instanceof SessionValidationError) return { reason: 'INVALID_MUTATION', message: error.message };
  return { reason: 'MUTATION_REJECTED', message: 'The server refused this change.' };
}

/**
 * The sentence for a rejection the server is replaying rather than deciding.
 *
 * `sync_mutations.rejection_reason` stores the code and nothing else — #77 added no migration,
 * deliberately: the sentence is a rendering of a decision already made, not a new fact about
 * it. So a replay of an old refusal has no stored sentence to hand back, and reconstructs the
 * one the code stands for. These are the same sentences the live paths produce, so a client
 * cannot tell a replay from a fresh refusal by reading the message.
 */
function replayMessage(reason: string): string {
  switch (reason) {
    case 'NOT_FOUND': return 'Session not found.';
    case 'CONFLICT': return 'The session changed since this change was queued.';
    case 'INVALID_MUTATION': return 'The server could not accept this change.';
    case 'STALE_CONFLICT': return 'A newer change to this set already reached the server.';
    case 'MUTATION_ID_REUSE': return 'This change was already sent with different contents.';
    default: return 'The server refused this change.';
  }
}

function addUnique(values: string[], value: string): void {
  if (!values.includes(value)) values.push(value);
}

function addRejection(
  values: SyncRejection[],
  mutationId: string,
  reason: string,
  message: string,
): void {
  if (!values.some((entry) => entry.mutationId === mutationId)) values.push({ mutationId, reason, message });
}

function replayRecord(
  record: SyncMutationRecord,
  mutation: SyncMutation,
  payloadHash: string,
  applied: string[],
  rejected: SyncRejection[],
): void {
  if (record.payloadHash !== null && record.payloadHash !== payloadHash) {
    addRejection(
      rejected,
      mutation.mutationId,
      'MUTATION_ID_REUSE',
      replayMessage('MUTATION_ID_REUSE'),
    );
    return;
  }

  if (record.status === 'applied' || record.status === null) {
    addUnique(applied, mutation.mutationId);
    return;
  }
  if (record.status === 'rejected') {
    const reason = record.rejectionReason ?? 'MUTATION_REJECTED';
    addRejection(rejected, mutation.mutationId, reason, replayMessage(reason));
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
    const rejected: SyncRejection[] = [];
    let maximumClockSkewMs = 0;

    for (const mutation of request.mutations) {
      const clientTs = new Date(mutation.clientTs);
      maximumClockSkewMs = Math.max(maximumClockSkewMs, clockSkewMs(clientTs, this.store.receivedAt));
      const payloadHash = canonicalMutationHash(mutation);
      const reservation = await this.store.reserveMutation(mutation, payloadHash);

      if (reservation.kind === 'foreign') {
        // Do not reveal that a mutation ID exists under another user — which is why the
        // sentence is the generic one and not the domain's: a specific message here would
        // leak the same fact the code is careful not to.
        addRejection(rejected, mutation.mutationId, 'MUTATION_REJECTED', 'The server refused this change.');
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
        clientSeq: mutation.clientSeq ?? 0,
        mutationId: mutation.mutationId,
      };
      const currentVersion = await this.store.findEntityVersion(entityType, entityKey);

      if (currentVersion && compareEntityVersions(candidateVersion, currentVersion) <= 0) {
        await this.store.markRejected(mutation.mutationId, 'STALE_CONFLICT');
        addRejection(
          rejected,
          mutation.mutationId,
          'STALE_CONFLICT',
          replayMessage('STALE_CONFLICT'),
        );
        continue;
      }

      try {
        await this.store.applyMutation(mutation);
      } catch (error) {
        const { reason, message } = rejectionFor(error);
        if (
          error instanceof SessionNotFoundError ||
          error instanceof SessionConflictError ||
          (error instanceof SessionValidationError && !(error instanceof ProgressionValidationError))
        ) {
          // The column keeps the code (#77 adds no migration); the sentence is the domain's
          // own, carried out of the catch block instead of being discarded here.
          await this.store.markRejected(mutation.mutationId, reason);
          addRejection(rejected, mutation.mutationId, reason, message);
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
        clientSeq: mutation.clientSeq ?? 0,
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
    // carried is never re-read here — the line holds ids, codes and the
    // sentence the client was given (#77), so an operator reading the trail
    // does not have to hold the code table in their head either.
    for (const rejection of rejected) {
      log.warn('sync mutation rejected', {
        mutationId: rejection.mutationId,
        reason: rejection.reason,
        message: rejection.message,
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
