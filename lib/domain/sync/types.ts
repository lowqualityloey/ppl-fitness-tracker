import type { SyncMutation, SyncResponseData } from '../../contracts/sync';

export type SyncEntityType = 'set' | 'task' | 'session';
export type SyncMutationStatus = 'processing' | 'applied' | 'rejected';

export interface SyncMutationRecord {
  mutationId: string;
  payloadHash: string | null;
  status: SyncMutationStatus | null;
  serverSeq: number | null;
  rejectionReason: string | null;
}

export interface SyncEntityVersion {
  entityType: SyncEntityType;
  entityKey: string;
  clientTs: Date;
  effectiveTs: Date;
  deviceId: string;
  mutationId: string;
  serverSeq: number;
  /**
   * The sender's outbox position, or 0 when unknown. Compared only after
   * effectiveTs and deviceId, because the counter is per-session and per-device
   * (#78).
   */
  clientSeq: number;
}

export type SyncReservation =
  | { kind: 'new' }
  | { kind: 'existing'; record: SyncMutationRecord }
  | { kind: 'foreign' };

export interface SyncStore {
  readonly sessionId: string;
  readonly deviceId: string;
  readonly receivedAt: Date;
  /**
   * The session's sequence after this batch — **one integer**, which is all the sync answer
   * needs. It replaces `getState(): Promise<SessionState>`, the seam #105 deleted along with
   * the response field it existed to fill: the repository already maps the graph inside the
   * transaction to gate each mutation's lifecycle, and mapping it a final time to serialize a
   * copy nobody read was the pure part of the cost.
   */
  currentServerSeq(): Promise<number>;
  reserveMutation(mutation: SyncMutation, payloadHash: string): Promise<SyncReservation>;
  findEntityVersion(entityType: SyncEntityType, entityKey: string): Promise<SyncEntityVersion | null>;
  applyMutation(mutation: SyncMutation): Promise<void>;
  allocateSequence(): Promise<number>;
  upsertEntityVersion(version: SyncEntityVersion): Promise<void>;
  appendChange(input: {
    serverSeq: number;
    mutationId: string;
    entityType: SyncEntityType;
    entityKey: string;
    operation: SyncMutation['op'];
  }): Promise<void>;
  markApplied(mutationId: string, serverSeq: number): Promise<void>;
  markRejected(mutationId: string, reason: string): Promise<void>;
}

/**
 * What `POST /api/sync` answers with. As of #105 the domain's result and the wire body are one
 * shape — this used to be `Omit<SyncResponseData, 'state'> & { state: SessionState }`, whose
 * whole purpose was to carry a session graph no client parsed.
 *
 * The alias is kept rather than inlined because the two names mean different things: this is
 * what the conflict model decided, `SyncResponseData` is what the contract promises. They are
 * now equal by construction, and `validateOutgoing` in the route is what stops them drifting
 * apart again if someone reintroduces a field on one side only.
 */
export type SyncApplyResult = SyncResponseData;

export class SyncValidationError extends Error {
  override readonly name = 'SyncValidationError';
}

export class SyncConflictError extends Error {
  override readonly name = 'SyncConflictError';
}
