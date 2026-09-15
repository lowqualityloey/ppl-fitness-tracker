'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { purgeOfflineShellDocuments } from '../../../lib/offline/shell-cache';
import { Button } from '../../components/ui/button';

/**
 * Sign-out (M3-09, #66).
 *
 * A plain `<form method="post" action="/auth/signout">` was the first attempt — no JavaScript, and
 * the browser would follow the response. It cannot work: M2-06's handler answers
 * `NextResponse.json({ signedOut: true })`, so the form would navigate the tab to a wall of JSON
 * while the session cookie died behind it. The endpoint's shape decides that this needs a fetch and
 * an explicit navigation.
 *
 * A soft route change is not enough for the same reason: the cache has to go.
 */
export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/auth/signout', {
        method: 'POST',
        /*
         * `SignoutRequestSchema` is `z.object({}).strict()` — the endpoint demands a body that is
         * an empty JSON object, and a bodyless POST is a 400. That is not fussiness: it is the
         * CSRF posture in RFC §5.1. A cross-site form can only send `form-urlencoded` or a simple
         * text type, so a route that insists on parsed JSON cannot be driven from another origin
         * with the user's cookie. Omitting the body here looked like a broken button while the
         * session survived, which is the dangerous direction for a guard to fail.
         */
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error(String(response.status));
      /*
       * M4-22 (#111), PD-2's bound: the offline shell stored navigation documents that
       * carry this athlete's data. The cookie died above; the copies must not outlive it.
       */
      await purgeOfflineShellDocuments();
      /*
       * A hard navigation, not `router.push`.
       *
       * The client router keeps a cache of every server component it has rendered, and after
       * sign-out that cache is someone else's page waiting to be shown: `/history` would paint from
       * memory while the cookie that authorised it is gone. Reloading the document throws the whole
       * tree away and lets the server answer the next request with no session at all — which is the
       * behaviour this control exists to produce.
       */
      // Refresh first, then replace: the client router holds a cache of every server component it
      // has rendered, and after sign-out that cache is a signed-in tree waiting to be painted from
      // memory while the cookie that authorised it is gone. `refresh()` re-runs the renders against
      // the dead session so the next frame is answered by the server, not by what the browser
      // remembered.
      router.refresh();
      router.replace('/sign-in');
    } catch {
      setError('Could not reach the server, so you are still signed in.');
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button variant="outline" onClick={() => void signOut()} disabled={busy} data-testid="sign-out">
        {busy ? 'Signing out…' : 'Sign out'}
      </Button>
      {error ? (
        <p role="alert" className="text-xs" data-testid="sign-out-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
