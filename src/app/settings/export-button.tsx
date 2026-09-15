'use client';

import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { EXPORT_SESSION_CAP, ExportV1Schema } from '../../../lib/contracts/export';

/**
 * M4-21 (#110): the export download.
 *
 * The response is fetched through JS rather than as a plain link because the
 * honest-degradation branch has to be *read* before it can be shown: a browser
 * that only saved the file would hide `truncated: true` inside it, and
 * ASSUMPTION-m4-003's promise was that the cap never silently shrinks
 * somebody's archive. Same rule #66's import panel follows — render what the
 * server actually said, and refuse to invent a success message over a payload
 * this screen cannot parse.
 */
export function ExportButton() {
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState<{ oldestExcluded: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    setError(null);
    setTruncated(null);
    try {
      const response = await fetch('/api/export/v1', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const text = await response.text();
      let body: unknown = null;
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        body = null;
      }
      if (!response.ok || body === null || typeof body !== 'object' ||
          (body as { ok?: boolean }).ok !== true) {
        const message = (body as { error?: { message?: string } })?.error?.message;
        setError(message ?? `The server refused the export (${response.status}).`);
        return;
      }
      const parsed = ExportV1Schema.safeParse((body as { data: unknown }).data);
      if (!parsed.success) {
        setError('The export completed but returned an archive this screen cannot read.');
        return;
      }
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `ppl-export-v1-${parsed.data.exportedAt.slice(0, 10).replaceAll('-', '')}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      if (parsed.data.truncated) {
        setTruncated({ oldestExcluded: parsed.data.oldestExcluded ?? 'an unknown date' });
      }
    } catch {
      setError('The request never reached the server, so nothing was downloaded.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your data, as a file</CardTitle>
        <CardDescription>
          One JSON archive of everything this account holds: profile, sessions with their sets and
          tasks, personal records, and import history. Weights are stored and exported in kilograms;
          your unit preference travels with the file as a label, nothing more.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button onClick={() => void download()} disabled={busy} data-testid="export-download">
          {busy ? 'Preparing…' : 'Download my archive'}
        </Button>
        {error ? (
          <p role="alert" className="text-sm" data-testid="export-error">
            {error}
          </p>
        ) : null}
        {truncated ? (
          <p role="alert" className="text-sm text-muted-foreground" data-testid="export-truncated">
            This archive holds the {EXPORT_SESSION_CAP} most recent sessions. Sessions before{' '}
            {truncated.oldestExcluded} were not included — say so to support, the cap is a product
            limit, not your data being gone.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
