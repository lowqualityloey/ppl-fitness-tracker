import type { ImportReport, LegacyImportRequest } from '../../contracts/import';
import {
  buildImportReport,
  planLegacyImport,
  type LegacyImportPlan,
} from './legacy-importer';
import type { LegacyImportStore } from './types';

/**
 * M2-05: import orchestration, spec §3's `LegacyImporter.import(raw)`.
 *
 * The ordering is the security-relevant part, so it lives in one place:
 *
 * 1. Plan first. Parsing, fingerprinting, and the honesty rules all run before
 *    anything touches the database, so a malformed payload cannot leave a partial
 *    batch behind.
 * 2. Look up the stored report for this fingerprint, and return it without
 *    writing. This is the replay path the acceptance criteria are written
 *    against: same payload, original report, no second copy of history.
 * 3. Otherwise commit through the store, which re-checks the fingerprint inside
 *    its transaction. Two concurrent identical requests therefore produce one
 *    batch rather than two, and the loser reports the winner's outcome.
 *
 * Nothing here deletes or renames a legacy key. The server never had the
 * originals in a deletable place — they arrive as a request body — and
 * spec §4.5 step 5 puts archival on the client, after the user has seen the
 * report. "Preserve raw keys until acknowledged" is honored by this module
 * simply not having a destructive path.
 */
export interface LegacyImportOutcome {
  report: ImportReport;
  /** True when an identical payload had already been imported for this user. */
  replayed: boolean;
  fingerprint: string;
  /** The plan behind the report, for tests and future reporting. */
  plan: LegacyImportPlan;
}

export class LegacyImporter {
  constructor(
    private readonly store: LegacyImportStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async import(userId: string, raw: LegacyImportRequest): Promise<LegacyImportOutcome> {
    const plan = planLegacyImport(raw, this.now());
    const stored = await this.store.findStoredReport(userId, plan.fingerprint);
    if (stored) {
      return { report: stored, replayed: true, fingerprint: plan.fingerprint, plan };
    }

    const committed = await this.store.commitBatch(
      userId,
      plan.fingerprint,
      plan.plans,
      (insertedSets) => buildImportReport(plan, insertedSets),
    );

    return {
      report: committed.report,
      // A concurrent twin can win the race inside the store; either way the
      // caller is receiving a report for the batch that now exists, not a
      // second one.
      replayed: committed.replayed,
      fingerprint: plan.fingerprint,
      plan,
    };
  }
}
