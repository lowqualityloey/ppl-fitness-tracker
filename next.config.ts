import type { NextConfig } from "next";
// The `/config` subpath, not the package root: at this pin the SDK deprecates the root
// import ("will stop working in v11"), and a build that prints a deprecation nobody
// acted on is the next major's surprise.
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  /* config options here */
  async headers() {
    return [
      {
        // M4-22 (#111): `/sw.js` is the update-detection surface, not an asset. Public
        // files otherwise ship without a Cache-Control and fall to heuristic caching,
        // which would delay every deploy's byte-check indefinitely; `no-cache` makes the
        // stamped version observable on the next navigation instead of riding 24 h polls.
        // (M4-24 rejected headers() *for the CSP nonce* — a static string cannot carry one.
        // A static per-path header is precisely what this facility is for.)
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache' }],
      },
    ];
  },
};

/*
 * M4-06 (#95) — the one line of Sentry build configuration this app needs, and it is
 * not about source maps.
 *
 * `tunnelRoute` makes the SDK send browser envelopes to `<same origin>/monitoring` and
 * injects the Next rewrite that forwards them onward. Two things follow, and they are
 * why this is a configuration choice rather than a default:
 *
 *  1. **`connect-src` can stay `'self'`.** M4-24 opened `https://*.sentry.io` and
 *     `https://*.ingest.sentry.io` on the assumption that the browser would post to a
 *     third-party origin. With the tunnel that assumption is gone, so both entries are
 *     deleted in this PR — M4-24's rule 3, and the only directive edit #95 is allowed
 *     to make. `tests/e2e/csp.spec.ts`'s all-page-types sweep is what notices a
 *     regression: browser ingest that stops being same-origin becomes a violation
 *     rather than a silently lost event.
 *  2. The ad-blocker benefit is real but secondary. The honest primary is that a
 *     personal-data app shipping a second third-party origin in its policy is a wider
 *     surface than the feature needs.
 *
 * No `org`, no `project`, no auth token: uploading source maps is a deploy concern
 * gated on #16, and `SENTRY_AUTH_TOKEN` is build-CI-only by spec §5.1. A release
 * pipeline this app does not have should not be pretended at in config — without those
 * keys the wrapper still installs the tunnel rewrite and skips the upload step.
 */
const PROOF_RELEASE = process.env.SENTRY_RELEASE ?? process.env.NEXT_PUBLIC_SENTRY_RELEASE;

export default withSentryConfig(nextConfig, {
  tunnelRoute: '/monitoring',
  // The SDK's own build chatter is noise in `npm run next:build`; failures still print.
  silent: !process.env.CI,

  /*
   * Release attribution, and why it needs a build-time option rather than only the
   * `release` passed to `Sentry.init`.
   *
   * Measured, not assumed: with only the init option set, the browser envelope arrived at
   * the ingest endpoint with `release: null` — `process.env.SENTRY_RELEASE` is not
   * inlined into a client bundle (only `NEXT_PUBLIC_*` names are), so the client's
   * `resolveRelease()` had nothing to read. The card's Scope asks for events "so a
   * 5-slice-old error is attributable", which on the browser plane is exactly the event
   * that was unattributed.
   *
   * The SDK's own client entry reads `process.env._sentryRelease`, which this option
   * causes the build to define — that is the injection, and `inject` is not a field of
   * this option's type at the pin (a `tsc` error, not a style preference).
   * `create: false` and `finalize: false` keep this app from needing an auth token or an
   * API call at build,
   * which spec §5.1 reserves for a deploy pipeline that does not exist yet (#16). A
   * release object still appears in Sentry, because any event carrying a release creates
   * one — that is the SDK's documented behaviour, and it is the outcome the card wants.
   */
  release:
    PROOF_RELEASE !== undefined && PROOF_RELEASE.trim() !== ''
      ? { name: PROOF_RELEASE.trim(), create: false, finalize: false }
      : undefined,
});
