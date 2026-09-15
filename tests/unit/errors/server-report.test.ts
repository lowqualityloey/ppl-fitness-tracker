/**
 * M4-06 (#95) — the server half of the seam: the correlation the browser has no way to
 * know, and the logging the browser has nowhere to write.
 *
 * G-M4-2 is "one correlation id from a client tap through the route log line to the
 * Sentry event". The event side of that sentence is this file's job, and it is the
 * reason `reportServerError` exists as a separate module rather than a parameter on
 * `reportError`: reading the id means importing `lib/logger/context.ts`, which means
 * `node:async_hooks`, which means a browser bundle that cannot build.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { setLogSink, type LogEntry } from '../../../lib/logger';
import { withRequestScope, attachCorrelation } from '../../../lib/logger/context';
import { reportServerError } from '../../../lib/errors/server-report';
import { setErrorTransport, type ErrorEvent } from '../../../lib/errors/reporter';

function recorder(): { events: ErrorEvent[]; transport: (e: ErrorEvent) => void } {
  const events: ErrorEvent[] = [];
  return { events, transport: (event) => events.push(event) };
}

describe('reportServerError — the id is not the caller’s to remember', () => {
  afterEach(() => {
    setErrorTransport(null);
  });

  it('attaches the enclosing request id and the session it learned mid-request', async () => {
    const { events, transport } = recorder();
    setErrorTransport(transport);

    await withRequestScope(async () => {
      attachCorrelation({ sessionId: 's-7', userId: 'u-7' });
      reportServerError(new Error('producer defect'), {
        plane: 'server',
        source: 'POST /api/sync',
        kind: 'producer',
      });
    });

    expect(events).toHaveLength(1);
    expect(events[0]!.correlation.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(events[0]!.correlation.sessionId).toBe('s-7');
    expect(events[0]!.correlation.userId).toBe('u-7');
    // The same id a `request completed` line carries — this asserts the *field name*
    // match too, because the log's wire key is `request_id` and a `requestId` tag here
    // would be two spellings of one id, which is the thing G-M4-2 is about.
    expect(Object.keys(events[0]!.correlation)).toEqual(
      expect.arrayContaining(['requestId', 'userId', 'sessionId']),
    );
  });

  it('reports the same id twice-in-scope reports once, like every other error object', async () => {
    const { events, transport } = recorder();
    setErrorTransport(transport);
    const error = new Error('double seam');

    await withRequestScope(async () => {
      reportServerError(error, { plane: 'server', source: 'route-error:unhandled' });
      reportServerError(error, { plane: 'server', source: 'POST /api/sync' });
    });

    expect(events).toHaveLength(1);
    const ids = new Set([events[0]!.correlation.requestId]);
    expect(ids.size).toBe(1);
  });

  it('outside any request scope it still reports, with no correlation invented', () => {
    const { events, transport } = recorder();
    setErrorTransport(transport);

    reportServerError(new Error('boot-time failure'), {
      plane: 'server',
      source: 'script:backfill',
      kind: 'producer',
    });

    expect(events).toHaveLength(1);
    expect(events[0]!.correlation.requestId ?? null).toBeNull();
  });

  it('says so once, on the log, when a report finds no transport', async () => {
    // The one failure mode the seam cannot see from inside: an uninstalled transport
    // makes every report a silent branch, and a server that answers 500s forever with
    // no events and no complaint is indistinguishable from a server with no defects.
    const lines: LogEntry[] = [];
    const restoreSink = setLogSink((_line, entry) => lines.push(entry));
    setErrorTransport(null);

    await withRequestScope(async () => {
      reportServerError(new Error('first with nowhere to go'), { plane: 'server', source: 'a' });
      reportServerError(new Error('second with nowhere to go'), { plane: 'server', source: 'b' });
    });

    restoreSink();
    const warnings = lines.filter((l) => l.msg === 'error report had no transport installed');
    expect(warnings).toHaveLength(1);
    expect(JSON.stringify(warnings[0])).toContain('"source":"a"');
  });

  it('honours an explicit correlation instead of the ambient one', async () => {
    const { events, transport } = recorder();
    setErrorTransport(transport);

    await withRequestScope(async () => {
      reportServerError(new Error('worker-owned id'), {
        plane: 'server',
        source: 'job',
        correlation: { requestId: '11111111-1111-4111-8111-111111111111' },
      });
    });

    expect(events[0]!.correlation.requestId).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('a transport that throws is written to the logging seam, not swallowed', async () => {
    // Note: `server-report.ts` installs its own listener the first time it reports, so a
    // spec that calls `setTransportFailureListener` here would be *overwritten*, not
    // tested. Asserting the log line is the honest version of this case.
    const lines: LogEntry[] = [];
    // `LogSink`'s first argument is the rendered line; the entry is second. Reading
    // them the other way round is a test that asserts against a string.
    const restoreSink = setLogSink((_line, entry) => lines.push(entry));
    setErrorTransport(() => {
      throw new Error('sink exploded');
    });

    await withRequestScope(async () => {
      expect(() =>
        reportServerError(new Error('the actual defect'), { plane: 'server', source: 'route' }),
      ).not.toThrow();
    });

    restoreSink();
    const failure = lines.find((l) => l.msg === 'error transport threw');
    expect(failure, `no transport-failure line among: ${lines.map((l) => l.msg).join(', ')}`).toBeDefined();
    expect(JSON.stringify(failure)).toContain('sink exploded');
    // The original defect is named alongside, so the log answers "what were we reporting
    // when the reporter broke?" — #125's complaint, one layer up.
    expect(JSON.stringify(failure)).toContain('the actual defect');
    expect(failure!.request_id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
