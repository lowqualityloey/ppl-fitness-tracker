/**
 * M4-06 (#95) — the error-reporting seam, tested against an injected transport.
 *
 * The card decides this file's shape: "Given a test transport injected (not a live
 * Sentry account)". Nothing here imports @sentry/nextjs, needs a DSN, or touches a
 * network — which is also what makes "no DSN is a supported configuration" testable:
 * an unconfigured deploy and an uninjected test are the same code path.
 *
 * Correlation and the logging half are in `server-report.test.ts`. The seam that adds
 * them is a separate file on purpose: reading a request id means importing
 * `node:async_hooks`, and a browser must not.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { isDeniedKey } from '../../../lib/logger/redact';
import {
  hasErrorTransport,
  reportError,
  resolveRelease,
  setErrorTransport,
  setTransportFailureListener,
  type ErrorEvent,
} from '../../../lib/errors/reporter';

function recorder(): { events: ErrorEvent[]; transport: (event: ErrorEvent) => void } {
  const events: ErrorEvent[] = [];
  return { events, transport: (event) => events.push(event) };
}

describe('reportError — the transport is the only output', () => {
  afterEach(() => {
    setErrorTransport(null);
    setTransportFailureListener(null);
    vi.unstubAllEnvs();
  });

  it('is a no-op with no transport installed, and never throws (AC: no DSN is supported)', () => {
    expect(hasErrorTransport()).toBe(false);
    expect(() =>
      reportError(new Error('defect'), { plane: 'server', source: 'route-error:unhandled' }),
    ).not.toThrow();
  });

  it('delivers the error, its classification, and its source (AC 1)', () => {
    const { events, transport } = recorder();
    setErrorTransport(transport);
    const error = new Error('a producer defect');

    reportError(error, { plane: 'server', source: 'POST /api/sync', kind: 'producer' });

    expect(events).toHaveLength(1);
    expect(events[0]!.error).toBe(error);
    expect(events[0]!.errorName).toBe('Error');
    expect(events[0]!.message).toBe('a producer defect');
    expect(events[0]!.source).toBe('POST /api/sync');
    expect(events[0]!.kind).toBe('producer');
    expect(events[0]!.plane).toBe('server');
    expect(Date.parse(events[0]!.occurredAt)).not.toBeNaN();
  });

  it('defaults kind to producer — an unclassified defect is ours until proven otherwise', () => {
    const { events, transport } = recorder();
    setErrorTransport(transport);

    reportError(new Error('no kind given'), { plane: 'server', source: 'x' });

    expect(events[0]!.kind).toBe('producer');
  });

  it('reports one error object once, whichever seam sees it second (AC 1: exactly one)', () => {
    const { events, transport } = recorder();
    setErrorTransport(transport);
    const error = new Error('seen twice');

    // The realistic double-visit: routeErrorResponse's unhandled branch reports it, and
    // the handler then rethrows into loggedRoute's catch, which reports what escaped.
    reportError(error, { plane: 'server', source: 'route-error:unhandled', kind: 'producer' });
    reportError(error, { plane: 'server', source: 'route:escape', kind: 'producer' });

    expect(events).toHaveLength(1);
    expect(events[0]!.source).toBe('route-error:unhandled');
  });

  it('does not lose the event when the error is frozen and cannot be marked', () => {
    const { events, transport } = recorder();
    setErrorTransport(transport);
    const error = Object.freeze(new Error('frozen'));

    reportError(error, { plane: 'server', source: 'a' });
    reportError(error, { plane: 'server', source: 'b' });

    // Marking fails on a frozen object (library singletons do this). The rule is that a
    // lost dedupe beats a lost event, so this asserts a known limit, not a wish.
    expect(events).toHaveLength(2);
  });

  it('carries a non-Error throw instead of dropping it', () => {
    const { events, transport } = recorder();
    setErrorTransport(transport);

    reportError('a string defect', { plane: 'client', source: 'legacy' });

    expect(events).toHaveLength(1);
    expect(events[0]!.message).toBe('a string defect');
    expect(events[0]!.errorName).toBe('string');
  });

  it('distinguishes a contract violation from a caller 400 by name and kind (AC 3)', () => {
    const { events, transport } = recorder();
    setErrorTransport(transport);

    class ContractViolationError extends Error {
      override readonly name = 'ContractViolationError';
    }
    reportError(new ContractViolationError('SyncResponseSchema refused the body'), {
      plane: 'server',
      source: 'POST /api/sync',
      kind: 'producer',
    });
    reportError(new Error('malformed body'), {
      plane: 'server',
      source: 'POST /api/sync',
      kind: 'caller',
    });

    expect(events.map((e) => [e.errorName, e.kind])).toEqual([
      ['ContractViolationError', 'producer'],
      ['Error', 'caller'],
    ]);
  });

  it('names a transport failure without becoming one, and keeps the caller error', () => {
    const failures: unknown[] = [];
    setTransportFailureListener((transportError) => failures.push(transportError));
    setErrorTransport(() => {
      throw new Error('sink exploded');
    });

    expect(() =>
      reportError(new Error('original defect'), { plane: 'client', source: 'outbox:enqueue' }),
    ).not.toThrow();

    expect(failures).toHaveLength(1);
    expect((failures[0] as Error).message).toBe('sink exploded');
  });

  it('refuses a denied attribute key and an unredacted token in the message (spec §5.1)', () => {
    const { events, transport } = recorder();
    setErrorTransport(transport);

    reportError(
      new Error('verify https://x.supabase.co/auth/v1/verify?access_token=SECRET-VALUE failed'),
      {
        plane: 'server',
        source: 'route',
        attributes: {
          userId: 'u-1',
          password: 'hunter2hunter2',
          // A real JWT shape, because `JWT_SHAPE` in redact.ts demands ≥8 chars per
          // segment — 'abc.def.ghi' is not a secret the predicate recognises, and a test
          // that passes on a non-secret proves nothing about scrubbing.
          jwt: 'a'.repeat(12) + '.' + 'b'.repeat(12) + '.' + 'c'.repeat(12),
          long: 'y'.repeat(4_000),
        },
      },
    );

    const event = events[0]!;
    const serialized = JSON.stringify(event.attributes);
    expect(serialized).not.toContain('SECRET-VALUE');
    expect(serialized).not.toContain('hunter2hunter2');
    expect(serialized).not.toContain('aaaaaaaaaaaa');
    expect(serialized).toContain('u-1');
    // Renamed *and* refused, the same pair of moves `buildEntry` makes — asserted
    // through the shared predicate, so the two seams cannot drift apart silently.
    // `wireKey` is what the logger uses, so a denied key leaves the channel spelled
    // `password_redacted` — renamed *and* refused, with the same two moves on both sides.
    expect(Object.keys(event.attributes)).toContain('password_redacted');
    expect(isDeniedKey('password')).toBe(true);
    expect(event.message).toContain('[redacted:query]');
    expect(event.message).not.toContain('SECRET-VALUE');
    // The attribute cap keeps its overflow marker: `truncate` cuts at 512 and appends
    // "…(+N)", so the honest assertion is the marker, not a bare length.
    expect(serialized).toContain('(+3488)');
  });

  it('resolves a release from either plane env and prefers the server one', () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_RELEASE', 'bundle-sha');
    expect(resolveRelease()).toBe('bundle-sha');

    vi.stubEnv('SENTRY_RELEASE', 'deploy-sha');
    expect(resolveRelease()).toBe('deploy-sha');

    vi.stubEnv('SENTRY_RELEASE', '   ');
    expect(resolveRelease()).toBe('bundle-sha');

    vi.stubEnv('NEXT_PUBLIC_SENTRY_RELEASE', '');
    expect(resolveRelease()).toBeNull();
  });

  it('stamps the same release on every event it emits (Scope: attributable by deploy)', () => {
    const { events, transport } = recorder();
    vi.stubEnv('SENTRY_RELEASE', 'sha-abcdef12');
    setErrorTransport(transport);

    reportError(new Error('one'), { plane: 'client', source: 'runner' });
    reportError(new Error('two'), { plane: 'client', source: 'runner' });

    expect(events.map((e) => e.release)).toEqual(['sha-abcdef12', 'sha-abcdef12']);
  });

  it('restores the transport that was installed before it, so a spec cannot leak its recorder', () => {
    const { events: first, transport: firstTransport } = recorder();
    const { events: second, transport: secondTransport } = recorder();

    const leaveFirst = setErrorTransport(firstTransport);
    const leaveSecond = setErrorTransport(secondTransport);

    reportError(new Error('which one?'), { plane: 'client', source: 'z' });
    expect(second).toHaveLength(1);
    expect(first).toHaveLength(0);

    // Unwinding in LIFO order is what `setLogSink`'s contract means in a spec's afterEach.
    leaveSecond();
    reportError(new Error('back again'), { plane: 'client', source: 'z' });
    expect(first).toHaveLength(1);

    leaveFirst();
    reportError(new Error('nobody home'), { plane: 'client', source: 'z' });
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
  });
});
