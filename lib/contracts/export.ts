import { z } from 'zod';
import { createAppEnvelopeSchema } from './envelope';
import {
  IsoDateTimeSchema,
  LocalDateSchema,
  RepsSchema,
  SessionPhaseSchema,
  SessionSourceSchema,
  SessionStatusSchema,
  TaskKeySchema,
  UuidSchema,
  WeightKgSchema,
} from './common';
import { PreferredUnitSchema } from './profile';
import { ImportReportSchema } from './import';
import { MeasurementKindSchema } from './measurements';

/**
 * M4-21 (#110): the versioned JSON export envelope — the FMEA row's "data is
 * never hostage" mitigation, shipped as one authenticated GET.
 *
 * What the spec's §4.1 skeleton says vs. what this file says, stated plainly
 * because contract-as-truth means the diff must be owned rather than hidden:
 *
 * - `user` carries `preferredUnit` in addition to the skeleton's `{id, joinedAt}`
 *   (owner call, handoff 2026-09-16). ADR-0005: the value is a *display label*
 *   for the kg-canonical numbers below — it documents how the owner reads them,
 *   and converts nothing.
 * - `personalRecords` and `imports` are top-level arrays. The skeleton lists
 *   neither, but the card's first AC scenario requires per-table counts for
 *   "sessions across statuses, sets with NULLs, PRs, profile, and an import
 *   batch" — a contract whose producers cannot satisfy the AC is the wrong
 *   contract, and the AC was owner-signed. Same precedent as the `preferredUnit`
 *   addition, and the same "as written" note belongs in the ADR trail.
 * - `syncState` is *not* included. The card says "as needed"; the skeleton the
 *   owner locked omits it, and the sync ledger is a transport journal, not
 *   athlete data — an archive is complete without it (re-import recreates
 *   fresh ledger rows).
 * - `measurements` exists and v1 always ships it empty. The table arrives with
 *   #109; reserving the key now means that card fills a slot instead of bumping
 *   the version, and the round-trip promise (§AC) never has to answer "where
 *   did body data go?".
 *
 * Cap semantics ([ASSUMPTION-m4-003], owner sign-off 2026-09-14): at most
 * `EXPORT_SESSION_CAP` sessions, newest first. On breach the payload says so
 * itself — `truncated: true` plus `oldestExcluded` — rather than failing, and
 * `sessions.max()` here makes the cap a *validated* property: a builder that
 * mis-slices cannot ship an over-cap envelope, it 500s through
 * `validateOutgoing` instead.
 */
export const EXPORT_SESSION_CAP = 200;

export const ExportSetSchema = z.object({
  id: UuidSchema,
  exerciseId: UuidSchema,
  setIndex: z.number().int().min(0),
  isCompleted: z.boolean(),
  /**
   * `null` is the honest legacy shape (M2-05 importer: the old dashboard never
   * recorded load), so the column's nullability survives into the archive
   * rather than being laundered into a fake zero.
   */
  weightKg: WeightKgSchema.nullable(),
  reps: RepsSchema.nullable(),
  clientTs: IsoDateTimeSchema,
}).strict();

export const ExportTaskSchema = z.object({
  id: UuidSchema,
  taskKey: TaskKeySchema,
  completedAt: IsoDateTimeSchema.nullable(),
  clientTs: IsoDateTimeSchema,
}).strict();

export const SessionExportSchema = z.object({
  id: UuidSchema,
  clientId: UuidSchema,
  routineDayId: UuidSchema,
  status: SessionStatusSchema,
  phase: SessionPhaseSchema,
  source: SessionSourceSchema,
  localDate: LocalDateSchema,
  startedAt: IsoDateTimeSchema,
  completedAt: IsoDateTimeSchema.nullable(),
  serverSeq: z.number().int().min(0),
  sets: z.array(ExportSetSchema),
  tasks: z.array(ExportTaskSchema),
}).strict();

/**
 * The #109 measurement row shape. Since M4-20 the kind list and bounds are
 * *the same schema objects* as `lib/contracts/measurements.ts` — a copy that
 * "cannot drift once #109 lands" was a promise; an import is a proof.
 */
export const MeasurementExportSchema = z.object({
  measuredOn: LocalDateSchema,
  kind: MeasurementKindSchema,
  value: WeightKgSchema,
}).strict();

export const PersonalRecordExportSchema = z.object({
  id: UuidSchema,
  exerciseId: UuidSchema,
  bestE1rm: WeightKgSchema,
  achievedAt: IsoDateTimeSchema,
  /** `null` is reachable: the FK is nullable in `db/schema` by construction. */
  sessionId: UuidSchema.nullable(),
}).strict();

export const ImportBatchExportSchema = z.object({
  id: UuidSchema,
  sourceFingerprint: z.string().min(1),
  /** Stored as JSON *text* (`importBatches.report`); the builder parses before validating. */
  report: ImportReportSchema,
  createdAt: IsoDateTimeSchema,
}).strict();

export const ExportUserSchema = z.object({
  id: UuidSchema,
  email: z.string().min(3).max(320),
  displayName: z.string().max(80).nullable(),
  joinedAt: IsoDateTimeSchema,
  preferredUnit: PreferredUnitSchema,
}).strict();

export const ExportV1Schema = z.object({
  version: z.literal('v1'),
  exportedAt: z.string().datetime(),
  user: ExportUserSchema,
  sessions: z.array(SessionExportSchema).max(EXPORT_SESSION_CAP),
  personalRecords: z.array(PersonalRecordExportSchema),
  imports: z.array(ImportBatchExportSchema),
  measurements: z.array(MeasurementExportSchema),
  truncated: z.boolean(),
  oldestExcluded: LocalDateSchema.nullable(),
}).strict();

export const ExportResponseSchema = createAppEnvelopeSchema(ExportV1Schema);

export type ExportSet = z.infer<typeof ExportSetSchema>;
export type ExportTask = z.infer<typeof ExportTaskSchema>;
export type SessionExport = z.infer<typeof SessionExportSchema>;
export type MeasurementExport = z.infer<typeof MeasurementExportSchema>;
export type PersonalRecordExport = z.infer<typeof PersonalRecordExportSchema>;
export type ImportBatchExport = z.infer<typeof ImportBatchExportSchema>;
export type ExportUser = z.infer<typeof ExportUserSchema>;
export type ExportV1 = z.infer<typeof ExportV1Schema>;
