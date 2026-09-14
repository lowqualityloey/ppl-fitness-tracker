/**
 * M4-05 (#94): the logging seam.
 *
 * This barrel is the intended import path — `import { log } from '../logger'` —
 * even though the rest of `lib/` imports concrete files. The card asks for "one
 * logging seam (module) used by all route handlers", and a seam with three
 * possible import paths is three chances to reach past it: a caller that
 * imports `logger.ts` directly gets a *different* default logger than the one
 * whose sink an integration test swaps, and the line it asserts was never the
 * line that was written.
 *
 * What lives where:
 *   - `context.ts`  — the request scope (`withRequestScope`, `attachCorrelation`)
 *   - `logger.ts`   — levels and the JSON line (`createLogger`, `buildEntry`)
 *   - `redact.ts`   — what a line is allowed to contain
 *   - `index.ts`    — the one logger the app uses, and the test seam for it
 */

import { consoleSink, createLogger, type LogEntry, type LogSink } from './logger';

export {
  attachCorrelation,
  currentCorrelation,
  hasRequestScope,
  mintRequestId,
  withRequestScope,
  type RequestCorrelation,
  type RequestScopeInit,
} from './context';

export {
  buildEntry,
  consoleSink,
  createLogger,
  DEFAULT_LEVEL,
  levelFromEnv,
  wireKey,
  type LogEntry,
  type LogFields,
  type Logger,
  type LoggerOptions,
  type LogLevel,
  type LogSink,
} from './logger';

export {
  isDeniedKey,
  normalizeKey,
  safeKey,
  sanitize,
  scrubString,
  MAX_ARRAY_ITEMS,
  MAX_DEPTH,
  MAX_OBJECT_KEYS,
  MAX_STRING_LENGTH,
  type SafeValue,
} from './redact';

/**
 * When set, every line from `log` is routed here instead of to the console.
 * `null` means "not overridden", which is different from "a sink that drops
 * everything" — that one is a legitimate test choice and must survive.
 */
let overrideSink: LogSink | null = null;

/**
 * The app's logger. Level comes from `LOG_LEVEL` (default `info`); warn and
 * error go to stderr, debug and info to stdout.
 */
export const log = createLogger({
  sink: (line: string, entry: LogEntry, level) => (overrideSink ?? consoleSink)(line, entry, level),
});

/**
 * Redirects `log`'s output and returns the restore function.
 *
 * This exists for #94's own verification step — "route specs assert the
 * structured line shape via an injected sink" — and for nothing else. It is a
 * module-level switch because a route handler is entered by Next, not by the
 * test, so the test has no place to hand a sink to `createLogger`; scoping the
 * swap to a single test keeps the blast radius honest, and callers should
 * restore it in `afterEach` rather than at the end of a file.
 */
export function setLogSink(sink: LogSink | null): () => void {
  const previous = overrideSink;
  overrideSink = sink;
  return () => {
    overrideSink = previous;
  };
}
