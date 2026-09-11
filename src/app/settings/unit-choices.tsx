'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { PreferredUnitSchema, type PreferredUnit } from '../../../lib/contracts/profile';

/**
 * The unit radio group (M3-09, #66, task 2).
 *
 * Real `<input type="radio">` inside a `<fieldset>`, not styled divs with a click handler: that is
 * what buys arrow-key navigation, the radio group semantics a screen reader announces ("1 of 2,
 * selected"), and the disabled state — all of which a custom widget would have to be written again
 * and tested again to match.
 *
 * The change is written to the server before the screen reacts, and `router.refresh()` re-runs the
 * server components that read the preference. The alternative — keeping the unit in client state —
 * would put two answers on screen at once: this card saying `lb` while `/history` still printed kg.
 */
export function UnitChoices({ initialUnit }: { initialUnit: PreferredUnit }) {
  const router = useRouter();
  const groupId = useId();
  const [unit, setUnit] = useState<PreferredUnit>(initialUnit);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function choose(next: PreferredUnit) {
    if (next === unit || pending) return;
    const previous = unit;
    setPending(true);
    // Painted immediately because a radio that waits for the network feels broken; rolled back
    // below if the PATCH fails, because a control that looks set and isn't is worse — the athlete
    // would leave this screen believing their history is in lb.
    setUnit(next);
    setStatus('Saving…');
    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ preferredUnit: next }),
      });
      const body = (await response.json().catch(() => null)) as {
        data?: { preferredUnit?: unknown };
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        setUnit(previous);
        setStatus(body?.error?.message ?? `Could not save that preference (${response.status}).`);
        return;
      }
      // The server's answer, re-validated, is what becomes the local truth — not the value that was
      // sent. Same rule #63 applied to every optimistic write.
      const confirmed = PreferredUnitSchema.safeParse(body?.data?.preferredUnit);
      if (!confirmed.success) {
        setUnit(previous);
        setStatus('The server returned a preference this screen cannot read.');
        return;
      }
      setUnit(confirmed.data);
      setStatus(next === 'kg' ? 'Weights now shown in kilograms.' : 'Weights now shown in pounds.');
      router.refresh();
    } catch {
      setUnit(previous);
      setStatus('You appear to be offline, so the preference was not saved.');
    } finally {
      setPending(false);
    }
  }

  return (
    <fieldset className="flex flex-col gap-3" data-testid="unit-group">
      <legend className="text-sm font-medium">Show weights in</legend>
      {CHOICES.map((choice) => {
        const id = `${groupId}-${choice.value}`;
        return (
          <label
            key={choice.value}
            htmlFor={id}
            className="flex cursor-pointer items-start gap-3 rounded-md border p-3 has-[:checked]:border-2"
          >
            <input
              id={id}
              type="radio"
              name={`${groupId}-unit`}
              value={choice.value}
              checked={unit === choice.value}
              disabled={pending}
              onChange={() => {
                void choose(choice.value);
              }}
              data-testid={`unit-${choice.value}`}
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{choice.label}</span>
              <span className="text-xs text-muted-foreground">{choice.note}</span>
            </span>
          </label>
        );
      })}
      <p aria-live="polite" className="text-sm text-muted-foreground" data-testid="unit-status">
        {status ?? ''}
      </p>
    </fieldset>
  );
}

const CHOICES: { value: PreferredUnit; label: string; note: string }[] = [
  { value: 'kg', label: 'Kilograms', note: 'The unit every weight is stored in.' },
  { value: 'lbs', label: 'Pounds', note: 'Display only — shown to one decimal place.' },
];
