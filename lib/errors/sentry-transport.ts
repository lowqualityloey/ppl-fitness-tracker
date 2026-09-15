/**
 * M4-06 (#95) — the adapter that turns a report into a Sentry event.
 *
 * The app's own code never imports `@sentry/nextjs`: only the two SDK init files do,
 * and they hand the transport a `capture` callback shaped like this module's
 * `ErrorCapture`. That inversion buys three things this card specifically needs —
 * the mapping is unit-testable without the SDK loading, the seam has exactly one
 * place where Sentry's vocabulary is spoken, and `reporter.ts` stays importable from
 * a browser bundle that has no Sentry on the server side of it.
 *
 * What the mapping guarantees, and what it deliberately does not:
 *
 * - **`kind` is a tag, never a message prefix.** AC-3 asks that a producer defect
 *   "says so distinctly from a caller 400". A prefix reads well in one event and is
 *   unfilterable across a thousand; a tag is how the channel is actually queried.
 * - **The correlation fields ride as tags with the logger's own spellings.** G-M4-2 is
 *   "one correlation id from a client tap to route log line to Sentry event" — the id
 *   is only the same if the *key* is the same, and `lib/logger` writes `request_id`.
 *   A `requestId` tag beside a `request_id` log field is two ids that look like one.
 * - **`release` is not a tag.** Both SDK init files pass `resolveRelease()` to
 *   `Sentry.init({ release })`, which stamps it on every event in its own field; a
 *   `release` tag beside a `release` field is two spellings of one fact, which is the
 *   drift the naming rule above exists to prevent. The reporter still resolves it, so
 *   a non-Sentry transport (a test, a future sink) receives it in `event.release`.
 * - **`fingerprint` is left alone.** Sentry groups by stack, which for a
 *   `ContractViolationError` thrown from `validateOutgoing` is already the right
 *   bucket; overriding grouping to `[kind, source]` would merge every defect a route
 *   ever had into one issue and make the channel less readable than the logs. If a
 *   later card finds grouping too fine, it changes this line with a measurement.
 */

import type { ErrorEvent, ErrorTransport } from './reporter';

/** The subset of `Sentry.captureException` this adapter depends on. */
export type ErrorCapture = (error: unknown, hint: { tags: Record<string, string>; extra: Record<string, unknown> }) => void;

function tagStrings(value: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, field] of Object.entries(value)) {
    if (field !== '') out[key] = field;
  }
  return out;
}

/**
 * Build the transport. `capture` is expected to be safe to call from an error path;
 * the reporter already guards a throwing transport, so this function does not.
 */
export function createSentryTransport(capture: ErrorCapture): ErrorTransport {
  return (event: ErrorEvent): void => {
    const tags: Record<string, string> = {
      plane: event.plane,
      kind: event.kind,
      source: event.source,
      ...tagStrings({
        request_id: event.correlation.requestId ?? '',
        user_id: event.correlation.userId ?? '',
        session_id: event.correlation.sessionId ?? '',
      }),
    };

    capture(event.error, {
      tags,
      extra: {
        reportedMessage: event.message,
        reportedAt: event.occurredAt,
        attributes: event.attributes,
      },
    });
  };
}
