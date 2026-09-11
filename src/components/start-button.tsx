'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Button } from './ui/button';

interface StartButtonProps {
  routineDayId: string;
  dayName: string;
}

/**
 * The one mutation the dashboard performs, and deliberately the only interactive
 * element on a day card.
 *
 * It posts to `POST /api/sessions` — the contract route, already tested in
 * `tests/integration/api/` — rather than to a page-local endpoint or a Server
 * Action, because there must be exactly one way to start a workout in this codebase
 * until the outbox exists. RFC §8.1 says `session.start` is **not** a sync
 * operation: this button requires connectivity, queues nothing, and retries
 * nothing. When the request cannot reach the server the message says the workout
 * was *not* started; anything softer would be a lie about durability that M3-05
 * (#62) is the only thing entitled to make true.
 *
 * The `clientId` is generated once per mount and **reused on retry**. That is not a
 * detail: `WorkoutRepository.startSession` looks up by `clientId` first and returns
 * the existing session, so a user whose first attempt timed out on the way back
 * (201 arrived, response lost) gets the same session on the second press instead of
 * a duplicate. A fresh uuid per attempt would silently create two in-progress
 * sessions for the day and surface the second one.
 */
export function StartButton({ routineDayId, dayName }: StartButtonProps) {
  const clientIdRef = useRef<string | null>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleStart(): Promise<void> {
    if (clientIdRef.current === null) clientIdRef.current = crypto.randomUUID();
    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ routineDayId, clientId: clientIdRef.current }),
      });
      const payload: unknown = await response.json().catch(() => null);
      const sessionId = readSessionId(payload);

      if (response.status === 409) {
        // The day already has a session — started on another device, or by a
        // request whose response this page never saw. §4.3's rule for a rejected
        // mutation applies to this rejection too: refetch authoritatively rather
        // than guess what the server holds. `router.refresh()` re-renders *this*
        // server component from the database, so the card becomes "In progress"
        // with a link to whatever actually exists; no client-side merge, and no
        // reload loop, because a refresh does not re-run this handler.
        router.refresh();
        return;
      }

      if (!response.ok || sessionId === null) {
        setMessage(
          response.status === 401
            ? 'Your session expired. Sign in again to start a workout.'
            : describeError(payload, `Could not start ${dayName}.`),
        );
        setBusy(false);
        return;
      }

      router.push(`/session/${sessionId}`);
    } catch {
      setMessage(`Could not reach the server. ${dayName} was not started.`);
    } finally {
      // Unconditional: `message` here is the closure's render-time value, not the
      // state just set above, so branching on it would read a stale null and the
      // guard would be decoration. Clearing busy on the success path is inert —
      // the navigation has already been handed off.
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="button" onClick={handleStart} disabled={busy}>
        {busy ? 'Starting…' : `Start ${dayName}`}
      </Button>
      <p aria-live="polite" role="status" className="min-h-5 text-sm text-muted-foreground">
        {message ?? ''}
      </p>
    </div>
  );
}

/** Pull `data.id` out of an `{ data, error }` envelope without assuming its type. */
function readSessionId(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const data = (payload as { data?: unknown }).data;
  if (typeof data !== 'object' || data === null) return null;
  const id = (data as { id?: unknown }).id;
  return typeof id === 'string' ? id : null;
}

function describeError(payload: unknown, fallback: string): string {
  if (typeof payload === 'object' && payload !== null) {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === 'object' && error !== null) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === 'string' && message.length > 0) return `${fallback} ${message}`;
    }
  }
  return `${fallback} Please try again.`;
}
