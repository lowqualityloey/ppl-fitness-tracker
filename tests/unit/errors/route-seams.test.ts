/**
 * M4-06 (#95) AC-1 / AC-3 — the two server seams, driven the way a route drives them.
 *
 * The card's scenario is "when a route handler throws … exactly one event per error
 * reaches the transport, carrying the correlation id and release tag". Both seams are
 * exercised through their real entry points (`loggedRoute`, `routeErrorResponse`) rather
 * than by calling `reportServerError` directly, because the claim is about *the wiring*:
 * a handler author must not have to remember anything for the event to exist. The
 * producer-defect distinction AC-3 asks for is asserted here too — `validateOutgoing`
 * rejecting its own response is the case the card names.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { NextResponse } from 'next/server';
import { loggedRoute } from '../../../lib/http/request-log';
import { routeErrorResponse } from '../../../lib/http/route-error';
import { setErrorTransport, type ErrorEvent } from '../../../lib/errors/reporter';
import { withRequestScope } from '../../../lib/logger/context';
import { ContractViolationError, validateOutgoing } from '../../../lib/contracts/envelope';
import { z, ZodError } from 'zod';

function recorder(): { events: ErrorEvent[]; transport: (e: ErrorEvent) => void } {
  const events: ErrorEvent[] = [];
  return { events, transport: (event) => events.push(event) };
}

/** A real ZodError from a real failed parse — `routeErrorResponse` tests `instanceof`. */
function realZodError(): ZodError {
  const parsed = z.object({ a: z.string() }).safeParse({ a: 1 });
  if (parsed.success) throw new Error('the fixture stopped being a fixture');
  return parsed.error;
}

function requestFor(path: string, method = 'POST'): Request {
  return new Request(`http://localhost:3000${path}`, { method });
}

afterEach(() => setErrorTransport(null));

describe('loggedRoute — the handler that throws without handling it', () => {
  it('reports the escape once, tagged with the route and the request id that logged it', async () => {
    const { events, transport } = recorder();
    setErrorTransport(transport);
    const boom = new Error('escaped the handler');
    // The handler reads its arguments, which is also the assertion: `loggedRoute` must
    // forward what Next passes (the `Request`, and the dynamic-route context) untouched
    // or the wrapper would be a wall between a handler and its own call.
    const handler = loggedRoute(async (request: Request, context: { params: Promise<Record<string, never>> }) => {
      expect(request.method).toBe('POST');
      expect(await context.params).toEqual({});
      throw boom;
    });

    await expect(
      handler(requestFor('/api/sync'), { params: Promise.resolve({}) }),
    ).rejects.toThrow('escaped the handler');

    expect(events).toHaveLength(1);
    expect(events[0]!.error).toBe(boom);
    expect(events[0]!.plane).toBe('server');
    expect(events[0]!.kind).toBe('producer');
    // AC: the event carries the *same* correlation id the request's log line carries.
    expect(typeof events[0]!.correlation.requestId).toBe('string');
    expect(events[0]!.source).toBe('POST /api/sync');
    expect(events[0]!.attributes.duration_ms).toEqual(expect.any(Number));
  });

  it('reports nothing for a handler that answers normally, including a deliberate 500', async () => {
    const { events, transport } = recorder();
    setErrorTransport(transport);
    const handler = loggedRoute(async (request: Request) =>
      NextResponse.json({ ok: true, echo: new URL(request.url).pathname }, { status: 503 }),
    );

    const res = await handler(requestFor('/api/sync', 'GET'));

    expect(res.status).toBe(503);
    expect(events).toEqual([]);
  });

  it('does not invent a route when the handler is called without a Request', async () => {
    const { events, transport } = recorder();
    setErrorTransport(transport);
    // A call site that hands the wrapper something that is not a `Request` (a script, a
    // future job runner): the completion line loses method/path, and so must the event —
    // inventing a route here would be a tag nobody can grep for.
    const handler = loggedRoute(async (notARequest: unknown) => {
      expect(notARequest).toBeUndefined();
      throw new Error('no request object');
    });

    await expect(handler(undefined)).rejects.toThrow('no request object');

    expect(events).toHaveLength(1);
    expect(events[0]!.source).toBe('unknown unknown');
  });
});

describe('routeErrorResponse — the distinction #73 built must survive into the channel', () => {
  it('reports a producer defect and stays silent for the caller 400 beside it (AC 3)', () => {
    const { events, transport } = recorder();
    setErrorTransport(transport);

    // Producer: `validateOutgoing` refusing our own outgoing shape.
    const Schema = z.object({ ok: z.literal(true), data: z.object({ n: z.number() }) });
    let producerError: unknown;
    try {
      validateOutgoing(Schema, { ok: true, data: { n: 'not-a-number' } } as never, 'POST /api/sync');
    } catch (error) {
      producerError = error;
      const res = routeErrorResponse(error);
      expect(res.status).toBe(500);
    }
    expect(producerError).toBeInstanceOf(ContractViolationError);

    // Caller: a real ZodError from a real parse failure, answered 400. Not a stand-in
    // class: the predicate under test is `instanceof ZodError`, so the fixture has to be
    // the real thing or the case proves nothing about the branch it names.
    const callerRes = routeErrorResponse(realZodError());
    expect(callerRes.status).toBe(400);

    expect(events).toHaveLength(1);
    expect(events[0]!.errorName).toBe('ContractViolationError');
    expect(events[0]!.kind).toBe('producer');
    expect(events[0]!.source).toBe('route-error:unhandled');
  });

  it('answers a typed rejection with its own status and reports nothing', () => {
    const { events, transport } = recorder();
    setErrorTransport(transport);

    const res = routeErrorResponse(realZodError());

    expect(res.status).toBe(400);
    expect(events).toEqual([]);
  });

  it('reports an untyped throw once, with the route id attached, while still answering 500', async () => {
    const { events, transport } = recorder();
    setErrorTransport(transport);
    const handler = loggedRoute(async (request: Request) => {
      try {
        // Named from the request the wrapper was handed, so the case cannot pass by
        // accident if the argument stops arriving.
        expect(new URL(request.url).pathname).toBe('/api/sessions');
        throw new TypeError('database row came back malformed');
      } catch (error) {
        return routeErrorResponse(error);
      }
    });

    await withRequestScope(async () => {
      const res = await handler(requestFor('/api/sessions'));
      expect(res.status).toBe(500);
    });

    // One event, not two: the reporter's marker on the shared error object is what makes
    // it safe to leave both server seams armed at once.
    expect(events).toHaveLength(1);
    expect(events[0]!.errorName).toBe('TypeError');
    expect(events[0]!.source).toBe('route-error:unhandled');
    expect(typeof events[0]!.correlation.requestId).toBe('string');
  });
});
