import type { ImportReport } from '../../contracts/import';
import type { LegacySessionPlan } from './legacy-importer';

/**
 * Domain errors and the persistence port for the legacy importer.
 *
 * A validation failure here is a client-shaped problem — nothing importable was
 * supplied — so it maps to a 400 through `routeErrorResponse`, the same way the
 * session and sync validation errors do. It must not become a 500: that would
 * both leak an internal message and tell the client to retry a request that can
 * never succeed.
 */
export class LegacyImportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LegacyImportValidationError';
  }
}

/**
 * Thrown when a valid plan produced no rows at all — the usual cause being that
 * the seeded push/legs/pull content is not present in this database.
 *
 * It is a failure and not an empty report, because the fingerprint row is
 * written in the same transaction: persisting `sessionsCreated: 0` for a payload
 * that looked importable would make every later retry replay an empty result
 * even after the seeds were fixed. Raising here rolls the batch back and leaves
 * no record, so the next attempt runs against the corrected content. The route
 * maps it to the canonical 500, since the cause is server configuration and no
 * client message would be true.
 */
export class LegacyImportNothingWrittenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LegacyImportNothingWrittenError';
  }
}

/** What a commit actually wrote, as opposed to what the plan asked for. */
export interface LegacyImportedCounts {
  sessionsInserted: number;
  setsInserted: number;
}

/**
 * What the importer needs from persistence, declared as a port so the ordering
 * rules in `LegacyImporter` are unit-testable without a database.
 * `LegacyImportRepository` is its only production implementation.
 */
export interface LegacyImportStore {
  findStoredReport(userId: string, fingerprint: string): Promise<ImportReport | null>;
  commitBatch(
    userId: string,
    fingerprint: string,
    plans: LegacySessionPlan[],
    buildReport: (written: LegacyImportedCounts) => ImportReport,
  ): Promise<{ replayed: boolean; report: ImportReport }>;
}
