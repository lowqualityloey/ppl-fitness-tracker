/**
 * M4-06 (#95) — the adapter between this app's report and Sentry's event vocabulary.
 *
 * The SDK is never imported here: `createSentryTransport` takes a `capture` shaped
 * like `Sentry.captureException`, which is the whole reason the adapter is a function
 * of a callback rather than a call into the SDK. The card's AC demands an injected
 * transport, and a file that imports Sentry at module scope cannot be tested without
 * deciding what an un-configured Sentry does — a question that belongs to the config
 * guard test, not to the mapping.
 */

import { describe, expect, it } from 'vitest';
import { createSentryTransport, type ErrorCapture } from '../../../lib/errors/sentry-transport';
import type { ErrorEvent } from '../../../lib/errors/reporter';

function event(overrides: Partial<ErrorEvent> = {}): ErrorEvent {
  return {
    error: new Error('producer defect'),
    errorName: 'Error',
    message: 'producer defect',
    plane: 'server',
    source: 'route-error:unhandled',
    kind: 'producer',
    attributes: { mutation_id: 'm-1' },
    correlation: { requestId: 'r-1', userId: 'u-1', sessionId: null },
    release: 'sha-abcdef12',
    occurredAt: new Date('2026-09-15T00:00:00Z').toISOString(),
    ...overrides,
  };
}

function spy(): { calls: Parameters<ErrorCapture>[]; capture: ErrorCapture } {
  const calls: Parameters<ErrorCapture>[] = [];
  return { calls, capture: (error, hint) => calls.push([error, hint]) };
}

describe('createSentryTransport', () => {
  it('hands the original error to the SDK, not a rendering of it', () => {
    const { calls, capture } = spy();
    const transport = createSentryTransport(capture);
    const error = new Error('producer defect');

    transport(event({ error }));

    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toBe(error);
  });

  it('tags the fields a reviewer filters on, with the logger’s snake_case spellings', () => {
    const { calls, capture } = spy();
    createSentryTransport(capture)(event());

    const tags = calls[0]![1].tags;
    expect(tags).toMatchObject({
      plane: 'server',
      kind: 'producer',
      source: 'route-error:unhandled',
      request_id: 'r-1',
      user_id: 'u-1',
    });
    // `requestId` beside `request_id` would be two spellings of one id; the tag is
    // named after the log line it has to be joinable with (G-M4-2).
    expect(tags).not.toHaveProperty('requestId');
  });

  it('omits an absent correlation rather than tagging the string "null"', () => {
    const { calls, capture } = spy();
    createSentryTransport(capture)(event({ correlation: {} }));

    const tags = calls[0]![1].tags;
    expect(tags).not.toHaveProperty('request_id');
    expect(tags).not.toHaveProperty('user_id');
    expect(tags).not.toHaveProperty('session_id');
    expect(tags.plane).toBe('server');
  });

  it('does not duplicate the release as a tag, because the SDK carries it', () => {
    const { calls, capture } = spy();
    createSentryTransport(capture)(event());

    expect(calls[0]![1].tags).not.toHaveProperty('release');
  });

  it('keeps the scrubbed message and the attributes in extra, where they cannot collide with the SDK’s own fields', () => {
    const { calls, capture } = spy();
    createSentryTransport(capture)(
      event({ message: 'verify https://x/auth?access_token=[redacted:query] failed' }),
    );

    const extra = calls[0]![1].extra as Record<string, unknown>;
    expect(extra.reportedMessage).toContain('[redacted:query]');
    expect(extra.attributes).toEqual({ mutation_id: 'm-1' });
    expect(typeof extra.reportedAt).toBe('string');
  });

  it('separates a durability failure from a producer defect by tag alone (AC 3’s channel half)', () => {
    const { calls, capture } = spy();
    const transport = createSentryTransport(capture);

    transport(event({ kind: 'producer', source: 'route-error:unhandled' }));
    transport(event({ kind: 'durability', source: 'outbox:enqueue', plane: 'client' }));
    transport(event({ kind: 'caller', source: 'POST /api/sessions' }));

    expect(calls.map(([, hint]) => `${hint.tags.kind}:${hint.tags.source}`)).toEqual([
      'producer:route-error:unhandled',
      'durability:outbox:enqueue',
      'caller:POST /api/sessions',
    ]);
  });
});
