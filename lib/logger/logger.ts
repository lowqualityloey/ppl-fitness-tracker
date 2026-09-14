/**
 * M4-05 (#94): the serializer of the logging seam.
 *
 * The contract, in the order the constraints arrive from the card and the spec:
 *
 * 1. **One line, parseable JSON.** `docs/specs/…-m4-…` §3.2 names the interface
 *    (`log.info(msg, ctx)`) and the output shape (JSON lines). A line that
 *    wraps is a line that `grep` reads as two events, so `time`, `level` and
 *    `msg` are emitted first and every value goes through `sanitize`.
 * 2. **snake_case on the wire, camelCase at the call site.** The consumers are
 *    `grep`, CI capture and whatever ships these later; the caller is
 *    TypeScript. The mapping happens in exactly one function, `wireKey`, so
 *    there is one place to ask "why is my field named that".
 * 3. **`request_id` is always present, and `null` means unscoped.** The absent
 *    key and the null key are different facts, and #125 was filed precisely
 *    because the codebase had the first kind: 1003 rejections and no recorded
 *    cause. A line that says `"request_id":null` is a line that says *this
 *    caller never entered a request scope*, which is a lead rather than a hole.
 * 4. **It cannot throw, and it cannot leak.** A logger that fails while a
 *    request is already failing converts one defect into two, so serialization
 *    and the sink are both guarded; `redact.ts` owns what may be said, and this
 *    module never bypasses it — not even for `msg`, because a pasted JWT sits in
 *    the message text more often than in a field.
 * 5. **A caller cannot forge the envelope.** Reserved keys win, and the field
 *    that lost is named in `dropped_fields` instead of vanishing.
 *
 * Deliberately absent: a transport, rotation, sampling and pretty-printing.
 * `DECISION-m4-002` rejected `pino`/`consola` for the same reason and approved
 * this seam at roughly sixty lines; M4-06 owns the Sentry transport and M4-07
 * owns the metrics channel. Anything that writes a log line to somewhere other
 * than a sink handed to it here is out of scope, which is also why the sink is
 * injectable: #94's own verification asks route specs to assert the line shape
 * "via an injected sink".
 */

import { currentCorrelation, type RequestCorrelation } from './context';
import { sanitize, safeKey, scrubString, type SafeValue } from './redact';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const SEVERITY: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type LogFields = Readonly<Record<string, unknown>>;

/** A structured line as it appears on the wire. */
export interface LogEntry {
  time: string;
  level: LogLevel;
  msg: string;
  request_id: string | null;
  user_id: string | null;
  session_id: string | null;
  [field: string]: SafeValue;
}

/**
 * `entry` is passed alongside the rendered line so a test sink can assert the
 * shape without re-parsing, and so a transport (M4-06) can read fields without
 * stringifying twice.
 */
export type LogSink = (line: string, entry: LogEntry, level: LogLevel) => void;

export interface LoggerOptions {
  sink?: LogSink;
  level?: LogLevel;
  /** Fields merged into every line from this logger; a call-site field of the same name wins. */
  base?: LogFields;
  /** Test seam for the timestamp. Mirrors the injected-generator style of `src/app/state/device-identity.ts:56`. */
  now?: () => Date;
}

export interface Logger {
  readonly level: LogLevel;
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  /** Returns a logger carrying `fields` on every line. The card's `withContext({requestId})`. */
  withContext(fields: LogFields): Logger;
}

/**
 * The keys this module owns. A call site that supplies one does not silently
 * replace it — it is renamed into `dropped_fields`, because a field that
 * disappears with no trace is the mystery this card exists to close.
 */
const RESERVED_KEYS: ReadonlySet<string> = new Set([
  'time',
  'level',
  'msg',
  'request_id',
  'user_id',
  'session_id',
]);

export const DEFAULT_LEVEL: LogLevel = 'info';

/**
 * Resolves `LOG_LEVEL`. An unreadable value falls back to the default rather
 * than to the quietest or the loudest setting: a typo in an environment
 * variable must not silence errors, and must not flood a production stdout.
 */
export function levelFromEnv(value: string | undefined): LogLevel {
  const normalized = (value ?? '').trim().toLowerCase();
  return normalized === 'debug' ||
    normalized === 'info' ||
    normalized === 'warn' ||
    normalized === 'error'
    ? normalized
    : DEFAULT_LEVEL;
}

/** `email` → `email`; `emailRedacted` → `email_redacted`; `requestId` → `request_id`. */
export function wireKey(key: string): string {
  return safeKey(key)
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');
}

function correlationFields(
  correlation: RequestCorrelation,
): { request_id: string | null; user_id: string | null; session_id: string | null } {
  return {
    request_id: correlation.requestId,
    user_id: correlation.userId,
    session_id: correlation.sessionId,
  };
}

/**
 * Builds a line from, in precedence order: the logger's base fields, then the
 * active request scope's correlation, then the call-site fields.
 */
export function buildEntry(
  level: LogLevel,
  message: string,
  callFields: LogFields | undefined,
  base: LogFields,
  now: () => Date,
): LogEntry {
  const extras: Record<string, SafeValue> = {};
  const dropped: string[] = [];

  for (const source of [base, callFields]) {
    if (!source) continue;
    for (const [key, value] of Object.entries(source)) {
      const wire = wireKey(key);
      if (RESERVED_KEYS.has(wire)) {
        dropped.push(wire);
        continue;
      }
      extras[wire] = sanitize(value);
    }
  }

  const entry: LogEntry = {
    time: now().toISOString(),
    level,
    // Scrubbed like any other string: the credential is more often pasted into
    // the sentence than filed under a key.
    msg: scrubString(message),
    ...correlationFields(currentCorrelation()),
    ...extras,
  };
  if (dropped.length > 0) {
    entry.dropped_fields = dropped;
  }
  return entry;
}

/** stdout for the record stream, stderr for the fault stream, so a piped run stays readable. */
export const consoleSink: LogSink = (line, _entry, level) => {
  const stream = level === 'error' || level === 'warn' ? 'stderr' : 'stdout';
  const target = typeof process !== 'undefined' ? process[stream] : undefined;
  target?.write(`${line}\n`);
};

export function createLogger(options: LoggerOptions = {}): Logger {
  const sink = options.sink ?? consoleSink;
  const level = options.level ?? levelFromEnv(process.env.LOG_LEVEL);
  const base = options.base ?? {};
  const now = options.now ?? (() => new Date());

  const emit = (severity: LogLevel, message: string, fields?: LogFields): void => {
    if (SEVERITY[severity] < SEVERITY[level]) return;
    let line: string;
    let entry: LogEntry;
    try {
      entry = buildEntry(severity, message, fields, base, now);
      line = JSON.stringify(entry);
    } catch (cause) {
      // Never let the act of reporting a failure become one. The fallback is
      // built by hand — and deliberately stamped with the real clock, because
      // the failure being reported may *be* the clock, and a log line with no
      // timestamp is a line that cannot be ordered against its neighbours.
      try {
        entry = {
          time: new Date().toISOString(),
          level: 'error',
          msg: 'log line serialization failed',
          request_id: null,
          user_id: null,
          session_id: null,
          serialization_error: true,
          cause: cause instanceof Error ? scrubString(cause.message) : String(cause),
          original: scrubString(message),
        };
        line = JSON.stringify(entry);
      } catch {
        // The only thing left that can fail is `Date` itself, or a heap too
        // broken to build a string. There is nowhere to report that from.
        return;
      }
    }
    try {
      sink(line, entry, severity);
    } catch {
      // A closed stream means there is nowhere to report to. The request still
      // gets its answer.
    }
  };

  return {
    level,
    debug: (message, fields) => emit('debug', message, fields),
    info: (message, fields) => emit('info', message, fields),
    warn: (message, fields) => emit('warn', message, fields),
    error: (message, fields) => emit('error', message, fields),
    withContext: (fields) => createLogger({ ...options, base: { ...base, ...fields } }),
  };
}

