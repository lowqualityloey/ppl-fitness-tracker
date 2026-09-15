/**
 * M4-06 (#95) — the error-reporting seam, and the only place this app decides that a
 * defect is worth a third party's attention.
 *
 * Why a seam rather than `Sentry.captureException` at each site: the same reason
 * `lib/logger` is a sink and not a `console.error`. The card's AC asks for "a test
 * transport injected (not a live Sentry account)", a no-op path when no DSN is
 * configured, and a *classification* the channel must keep ("the event says so
 * distinctly from a caller 400"). A direct SDK call at each site provides none of
 * those, and a site that forgets to classify is invisible until a producer defect
 * drowns in caller noise.
 *
 * What this module guarantees, in order of how much it cost to learn:
 *
 * 1. **One event per error object.** Both server seams can see the same throw —
 *    `routeErrorResponse` reports what it is about to render as a 500, and
 *    `loggedRoute` reports what escaped the handler — and an error that reaches a
 *    second seam after the first has reported it must not arrive twice. The
 *    claim is a property of the object, so the marker lives on the object.
 * 2. **Nothing leaves through a channel this module does not scrub.** An error
 *    message routinely contains the URL that threw it, and this app's URLs include
 *    GoTrue magic links. `redact.ts` owns what may be said; the reporter does not
 *    get to be the exception, which is why a message is `scrubString`ed and every
 *    attribute key goes through `safeKey` + `sanitize` — the same two calls the
 *    logger's `buildEntry` makes, for the same reason.
 * 3. **A failure to report is never a failure to serve.** `reportError` returns
 *    `void`, catches everything (including a transport that throws), and says so
 *    through the logging seam. The caller keeps its own error and rethrows it.
 *
 * Deliberately absent: sampling, breadcrumbs, aggregation, a queue. `DECISION-m4-001`
 * is an error sink; `DEFERRED-m4-005` keeps tracing out of this PR, so anything that
 * looks like volume control would be a feature pretending to be plumbing.
 */

import { isDeniedKey, REDACTED_BY_KEY, sanitize, scrubString, wireKey, type SafeValue } from '../logger/redact';
import type { RequestCorrelation } from '../logger/context';

/** Which side of the wire the defect was seen on — the event's single most useful field. */
export type ErrorPlane = 'server' | 'client';

/**
 * `producer` — our code rejected its own contract (a `ContractViolationError`, an
 * escape past a handler): the #73 distinction, kept on purpose.
 * `caller` — a bad request we answered correctly; reported only where a caller's
 * behaviour is itself the defect signal (a client shipping a body we stopped describing).
 * `durability` — the browser refused to persist what the user tapped (IndexedDB quota,
 * no device id): the user's data is the thing at risk, so it outranks the other two.
 */
export type ErrorKind = 'producer' | 'caller' | 'durability';

export interface ErrorReport {
  plane: ErrorPlane;
  /** Where it was seen: `'POST /api/sync'`, `'route-error:unhandled'`, `'outbox:enqueue'`. */
  source: string;
  kind?: ErrorKind;
  attributes?: Readonly<Record<string, unknown>>;
  /** Server callers get this from `reportServerError`; a client has no request scope to have. */
  correlation?: Partial<RequestCorrelation>;
}

/** A report as a transport receives it: scrubbed, classified, attributed. */
export interface ErrorEvent {
  error: unknown;
  errorName: string;
  /** Scrubbed and length-capped, exactly as it may be said out loud. */
  message: string;
  plane: ErrorPlane;
  source: string;
  kind: ErrorKind;
  attributes: Record<string, SafeValue>;
  correlation: Partial<RequestCorrelation>;
  release: string | null;
  occurredAt: string;
}

export type ErrorTransport = (event: ErrorEvent) => void;

/**
 * Set once, before anything can fail, so a defect that happens during boot is still
 * attributable. Sentry's own release detection is build-time and invisible to a
 * runtime event; this app's deploys carry a SHA in `SENTRY_RELEASE` (server) or
 * `NEXT_PUBLIC_SENTRY_RELEASE` (the browser bundle, because a browser cannot read a
 * secret-named env). A card that wants release attribution elsewhere should extend
 * this function, not write a second resolution.
 */
export function resolveRelease(): string | null {
  const fromServer = process.env.SENTRY_RELEASE;
  if (typeof fromServer === 'string' && fromServer.trim() !== '') return fromServer.trim();
  const fromBundle = process.env.NEXT_PUBLIC_SENTRY_RELEASE;
  if (typeof fromBundle === 'string' && fromBundle.trim() !== '') return fromBundle.trim();
  return null;
}

/**
 * The exactly-once marker. A `Symbol`, not a string field, so it cannot collide with a
 * domain error that legitimately owns a `reported` property, and so `JSON.stringify` of
 * the error (which transports do) does not grow a field because telemetry looked at it.
 */
const REPORTED = Symbol.for('ppl-fitness.reported-error');

/*
 * The slot lives on `globalThis`, not in a module binding, and that is a measured
 * decision rather than a style choice. With a module-level `let`, a production server
 * silently loses every tag this seam adds: Next 16 + Turbopack evaluates
 * `src/instrumentation.ts` (which installs the transport) and a route handler in
 * **separate module instances of this file**, so the handler reads its own `null` and
 * reports nothing — observed on 2026-09-15, where the only server event that arrived
 * carried Sentry's own `turbopack: true` tag and none of ours, and the log line beside
 * it proved the seam had run. Unit tests could never see it: vitest gives them one
 * registry. `globalThis` is the one object every bundle graph in the process shares,
 * which is what makes "install once, read everywhere" true instead of nearly true.
 */
const TRANSPORT_KEY = Symbol.for('ppl-fitness.error-transport');

interface TransportHost {
  [TRANSPORT_KEY]?: ErrorTransport | null;
}

function host(): TransportHost {
  return globalThis as unknown as TransportHost;
}

/**
 * Install the transport, get back the function that puts the previous one back.
 * Mirrors `setLogSink` (`lib/logger/index.ts:84`) in signature and intent: a spec
 * injects a recorder, and the restore is what keeps one spec's transport out of the
 * next spec's assertions — the failure mode #94's sink already documents.
 *
 * `null` is a supported configuration, not an error: the no-DSN path is this function
 * never being called, and every report then costs one branch.
 */
export function setErrorTransport(next: ErrorTransport | null): () => void {
  const previous = host()[TRANSPORT_KEY] ?? null;
  host()[TRANSPORT_KEY] = next;
  return () => {
    host()[TRANSPORT_KEY] = previous;
  };
}

/** Test/diagnostic read of the installed transport, without inviting a caller to invoke it. */
export function hasErrorTransport(): boolean {
  return (host()[TRANSPORT_KEY] ?? null) !== null;
}

function nameOf(error: unknown): string {
  if (error instanceof Error) return error.name || error.constructor.name;
  return typeof error;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return scrubString(error.message ?? '');
  if (typeof error === 'string') return scrubString(error);
  try {
    return scrubString(String(error));
  } catch {
    // An object with a throwing toString is a real shape (proxies, getters on
    // prototypes from third-party clients). The defect still gets reported.
    return '[unprintable error]';
  }
}

function scrubAttributes(
  attributes: ErrorReport['attributes'],
): Record<string, SafeValue> {
  const out: Record<string, SafeValue> = {};
  if (!attributes) return out;
  for (const [key, value] of Object.entries(attributes)) {
    // Exactly `buildEntry`'s move, including the wire spelling: `wireKey` renames
    // (`durationMs` → `duration_ms`, and a denied key to `…_redacted`) and the denied
    // key's *value* is refused rather than carried under its new name — the bug #94
    // caught in itself, where `{ code }` reached the wire as `code_redacted: "123456"`.
    out[wireKey(key)] = isDeniedKey(key) ? REDACTED_BY_KEY : sanitize(value);
  }
  return out;
}

function alreadyReported(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as Record<symbol, unknown>)[REPORTED] === true;
}

function markReported(error: unknown): void {
  if (typeof error !== 'object' || error === null) return;
  try {
    (error as Record<symbol, unknown>)[REPORTED] = true;
  } catch {
    // Frozen errors are not rare (singletons, sealed library errors). Losing the
    // dedupe for one object must not lose the event for it.
  }
}

/**
 * Report a defect. Fire-and-forget by contract: it cannot throw, cannot return
 * anything useful, and does not await the transport — an error path that can block
 * on a network call is how a sink outage becomes an availability incident.
 */
export function reportError(error: unknown, report: ErrorReport): void {
  const current = host()[TRANSPORT_KEY] ?? null;
  if (current === null) {
    // A defect with nowhere to go. On the server this is diagnosable rather than
    // inferable, because `reportServerError` says so once per process — see the note
    // there on why "the transport is missing" is the failure mode worth announcing.
    missingTransportListener?.(report);
    return;
  }
  if (alreadyReported(error)) return;

  markReported(error);

  const event: ErrorEvent = {
    error,
    errorName: nameOf(error),
    message: messageOf(error),
    plane: report.plane,
    source: report.source,
    kind: report.kind ?? 'producer',
    attributes: scrubAttributes(report.attributes),
    correlation: report.correlation ?? {},
    release: resolveRelease(),
    occurredAt: new Date().toISOString(),
  };

  try {
    current(event);
  } catch (transportError) {
    transportFailureListener?.(transportError, error);
    // No rethrow, and no second event: a broken sink must not cost the caller its
    // own error, and it must not be able to loop.
  }
}

/**
 * Who hears about a transport that threw. The server entry installs the logging seam
 * here (`lib/errors/server-report.ts`); the client half leaves it unset, because
 * importing `lib/logger` into a browser bundle would drag `node:async_hooks` with it
 * (`lib/logger/context.ts:41`). An unset listener is a swallow, and a swallow is the
 * right answer *only* for a browser that has no sink of its own — which is why the
 * server sets it at module load rather than at first failure.
 */
export type TransportFailureListener = (transportError: unknown, original: unknown) => void;

let transportFailureListener: TransportFailureListener | null = null;

/** Called when a report found no transport. Server side, this is a warning, not a shrug. */
export type MissingTransportListener = (report: ErrorReport) => void;

let missingTransportListener: MissingTransportListener | null = null;

export function setMissingTransportListener(next: MissingTransportListener | null): () => void {
  const previous = missingTransportListener;
  missingTransportListener = next;
  return () => {
    missingTransportListener = previous;
  };
}

export function setTransportFailureListener(
  next: TransportFailureListener | null,
): () => void {
  const previous = transportFailureListener;
  transportFailureListener = next;
  return () => {
    transportFailureListener = previous;
  };
}
