'use client';

import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { ImportReportSchema, type ImportReport } from '../../../lib/contracts/import';

/**
 * The legacy import (M3-09, #66, task 3).
 *
 * **This reads `localStorage` and deletes nothing.** The old app's sources were deleted by
 * #103/M4-14, but the user's browser may still hold what it wrote back then — this panel is
 * the retirement plan for those keys, and clearing them here would turn the one-way trip into
 * exactly the data loss the rule forbade: a user who hesitates mid-import must still find
 * their source slots intact.
 *
 * Only the three progress slots are read. `LEGACY_KEYS` in the importer also names `userStats`, and
 * if that slot exists it is reported below as **not imported** rather than skipped in silence — the
 * difference between "the app saw it and chose not to model it" and "the app never looked".
 */
const READ_SLOTS = ['pushWorkoutProgress', 'legsWorkoutProgress', 'pullDayProgress'] as const;
const IGNORED_SLOTS = ['userStats'] as const;

type SlotState = 'absent' | 'read' | 'malformed';

interface SlotReading {
  readonly key: (typeof READ_SLOTS)[number];
  readonly state: SlotState;
  readonly value?: unknown;
}

export function ImportPanel() {
  const [report, setReport] = useState<ImportReport | null>(null);
  const [readings, setReadings] = useState<SlotReading[] | null>(null);
  const [ignoredPresent, setIgnoredPresent] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function runImport() {
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setError('Import needs the server, and this browser reports no connection.');
        return;
      }

      const next: SlotReading[] = [];
      const payload: Record<string, unknown> = {};
      for (const key of READ_SLOTS) {
        const raw = window.localStorage.getItem(key);
        if (raw === null || raw === '') {
          next.push({ key, state: 'absent' });
          continue;
        }
        try {
          const parsed: unknown = JSON.parse(raw);
          payload[key] = parsed;
          next.push({ key, state: 'read' });
        } catch {
          // The **slot name only**. A malformed record's contents can hold a workout — or a
          // half-written fragment of whatever else that key once carried — and a settings panel is
          // not where that gets echoed back to a screen.
          next.push({ key, state: 'malformed' });
        }
      }
      setIgnoredPresent(
        IGNORED_SLOTS.filter((key) => window.localStorage.getItem(key) !== null),
      );
      setReadings(next);

      const malformed = next.filter((reading) => reading.state === 'malformed');
      if (Object.keys(payload).length === 0) {
        setError(
          malformed.length > 0
            ? `Nothing could be imported: ${malformed.map((m) => m.key).join(', ')} could not be read.`
            : 'Nothing to import: this browser holds no legacy workout data.',
        );
        return;
      }

      const response = await fetch('/api/import/legacy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => null)) as {
        data?: { report?: unknown };
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        setError(body?.error?.message ?? `The server refused the import (${response.status}).`);
        return;
      }
      const parsedReport = ImportReportSchema.safeParse(body?.data?.report);
      if (!parsedReport.success) {
        // Refusing to render a report this screen cannot read is the same rule #61 applied to the
        // dashboard: an invented "Import complete" over an unparseable payload would be the precise
        // failure mode this whole card exists to prevent.
        setError('The import finished but returned a report this screen cannot read.');
        return;
      }
      setReport(parsedReport.data);
    } catch {
      setError('The request never reached the server, so nothing was imported.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import from the old dashboard</CardTitle>
        <CardDescription>
          Copies the two years of workouts this browser has been keeping into your account. The old
          data is left in place. Repeating the import cannot double your log: the server recognises
          the same source and returns the report it already produced.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Button onClick={() => void runImport()} disabled={busy} data-testid="import-run">
          {busy ? 'Importing…' : 'Import my old workouts'}
        </Button>

        {error ? (
          <p role="alert" className="text-sm" data-testid="import-error">
            {error}
          </p>
        ) : null}

        {readings ? (
          <ul className="flex flex-col gap-1 text-xs text-muted-foreground" data-testid="import-slots">
            {readings.map((reading) => (
              <li key={reading.key}>
                {reading.key} — {SLOT_WORD[reading.state]}
              </li>
            ))}
            {ignoredPresent.map((key) => (
              <li key={key}>
                {key} — left alone: body measurements are not modelled by this app yet
              </li>
            ))}
          </ul>
        ) : null}

        {report ? <ReportView report={report} /> : null}
      </CardContent>
    </Card>
  );
}

const SLOT_WORD: Record<SlotState, string> = {
  absent: 'nothing stored here',
  read: 'read and sent',
  malformed: 'could not be parsed, skipped (the others were still imported)',
};

/**
 * Every field the server reported, including the ones nobody wants to read.
 *
 * The card names this as the failure mode: a dialog that says only "Import successful" is a lie by
 * omission, because legacy sessions were never recorded with weight or reps and pull-day data is
 * lossy by construction. So `fieldsNotRecovered` is rendered as a list of its own, above the counts,
 * and the low date-confidence note is rendered when present rather than folded away.
 */
function ReportView({ report }: { report: ImportReport }) {
  return (
    <div className="flex flex-col gap-3 rounded-md border p-4" data-testid="import-report">
      <p className="text-sm font-medium" data-testid="import-counts">
        {report.sessionsCreated} {report.sessionsCreated === 1 ? 'session' : 'sessions'} created ·{' '}
        {report.setsRecovered} {report.setsRecovered === 1 ? 'set' : 'sets'} recovered
      </p>

      {report.fieldsNotRecovered.length > 0 ? (
        <div>
          <p className="text-sm font-medium">Could not be recovered</p>
          <ul className="list-disc pl-5 text-sm" data-testid="import-not-recovered">
            {report.fieldsNotRecovered.map((field) => (
              <li key={field}>{field}</li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            The old dashboard never stored these, so no import could recover them. Your sets appear
            as completed without weights, which is what actually happened.
          </p>
        </div>
      ) : null}

      {report.dateConfidence === 'low' ? (
        <p className="text-sm" data-testid="import-date-low">
          Some sessions had no date recorded. They are filed under the day they were imported, which
          may not be the day you trained.
        </p>
      ) : null}

      {report.warnings && report.warnings.length > 0 ? (
        <ul className="flex flex-col gap-1 text-xs text-muted-foreground" data-testid="import-warnings">
          {report.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
