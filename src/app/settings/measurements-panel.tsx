'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  MEASUREMENT_RANGE_CAP,
  MeasurementKindSchema,
  type Measurement,
  type MeasurementKind,
} from '../../../lib/contracts/measurements';
import { kgToDisplay, parseWeightToKg } from '../../../lib/domain/units';
import type { PreferredUnit } from '../../../lib/contracts/profile';

/**
 * M4-20 (#109): the body-measurement panel — the apology card replaced by
 * the thing it apologized for.
 *
 * Write posture is **server-echo, per grill finding G-3**: the list renders
 * exclusively from `GET`; submit disables the button until the POST resolves;
 * success refetches the range; failure shows the server's message verbatim.
 * No optimistic row exists to be wrong, which is what keeps this panel off
 * #107's road: the only client-side state is the form draft itself, which
 * survives until the server says otherwise.
 */

const KIND_LABELS: Record<MeasurementKind, string> = {
  body_weight: 'Body weight',
  body_fat_pct: 'Body fat %',
  neck_cm: 'Neck (cm)',
  waist_cm: 'Waist (cm)',
  chest_cm: 'Chest (cm)',
  hip_cm: 'Hip (cm)',
};

function localToday(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function dayMinus(iso: string, days: number): string {
  const [y = 1970, m = 1, d = 1] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d - days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

/** The unit is a display concern (ADR-0005): only body_weight converts; the
 * `_cm` and `_pct` kinds are the same number on any screen, in any locale. */
function displayValue(row: Measurement, unit: PreferredUnit): string {
  if (row.kind === 'body_weight') return kgToDisplay(row.value, unit).toFixed(1);
  return String(row.value);
}

function unitSuffix(kind: MeasurementKind, unit: PreferredUnit): string {
  if (kind === 'body_weight') return unit;
  return kind === 'body_fat_pct' ? '%' : 'cm';
}

export function MeasurementsPanel({ unit }: { unit: PreferredUnit }) {
  const [rows, setRows] = useState<Measurement[]>([]);
  const [measuredOn, setMeasuredOn] = useState(localToday);
  const [kind, setKind] = useState<MeasurementKind>('body_weight');
  const [value, setValue] = useState('');
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // setState lives in the promise continuations, never in the effect body —
  // the effect's only synchronous act is starting the load.
  const refetch = useCallback((): Promise<void> => {
    const to = localToday();
    return fetch(`/api/measurements?from=${dayMinus(to, 90)}&to=${to}`)
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null)
      .then((body) => {
        if (body?.ok) setRows(body.data as Measurement[]);
      });
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setStatus(null);

    const numeric = Number(value);
    const wireValue =
      kind === 'body_weight' ? parseWeightToKg(value, unit) : numeric;
    if (wireValue === null || Number.isNaN(numeric)) {
      setError(
        kind === 'body_weight'
          ? `Enter a weight in ${unit === 'lbs' ? 'pounds' : 'kilograms'}.`
          : `Enter a number in ${unitSuffix(kind, unit)}.`,
      );
      return;
    }

    setPending(true);
    try {
      const response = await fetch('/api/measurements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ measuredOn, kind, value: wireValue }),
      });
      const body = await response.json().catch(() => null);
      if (response.ok && body?.ok) {
        setStatus(
          `${KIND_LABELS[kind]} ${displayValue(body.data as Measurement, unit)}${unitSuffix(kind, unit)} saved for ${measuredOn}.`,
        );
        setValue('');
        await refetch();
      } else {
        // PD-7's honesty class: the server's reason, verbatim, not a shrug.
        setError(body?.error?.message ?? 'Could not save that measurement.');
      }
    } catch {
      setError('Network problem — nothing was sent. The draft is still here.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={onSubmit}
        data-testid="measurement-form"
        className="flex flex-wrap items-end gap-3"
      >
        <label className="flex flex-col gap-1 text-sm">
          Date
          <input
            type="date"
            data-testid="measurement-date"
            value={measuredOn}
            max={localToday()}
            onChange={(e) => setMeasuredOn(e.target.value)}
            className="rounded-md border bg-transparent px-2 py-1"
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Kind
          <select
            data-testid="measurement-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as MeasurementKind)}
            className="rounded-md border bg-transparent px-2 py-1"
          >
            {MeasurementKindSchema.options.map((option) => (
              <option key={option} value={option}>
                {KIND_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Value ({unitSuffix(kind, unit)})
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            max="1000"
            data-testid="measurement-value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-28 rounded-md border bg-transparent px-2 py-1"
            required
          />
        </label>
        <button
          type="submit"
          data-testid="measurement-submit"
          disabled={pending}
          className="rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
      </form>

      {status && (
        <p role="status" data-testid="measurement-status" className="text-sm">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" data-testid="measurement-error" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="measurement-empty">
          No measurements in the last 90 days — the first one you save appears here.
        </p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm" aria-label="Recent measurements">
          {rows.map((row) => (
            <li
              key={`${row.measuredOn}:${row.kind}`}
              data-testid="measurement-row"
              className="flex justify-between gap-4"
            >
              <span>
                {row.measuredOn} · {KIND_LABELS[row.kind]}
              </span>
              <span className="font-medium">
                {displayValue(row, unit)} {unitSuffix(row.kind, unit)}
              </span>
            </li>
          ))}
          {rows.length >= MEASUREMENT_RANGE_CAP && (
            <li className="text-xs text-muted-foreground">
              Showing the {MEASUREMENT_RANGE_CAP}-row window; older entries need a narrower range.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
