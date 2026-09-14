/**
 * M4-05 (#94), concern C commit 1 — the JSON logging seam and its request scope.
 *
 * `docs/specs/2026-09-14-spec-m4-hardening-telemetry-decommission.md` §3.2
 * names the interface (`log.info(msg, ctx)`) and the output shape (JSON lines
 * with correlation ids); `docs/tasks/m4/M4-05-structured-logging.md` adds the
 * wire convention (snake_case) and the `requestId`-generation rule. What those
 * documents make testable, and what could plausibly be got wrong while every
 * green bar in `npm test` stays green, is the subject of each case below:
 *
 *   - a line that wraps is read as two events by `grep`, so "one line" is a
 *     contract rather than a formatting habit;
 *   - an id that fails to survive `await`, or that leaks out of a finished
 *     scope, breaks #125's trail one request at a time and only under load;
 *   - a correlation key that is *absent* when there is no scope (rather than
 *     `null`) is exactly the gap #125 was filed against;
 *   - a logger that throws while a request is already failing turns one defect
 *     into two, and a logger whose output depends on the ambient `LOG_LEVEL`
 *     makes every assertion below able to pass vacuously.
 *
 * Watched-red notes name the revert for the load-bearing cases, in the
 * `tests/integration/api/gotrue-failure.test.ts` house style. Run:
 * `npm test -- tests/unit/infra/logger.test.ts`
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  attachCorrelation,
  createLogger,
  currentCorrelation,
  levelFromEnv,
  log,
  setLogSink,
  wireKey,
  withRequestScope,
  type LogEntry,
} from '../../../lib/logger';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const restores: Array<() => void> = [];

/**
 * Captures the app logger's output.
 *
 * Every case below that touches `log` uses `log.error` rather than `log.info`,
 * because `error` clears every level `LOG_LEVEL` can name — otherwise a CI row
 * that sets `LOG_LEVEL=warn` would turn these assertions into the very thing
 * they are supposed to be watching for. The `info`/`debug` paths are covered
 * against an explicitly configured logger instead.
 */
function capture(): { lines: string[]; entries: LogEntry[] } {
  const lines: string[] = [];
  const entries: LogEntry[] = [];
  restores.push(setLogSink((line, entry) => {
    lines.push(line);
    entries.push(entry);
  }));
  return { lines, entries };
}

/** The last line written, as the sink saw it. */
function lastEntry(entries: LogEntry[]): LogEntry {
  const entry = entries.at(-1);
  if (!entry) throw new Error('no log line was emitted');
  return entry;
}

afterEach(() => {
  while (restores.length > 0) restores.pop()?.();
});

describe('logger seam: the shape of one line', () => {
  it('writes exactly one parseable JSON line, envelope first', () => {
    const { lines, entries } = capture();
    withRequestScope(() => {
      log.error('sync applied', { mutationCount: 3 });
    }, { requestId: 'req-shape' });

    expect(lines).toHaveLength(1);
    // A newline anywhere but the end is the line becoming two events.
    expect(lines[0]).not.toContain('\n');
    const parsed = JSON.parse(lines[0]!);
    expect(parsed).toMatchObject({
      time: expect.any(String),
      level: 'error',
      msg: 'sync applied',
      request_id: 'req-shape',
      mutation_count: 3,
    });
    // `grep`-first ordering: the fields a human scans are the fields written first.
    expect(Object.keys(parsed).slice(0, 3)).toEqual(['time', 'level', 'msg']);
    expect(new Date(parsed.time).toISOString()).toBe(parsed.time);
    expect(lastEntry(entries).msg).toBe('sync applied');
  });

  it('maps camelCase at the call site onto snake_case on the wire', () => {
    expect(wireKey('requestId')).toBe('request_id');
    expect(wireKey('mutationId')).toBe('mutation_id');
    expect(wireKey('confidenceScore')).toBe('confidence_score');
    expect(wireKey('already_snake')).toBe('already_snake');
    expect(wireKey('JWTShape')).toBe('jwt_shape');
    // The redaction seam renames `email` to `emailRedacted` before the case
    // mapping runs, and the two compose rather than fight.
    expect(wireKey('email')).toBe('email_redacted');

    const seen: LogEntry[] = [];
    createLogger({ level: 'info', sink: (_l, entry) => void seen.push(entry) }).info(
      'progress',
      { deviceLabel: 'pixel', pullVolumePct: 82 },
    );
    // One spelling per field, whoever wrote the call site: `wireKey` is the only
    // place the mapping happens.
    expect(Object.keys(seen[0]!)).toEqual(
      expect.arrayContaining(['time', 'level', 'msg', 'device_label', 'pull_volume_pct']),
    );
  });

  it('names the field it refused instead of swallowing it', () => {
    const { entries } = capture();
    log.error('the real message', {
      level: 'debug',
      msg: 'a spoofed message',
      requestId: 'req-forged',
      user_id: 'someone-elses-id',
      keeper: 'kept',
    });

    const entry = lastEntry(entries);
    // Watched red: deleting the `RESERVED_KEYS` guard in `logger.ts` lets `msg`
    // and `level` through, and this assertion is the only thing standing between
    // a call site and a forged audit trail.
    expect(entry.msg).toBe('the real message');
    expect(entry.level).toBe('error');
    expect(entry.request_id).toBeNull();
    expect(entry.user_id).toBeNull();
    expect(entry.keeper).toBe('kept');
    expect([...((entry.dropped_fields as string[]) ?? [])].sort()).toEqual([
      'level',
      'msg',
      'request_id',
      'user_id',
    ]);
  });

  it('routes `withContext({requestId})` through the scope, not the envelope', () => {
    // The card's example is `log.info(msg, ctx)` with `withContext({requestId})`.
    // A request id is minted by the scope so that one value cannot disagree with
    // the `x-request-id` handed back to the client, which means the card's
    // spelling lands in `dropped_fields` on purpose: the intent — a line
    // carrying the request id — is met by the scope, and the attempt stays
    // visible rather than quietly winning.
    const { entries } = capture();
    withRequestScope(() => {
      log.withContext({ requestId: 'req-context', route: 'POST /api/sync' }).error('with context');
    }, { requestId: 'req-scope' });
    const entry = lastEntry(entries);
    expect(entry.request_id).toBe('req-scope');
    expect(entry.dropped_fields).toEqual(['request_id']);
    expect(entry.route).toBe('POST /api/sync');
  });

  it('honours the level threshold, from the option and from LOG_LEVEL', () => {
    const emitted: string[] = [];
    const quiet = createLogger({
      level: 'warn',
      sink: (_l, _e, level) => void emitted.push(level),
    });
    quiet.debug('d');
    quiet.info('i');
    quiet.warn('w');
    quiet.error('e');
    expect(emitted).toEqual(['warn', 'error']);

    expect(levelFromEnv('DEBUG')).toBe('debug');
    expect(levelFromEnv('  error ')).toBe('error');
    // A typo must not silence the app: the fallback is the default, not the
    // quietest or the loudest setting available.
    expect(levelFromEnv('verbose')).toBe('info');
    expect(levelFromEnv(undefined)).toBe('info');
    expect(['debug', 'info', 'warn', 'error']).toContain(log.level);
  });

  it('cannot be made to throw, including while it is failing', () => {
    // Watched red: removing either guard inside `emit()` makes the
    // sink-throwing case propagate out of `log.error` — and out of the request
    // that was only trying to report something.
    const cyclic: Record<string, unknown> = { name: 'root' };
    cyclic.self = cyclic;
    const deadSink = createLogger({
      level: 'debug',
      sink: () => {
        throw new Error('closed pipe');
      },
    });
    expect(() =>
      deadSink.error('sink is dead', { cycle: cyclic, big: BigInt(10), sym: Symbol('s') }),
    ).not.toThrow();

    // The clock is read inside `buildEntry`, so a broken one is the only
    // in-reachable way to prove the emergency line — written by hand, because
    // the serializer is what failed — is what reaches the sink.
    const emergency: string[] = [];
    const brokenClock = (): Date => {
      throw new Error('clock is broken');
    };
    expect(() =>
      createLogger({
        level: 'info',
        now: brokenClock,
        sink: (line) => void emergency.push(line),
      }).error('reporting the failure'),
    ).not.toThrow();
    expect(emergency).toHaveLength(1);
    expect(emergency[0]).toContain('"serialization_error":true');
    expect(JSON.parse(emergency[0]!)).toMatchObject({
      serialization_error: true,
      msg: 'log line serialization failed',
      request_id: null,
    });
  });
});

describe('request scope: the correlation that survives the hop', () => {
  it('carries one id through every frame, every await, and every nested scope', async () => {
    const { entries } = capture();
    await withRequestScope(async () => {
      log.error('handler entered');
      // A queue microtask is the same shape as the `await supabase.auth.getUser()`
      // hop the route makes three frames before anything is logged; if the store
      // were a module variable instead of AsyncLocalStorage, this is where the
      // id goes missing.
      await Promise.resolve();
      log.info('after the first await');
      await withRequestScope(async () => {
        // The nested scope adds the user the auth hop discovered; it must not
        // mint a second id, or AC-1's "correlation id on every log line for the
        // whole trail" becomes two trails to join by hand.
        await Promise.resolve();
        log.error('inside the repository');
      }, { userId: 'user-1' });
      log.error('back in the handler');
    }, { requestId: 'req-trail' });

    expect(entries.map((entry) => entry.request_id)).toEqual([
      'req-trail',
      'req-trail',
      'req-trail',
      'req-trail',
    ]);
    expect(entries.map((entry) => entry.user_id)).toEqual([null, null, 'user-1', null]);
    expect(entries.map((entry) => entry.level)).toEqual(['error', 'info', 'error', 'error']);
  });

  it('mints a fresh, well-formed id per request and never reuses one', async () => {
    const { entries } = capture();
    await withRequestScope(() => {
      log.error('first');
    });
    await withRequestScope(() => {
      log.error('second');
    });

    const [first, second] = entries.map((entry) => entry.request_id);
    expect(first).toMatch(UUID_V4);
    expect(second).toMatch(UUID_V4);
    expect(first).not.toBe(second);
  });

  it('keeps interleaved requests apart', async () => {
    const { entries } = capture();
    const gate = (id: string, delay: number) =>
      withRequestScope(async () => {
        log.error(`${id} open`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        log.error(`${id} closed`);
      }, { requestId: id });

    await Promise.all([gate('req-a', 5), gate('req-b', 1), gate('req-c', 3)]);

    const byRequest = new Map<string, Set<string>>();
    for (const entry of entries) {
      const id = String(entry.request_id);
      if (!byRequest.has(id)) byRequest.set(id, new Set());
      byRequest.get(id)?.add(entry.msg);
    }
    // Watched red: replace AsyncLocalStorage with a module-level variable and
    // `req-a closed` comes back carrying `req-c`'s id. Every other case in this
    // file is a single request, so this is the only one that can see it.
    expect([...byRequest.keys()].sort()).toEqual(['req-a', 'req-b', 'req-c']);
    for (const [id, messages] of byRequest) {
      expect([...messages].sort()).toEqual([`${id} closed`, `${id} open`]);
    }
  });

  it('says "no request scope" out loud rather than going quiet', () => {
    const { lines, entries } = capture();
    log.error('written from a script, a job, or a route that has not adopted the scope yet');

    expect(lastEntry(entries)).toMatchObject({
      request_id: null,
      user_id: null,
      session_id: null,
    });
    // The absent key and the null key are different facts: the first means
    // "nobody thought about it", the second means "there was no request". #125
    // exists because the codebase had the first kind — the causes were in the
    // output, and nothing tied them to a request.
    expect(Object.keys(JSON.parse(lines[0]!))).toEqual(
      expect.arrayContaining(['request_id', 'user_id', 'session_id']),
    );
  });

  it('gives nothing back after the request is over', async () => {
    const { entries } = capture();
    await withRequestScope(async () => {
      log.error('inside');
    }, { requestId: 'req-done', userId: 'user-9' });
    log.error('outside');

    expect(entries[0]!.request_id).toBe('req-done');
    expect(entries[1]).toMatchObject({ request_id: null, user_id: null });
  });

  it('fills what is unknown and refuses to overwrite what is not', async () => {
    const { entries } = capture();
    await withRequestScope(async () => {
      // This is `requireUserContext`: the id was minted at the top of the
      // handler, and the user is only discovered here, three frames below it.
      expect(attachCorrelation({ userId: 'user-1', sessionId: 'session-1' })).toBe(true);
      // Watched red: remove the "only fills blank fields" rule in `context.ts`
      // and a second caller can rewrite the identity of a request that already
      // has one — which is worse than a missing id, because it looks like data.
      expect(attachCorrelation({ userId: 'user-2', sessionId: 'session-2' })).toBe(false);
      expect(currentCorrelation()).toEqual({
        requestId: 'req-auth',
        userId: 'user-1',
        sessionId: 'session-1',
      });
      log.error('after the auth hop');
    }, { requestId: 'req-auth' });

    expect(entries[0]).toMatchObject({
      request_id: 'req-auth',
      user_id: 'user-1',
      session_id: 'session-1',
    });
  });

  it('reports an impossible write instead of pretending it landed', async () => {
    await withRequestScope(async () => {
      // Nothing to write is not the same as a failed write, but neither is a
      // success: the caller learns that the line will carry a null for that
      // field, which is the only way `requireUserContext` can tell that its
      // `user_id` never made it onto the trail.
      expect(attachCorrelation({})).toBe(false);
      expect(attachCorrelation({ userId: null })).toBe(false);
      expect(attachCorrelation({ userId: undefined })).toBe(false);
      expect(attachCorrelation({ userId: '   ' })).toBe(false);
      expect(currentCorrelation().userId).toBeNull();
      expect(attachCorrelation({ userId: 'user-1' })).toBe(true);
      expect(attachCorrelation({ userId: 'user-1' })).toBe(false);
    }, { requestId: 'req-x' });
    // Outside a scope there is nothing to attach to. The auth hop takes this
    // path today, because commit 1 has not wrapped the route handlers yet.
    expect(attachCorrelation({ userId: 'user-1' })).toBe(false);
    expect(currentCorrelation()).toEqual({ requestId: null, userId: null, sessionId: null });
  });

  it('hides the store from anyone who could mutate it', async () => {
    const { entries } = capture();
    await withRequestScope(async () => {
      const view = currentCorrelation() as { requestId: string | null; userId: string | null };
      view.userId = 'forged';
      view.requestId = 'forged-too';
      expect(currentCorrelation()).toEqual({
        requestId: 'req-copy',
        userId: null,
        sessionId: null,
      });
      // And the logger reads the store, not the caller's copy.
      log.error('untouched');
      expect(entries[0]).toMatchObject({ request_id: 'req-copy', user_id: null });
    }, { requestId: 'req-copy' });
  });
});



