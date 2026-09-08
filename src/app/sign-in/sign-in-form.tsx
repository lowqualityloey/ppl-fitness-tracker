'use client';

import { FormEvent, useState } from 'react';

type FormState = 'idle' | 'submitting' | 'sent' | 'error';

export function SignInForm() {
  const [state, setState] = useState<FormState>('idle');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState('submitting');
    const form = new FormData(event.currentTarget);
    const response = await fetch('/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: form.get('email') }),
    });
    setState(response.ok ? 'sent' : 'error');
  }

  return (
    <form onSubmit={submit}>
      <label htmlFor="email">Email address</label>
      <input id="email" name="email" type="email" autoComplete="email" required />
      <button type="submit" disabled={state === 'submitting'}>
        {state === 'submitting' ? 'Sending link…' : 'Email me a sign-in link'}
      </button>
      <p aria-live="polite">
        {state === 'sent' && 'If the address is registered, a sign-in link has been sent.'}
        {state === 'error' && 'Unable to request a link. Please try again later.'}
      </p>
    </form>
  );
}
