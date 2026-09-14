import { connection } from 'next/server';

/**
 * M4-24 (#142): a custom root not-found boundary that exists for exactly one reason —
 * the built-in `/_not-found` document was one of the app's two ○ (Static) routes, and a
 * static document cannot carry the per-request CSP nonce this app now ships (it builds
 * green and its inline scripts are blocked at runtime). `connection()` pays the same
 * price named for /sign-in. The "unmatched path (404)" scenario of AC-1 and the
 * violation sweep in tests/e2e/csp.spec.ts are its tripwires.
 */
export default async function NotFound() {
  await connection();
  return (
    <main>
      <h1>404</h1>
      <p>This page could not be found</p>
    </main>
  );
}
