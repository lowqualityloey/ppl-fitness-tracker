import { describe, expect, it } from 'vitest';
import { EXPORT_SESSION_CAP, ExportV1Schema } from '../../../lib/contracts/export';
import type {
  ArchiveSessionRow,
  ArchiveUserRow,
  ExportArchiveRows,
} from '../../../lib/export/v1';
import { buildExportV1 } from '../../../lib/export/v1';

/**
 * M4-21 (#110), AC scenario 3 in its pure half: the envelope is
 * self-describing, and the cap arithmetic ([ASSUMPTION-m4-003]) is a *builder*
 * property, so it is locked here where 201 rows cost 201 object literals
 * rather than 201 seeded sessions. The integration suite proves the route
 * ships what this proves the builder builds.
 */

function sessionRow(overrides: Partial<ArchiveSessionRow> & { id: string; localDate: string }): ArchiveSessionRow {
  return {
    clientId: '11111111-1111-4111-8111-111111111111',
    routineDayId: '22222222-2222-4222-8222-222222222222',
    status: 'completed',
    phase: 'post_workout',
    source: 'app',
    startedAt: new Date(`${overrides.localDate}T12:00:00.000Z`),
    completedAt: new Date(`${overrides.localDate}T12:52:00.000Z`),
    serverSeq: 0,
    sets: [],
    tasks: [],
    ...overrides,
  };
}

const user: ArchiveUserRow = {
  id: '33333333-3333-4333-8333-333333333333',
  email: 'lifter@example.com',
  displayName: null,
  joinedAt: new Date('2026-01-01T00:00:00.000Z'),
  preferredUnit: 'lbs',
};

function archive(
  sessions: ArchiveSessionRow[],
  measurements: ExportArchiveRows['measurements'] = [],
): ExportArchiveRows {
  return { user, sessions, personalRecords: [], imports: [], measurements };
}

const at = new Date('2026-09-16T09:00:00.000Z');

/** The contract requires UUID ids; fixture rows get deterministic ones. */
const sid = (n: number): string =>
  `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;

describe('buildExportV1', () => {
  it('is accepted by its own contract', () => {
    const payload = buildExportV1(
      archive([sessionRow({ id: sid(1), localDate: '2026-09-15' })]),
      at,
    );
    expect(ExportV1Schema.safeParse(payload).success).toBe(true);
  });

  it('locks the version literal and the export timestamp (AC: self-describing)', () => {
    const payload = buildExportV1(archive([]), at);
    expect(payload.version).toBe('v1');
    expect(payload.exportedAt).toBe('2026-09-16T09:00:00.000Z');
  });

  it('is honest about kg-canonical storage next to a non-kg preference (ADR-0005)', () => {
    const sessions = [
      sessionRow({
        id: sid(1),
        localDate: '2026-09-15',
        sets: [{
          id: 's1',
          exerciseId: '44444444-4444-4444-8444-444444444444',
          setIndex: 0,
          isCompleted: true,
          weightKg: '100.00',
          reps: 5,
          clientTs: new Date('2026-09-15T12:00:00.000Z'),
        }],
      }),
    ];
    const payload = buildExportV1(archive(sessions), at);
    expect(payload.user.preferredUnit).toBe('lbs');
    expect(payload.sessions[0]!.sets[0]!.weightKg).toBe(100);
  });

  it('fills the reserved slot from rows, numeric-string to number (OC-2)', () => {
    const payload = buildExportV1(
      archive([], [{ measuredOn: '2026-09-16', kind: 'body_weight', value: '82.50' }]),
      at,
    );
    expect(payload.measurements).toEqual([
      { measuredOn: '2026-09-16', kind: 'body_weight', value: 82.5 },
    ]);
    expect(ExportV1Schema.safeParse(payload).success).toBe(true);
  });

  it('an athlete with no measurements still gets the key, empty not absent', () => {
    const payload = buildExportV1(archive([]), at);
    expect(payload.measurements).toEqual([]);
  });

  it('does not truncate at or below the cap', () => {
    const sessions = Array.from({ length: EXPORT_SESSION_CAP }, (_, i) =>
      sessionRow({ id: sid(i), localDate: '2026-01-01' }),
    );
    const payload = buildExportV1(archive(sessions), at);
    expect(payload.truncated).toBe(false);
    expect(payload.oldestExcluded).toBeNull();
    expect(payload.sessions).toHaveLength(EXPORT_SESSION_CAP);
  });

  it('truncates above the cap and names the newest excluded session honestly', () => {
    const dayBefore = (i: number): string =>
      new Date(Date.UTC(2026, 6, 31) - i * 86_400_000).toISOString().slice(0, 10);
    const sessions = Array.from({ length: EXPORT_SESSION_CAP + 2 }, (_, i) =>
      sessionRow({ id: sid(i), localDate: dayBefore(i) }),
    );
    const payload = buildExportV1(archive(sessions), at);
    expect(payload.truncated).toBe(true);
    expect(payload.sessions).toHaveLength(EXPORT_SESSION_CAP);
    // Input order is newest-first (the repository's contract); the 201st row
    // is the newest one that did NOT make the cut.
    expect(payload.oldestExcluded).toBe(sessions[EXPORT_SESSION_CAP]!.localDate);
  });

  it('refuses an over-cap builder result through the contract itself', () => {
    // The builder slices to the cap, so a hand-appended 201st row proves
    // `sessions.max()` is load-bearing: a future builder bug must 500 at
    // validateOutgoing, not ship an over-cap envelope.
    const oversized = buildExportV1(
      archive(Array.from({ length: EXPORT_SESSION_CAP + 1 }, (_, i) =>
        sessionRow({ id: sid(i), localDate: '2026-01-01' }),
      )),
      at,
    );
    expect(ExportV1Schema.safeParse({ ...oversized, sessions: [
      ...oversized.sessions,
      sessionRow({ id: sid(999), localDate: '2025-12-31' }),
    ] }).success).toBe(false);
  });
});
