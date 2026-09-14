/**
 * M4-24 (#142) — the Content-Security-Policy baseline, as a pure string builder.
 *
 * Kept out of `src/middleware.ts` on purpose (the card's "one CSP statement"): the policy is
 * the contract, the middleware is only its delivery vehicle, and the contract needs to be
 * assertable without booting a server — the set-comparison and the "Sentry before Sentry
 * exists" scenario both run here as plain unit tests.
 *
 * The token set is exactly the card's table (docs/tasks/m4/M4-24-csp-baseline.md §Scope):
 * RFC §5's server-sent, nonce-based policy — no `'unsafe-inline'` in any mode, ever — plus
 * the two dev concessions Next documents (`'unsafe-eval'` for React's dev stack, gated on
 * `NODE_ENV`) and nothing else. `connect-src` pre-opens both documented Sentry ingest shapes
 * per spec §9.3(1): #95 proves their width and narrows to the configured DSN origin in its
 * own PR; widening any *other* directive to make Sentry work violates this card.
 *
 * Deliberately absent, each with a card-named reason: report-uri/report-to (no sink exists;
 * the e2e violation battery gives the same signal against the enforced header) · HSTS
 * (unverifiable on a plain-HTTP harness) · COOP/COEP/CORP (no open card owns isolation) ·
 * frame-src (the YouTube allowance lived only in the estate #103 deletes).
 */

/** Both documented Sentry ingest host shapes; #95 narrows to one in its own PR. */
export const SENTRY_INGEST_SOURCES = [
  'https://*.sentry.io',
  'https://*.ingest.sentry.io',
] as const;

export interface CspOptions {
  /** Per-request nonce; this module never generates one and never hardcodes one. */
  nonce: string;
  /** True only for the dev server (`NODE_ENV === 'development'`). */
  dev: boolean;
}

export function buildCsp({ nonce, dev }: CspOptions): string {
  const directives: string[] = [
    `default-src 'self'`,
    // strict-dynamic propagates trust to what the framework loader appends — how Next's
    // chunks survive a 'self' + nonce policy. It does NOT cover connect-src; see the header.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    // Strict style is affordable because zero style={{…}} and zero <style> were measured
    // in src/. A later card that needs one edits this line with a test, not unsafe-inline.
    `style-src 'self' 'nonce-${nonce}'`,
    `connect-src 'self' ${SENTRY_INGEST_SOURCES.join(' ')}`,
    `img-src 'self'`,
    `font-src 'self'`,
    `media-src 'self'`,
    `worker-src 'self'`, // pre-clears #111: its service worker stays same-origin
    `child-src 'self'`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
  ];

  // Production-only: the local harness is plain HTTP, and a directive unverifiable there is
  // kept honest by shipping only where a real edge makes it observable.
  if (!dev) directives.push(`upgrade-insecure-requests`);

  return directives.join('; ');
}
