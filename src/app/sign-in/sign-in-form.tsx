'use client';

import { FormEvent, useState } from 'react';

type FormState = 'idle' | 'submitting' | 'sent' | 'error' | 'offline';

export function SignInForm() {
  const [state, setState] = useState<FormState>('idle');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState('submitting');
    const form = new FormData(event.currentTarget);
    /*
     * M4-22 (#111), AC-3: a cold start on /sign-in while offline is served the cached shell
     * by the service worker (network-first navigation, PD-2/PD-3), so this form can be
     * *visible* even though no request will ever land. The distinguishing test is not
     * "did it 401" — an offline `fetch` rejects with a `TypeError` before any response
     * exists, which is a different animal from the server's generic refusal. Collapsing the
     * two would make a concrete-box failure read as "unauthorized", the exact thing AC-3
     * forbids. The try/catch is what keeps `state` off a stuck `submitting` too — the
     * unhandled rejection this branch replaces left the button dead.
     */
    try {
      const response = await fetch('/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.get('email') }),
      });
      setState(response.ok ? 'sent' : 'error');
    } catch {
      // Network-layer failure: no response arrived at all. That is offline, not rejection.
      setState('offline');
    }
  }

  return (
    <form onSubmit={submit}>
      <label htmlFor="email">Email address</label>
      <input id="email" name="email" type="email" autoComplete="email" required />
      <button type="submit" disabled={state === 'submitting'}>
        {state === 'submitting' ? 'Sending link…' : 'Email me a sign-in link'}
      </button>
      <p aria-live="polite" data-testid="sign-in-message">
        {state === 'sent' && 'If the address is registered, a sign-in link has been sent.'}
        {state === 'error' && 'Unable to request a link. Please try again later.'}
        {state === 'offline' && 'You appear to be offline. Reconnect and try again.'}
      </p>
    </form>
  );
}
