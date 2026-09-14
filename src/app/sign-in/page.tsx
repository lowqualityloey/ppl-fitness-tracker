import { connection } from 'next/server';
import { SignInForm } from './sign-in-form';

/**
 * M4-24 (#142): this was one of exactly two ○ (Static) routes of nineteen. It is dynamic
 * now, and this `connection()` call is why — the CSP the middleware ships carries a fresh
 * nonce per request, and Next can only stamp its inline Flight scripts with a nonce it can
 * see at render time. A static page under a nonce policy **builds green and fails at
 * runtime** (Next states this plainly); the nonce price named on the card is paid here.
 * AC-6 pins it: after the build, /sign-in must read ƒ with this diff as the named cause.
 */
export default async function SignInPage() {
  await connection();
  return (
    <main>
      <h1>Sign in</h1>
      <p>We’ll email you a one-time sign-in link.</p>
      <SignInForm />
    </main>
  );
}
