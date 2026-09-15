import { EXPORT_SESSION_CAP } from '../contracts/export';
import type {
  ExportV1,
  PersonalRecordExport,
  SessionExport,
} from '../contracts/export';
import type { ImportReport } from '../contracts/import';

/**
 * M4-21 (#110): the pure half of the export — rows in, envelope out.
 *
 * Deliberately free of `db/`, `next/`, and clock defaults in tests (the
 * `exportedAt` argument exists so the unit suite can lock the exact bytes;
 * production takes the default). That makes the two properties the card names
 * testable without a database: the [ASSUMPTION-m4-003] cap arithmetic, and
 * ADR-0005's "canonical kg, preference is a label" — a builder that converted
 * weights could not hide from an assertion that the exported number equals the
 * column value.
 *
 * The row shapes below are the repository's contract with this file, and the
 * stringly types are load-bearing: `numeric(6,2)` arrives as a **string** from
 * the driver, and `import_batches.report` is JSON stored as *text*
 * (`db/schema/index.ts:240`). Both conversions happen exactly once, here.
 */

export interface ArchiveSetRow {
  readonly id: string;
  readonly exerciseId: string;
  readonly setIndex: number;
  readonly isCompleted: boolean;
  /** `numeric` arrives as a string; NULL is the legacy importer's honest shape. */
  readonly weightKg: string | null;
  readonly reps: number | null;
  readonly clientTs: Date;
}

export interface ArchiveTaskRow {
  readonly id: string;
  readonly taskKey: 'warm_up' | 'main_workout' | 'stretch';
  readonly completedAt: Date | null;
  readonly clientTs: Date;
}

export interface ArchiveSessionRow {
  readonly id: string;
  readonly clientId: string;
  readonly routineDayId: string;
  readonly status: 'in_progress' | 'completed' | 'archived';
  readonly phase: 'pre_workout' | 'exercise' | 'rest' | 'stretch' | 'post_workout';
  readonly source: 'app' | 'legacy_import';
  readonly localDate: string;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
  readonly serverSeq: number;
  readonly sets: readonly ArchiveSetRow[];
  readonly tasks: readonly ArchiveTaskRow[];
}

export interface ArchivePersonalRecordRow {
  readonly id: string;
  readonly exerciseId: string;
  readonly bestE1rm: string;
  readonly achievedAt: Date;
  readonly sessionId: string | null;
}

export interface ArchiveImportRow {
  readonly id: string;
  readonly sourceFingerprint: string;
  /** JSON text as stored; parsed (and then contract-checked) during build. */
  readonly report: string;
  readonly createdAt: Date;
}

export interface ArchiveUserRow {
  readonly id: string;
  readonly email: string;
  readonly displayName: string | null;
  readonly joinedAt: Date;
  readonly preferredUnit: 'kg' | 'lbs';
}

export interface ExportArchiveRows {
  readonly user: ArchiveUserRow;
  /**
   * Newest-first (`local_date desc, started_at desc, id desc`) — the cap slice
   * keeps the head, so this order is the builder's precondition, not a
   * suggestion.
   */
  readonly sessions: readonly ArchiveSessionRow[];
  readonly personalRecords: readonly ArchivePersonalRecordRow[];
  readonly imports: readonly ArchiveImportRow[];
}

const toIso = (value: Date): string => value.toISOString();
const toNumber = (value: string): number => Number(value);

function toSessionExport(row: ArchiveSessionRow): SessionExport {
  return {
    id: row.id,
    clientId: row.clientId,
    routineDayId: row.routineDayId,
    status: row.status,
    phase: row.phase,
    source: row.source,
    localDate: row.localDate,
    startedAt: toIso(row.startedAt),
    completedAt: row.completedAt === null ? null : toIso(row.completedAt),
    serverSeq: row.serverSeq,
    sets: row.sets.map((set) => ({
      id: set.id,
      exerciseId: set.exerciseId,
      setIndex: set.setIndex,
      isCompleted: set.isCompleted,
      weightKg: set.weightKg === null ? null : toNumber(set.weightKg),
      reps: set.reps,
      clientTs: toIso(set.clientTs),
    })),
    tasks: row.tasks.map((task) => ({
      id: task.id,
      taskKey: task.taskKey,
      completedAt: task.completedAt === null ? null : toIso(task.completedAt),
      clientTs: toIso(task.clientTs),
    })),
  };
}

function toPersonalRecordExport(row: ArchivePersonalRecordRow): PersonalRecordExport {
  return {
    id: row.id,
    exerciseId: row.exerciseId,
    bestE1rm: toNumber(row.bestE1rm),
    achievedAt: toIso(row.achievedAt),
    sessionId: row.sessionId,
  };
}

export function buildExportV1(
  rows: ExportArchiveRows,
  exportedAt: Date = new Date(),
): ExportV1 {
  const truncated = rows.sessions.length > EXPORT_SESSION_CAP;
  const included = truncated ? rows.sessions.slice(0, EXPORT_SESSION_CAP) : rows.sessions;
  return {
    version: 'v1',
    exportedAt: exportedAt.toISOString(),
    user: {
      id: rows.user.id,
      email: rows.user.email,
      displayName: rows.user.displayName,
      joinedAt: toIso(rows.user.joinedAt),
      preferredUnit: rows.user.preferredUnit,
    },
    sessions: included.map(toSessionExport),
    personalRecords: rows.personalRecords.map(toPersonalRecordExport),
    imports: rows.imports.map((row) => ({
      id: row.id,
      sourceFingerprint: row.sourceFingerprint,
      report: JSON.parse(row.report) as ImportReport,
      createdAt: toIso(row.createdAt),
    })),
    // Reserved slot (#109 fills it later); v1 ships it empty, never absent.
    measurements: [],
    truncated,
    // The newest session that did NOT make the cut — the honest bound the
    // degradation branch promised in ASSUMPTION-m4-003.
    oldestExcluded: truncated ? rows.sessions[EXPORT_SESSION_CAP]!.localDate : null,
  };
}
