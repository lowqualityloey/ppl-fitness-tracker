import type { SyncMutation, SyncResponseData } from '../../contracts/sync';
import type { SessionState } from '../sessions/types';

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
}

export type SyncReservation =
  | { kind: 'new' }
  | { kind: 'existing'; record: SyncMutationRecord }
  | { kind: 'foreign' };

export interface SyncStore {
  readonly sessionId: string;
  readonly deviceId: string;
  readonly receivedAt: Date;
  getState(): Promise<SessionState>;
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

export type SyncApplyResult = Omit<SyncResponseData, 'state'> & {
  state: SessionState;
};

export class SyncValidationError extends Error {
  override readonly name = 'SyncValidationError';
}

export class SyncConflictError extends Error {
  override readonly name = 'SyncConflictError';
}
