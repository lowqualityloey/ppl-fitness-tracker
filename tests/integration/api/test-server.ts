import { closeSync, openSync, readSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import {
  API_TEST_PORT,
  RESULTS_DIR,
  answersReadiness,
  apiOrigin,
  fileSize,
  installSignalCleanup,
  isProcessAlive,
  logTail,
  readServerManifest,
  removeServerManifest,
  spawnNextDev,
  truncateFile,
  waitForReady,
  type SpawnedServer,
} from './server-process.js';

/**
 * M4-05 (#94): the app's structured trail, read where it actually lands.
 *
 * `consoleSink` splits streams by severity — `info`/`debug` on stdout,
 * `warn`/`error` on stderr — so a spec that only watched one would be blind to
 * half the trail it is asserting on. Both go to the same log file and are
 * rejoined by request id, which is the whole point of the id.
 *
 * Lines are filtered by shape (`level` + `request_id` keys), not by a marker:
 * `next dev` writes its own prose to the same destination, and a JSON entry
 * from the seam is the only structured thing in the file. The filter is
 * deliberately `in`-based on the two envelope keys every entry carries, so a
 * malformed seam line surfaces as a failed predicate rather than as a silently
 * dropped one.
 */
export interface ServerLogEntry {
  time: string;
  level: string;
  msg: string;
  request_id: string | null;
  [field: string]: unknown;
}

/** Lines this file has read, in arrival order. */
const capturedLogs: ServerLogEntry[] = [];

/** Where this file's slice of the trail starts. */
let logPath: string | undefined;
let logReadOffset = 0;

/** A server this process spawned and therefore must stop. */
let ownedServer: SpawnedServer | undefined;
/**
 * Removes the SIGINT/SIGTERM handler installed for `ownedServer`.
 *
 * Held at module scope rather than in a local so `stopApiServer()` can retire
 * it: a handler left registered after the child is gone would still run on a
 * later Ctrl-C and `process.exit()` the worker out of a run it no longer owns.
 */
let removeOwnedSignalCleanup: (() => void) | undefined;
/** Attached to the server `globalSetup` booted; this process must not stop it. */
let attachedToSharedServer = false;

/**
 * Whether a parsed JSON value is one of the seam's log entries.
 *
 * Exported so the shape can be asserted directly. `msg` is required by
 * `ServerLogEntry` and is the field the timeout message joins, so a line
 * without a string `msg` is not an entry - it used to be pushed anyway, which
 * put `undefined` into every failure message that listed captured msgs.
 */
export function isServerLogEntry(value: unknown): value is ServerLogEntry {
  if (value === null || typeof value !== 'object') return false;
  if (!('level' in value) || !('request_id' in value) || !('msg' in value)) return false;
  return typeof (value as { msg: unknown }).msg === 'string';
}

function absorbLine(line: string): void {
  if (!line.startsWith('{')) return;
  try {
    const parsed: unknown = JSON.parse(line);
    if (isServerLogEntry(parsed)) {
      capturedLogs.push(parsed);
    }
  } catch {
    // `next dev`'s own output is prose that can start with `{` (webpack
    // digests). It is not the seam's line, and the seam either writes whole
    // lines or is the bug under test.
  }
}

/**
 * Reads whatever has been appended since the last call.
 *
 * The offset is the reason a shared log does not leak between files: file N
 * starts reading at EOF, so the three assertions in `sync.test.ts` only ever see
 * the lines produced by their own requests. A partially written trailing line is
 * left unconsumed — the JSON parse would fail on it anyway, and the 25 ms poll
 * loop picks it up once the newline lands.
 */
function refreshCapturedLogs(): void {
  const path = logPath;
  if (!path) return;

  const size = fileSize(path);
  if (size <= logReadOffset) return;

  const fd = openSync(path, 'r');
  let read: number;
  const buffer = Buffer.alloc(size - logReadOffset);
  try {
    read = readSync(fd, buffer, 0, buffer.length, logReadOffset);
  } finally {
    closeSync(fd);
  }

  const chunk = buffer.subarray(0, read);
  const lastNewline = chunk.lastIndexOf(0x0a);
  if (lastNewline < 0) return;

  logReadOffset += lastNewline + 1;
  for (const line of chunk.subarray(0, lastNewline).toString('utf8').split('\n')) {
    absorbLine(line.trim());
  }
}

/**
 * Polls the captured trail until a matching entry exists. The write happens
 * in the server child and crosses a file descriptor, so "the response has
 * arrived" does not imply "the line has landed" — the wait is what keeps the
 * spec from racing its own assertion. On timeout the failure names the
 * predicates' neighbourhood (captured msgs) rather than nothing, because
 * "found none" with no context is the worst possible debugging output.
 */
export async function waitForLogEntry(
  predicate: (entry: ServerLogEntry) => boolean,
  timeoutMs = 5_000,
): Promise<ServerLogEntry> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    refreshCapturedLogs();
    const found = capturedLogs.find(predicate);
    if (found) return found;
    if (Date.now() >= deadline) {
      throw new Error(
        `no log line matched within ${timeoutMs}ms; captured msgs: [${capturedLogs
          .map((entry) => entry.msg)
          .join(', ')}]`,
      );
    }
    await delay(25);
  }
}

/**
 * Makes a server available to the caller, one of two ways.
 *
 * **Shared**: `globalSetup` already booted one for the whole run and left a
 * manifest. Attach to it, starting this file's log window at EOF.
 *
 * **Owned**: there is no manifest, so this process spawns and stops its own
 * server — the path a direct `npx vitest run tests/integration/api/<file>.test.ts`
 * takes, which must keep working without the shared config.
 *
 * A manifest whose pid is gone is stale (a run that was killed, or a fallback
 * run after one); it is removed and owned mode takes over. A manifest whose pid
 * is *alive* but silent is the "server died mid-suite" case, and it fails here
 * with the log tail rather than quietly spawning a second server on the same
 * port.
 */
export async function startApiServer(): Promise<void> {
  if (ownedServer || attachedToSharedServer) return;

  const manifest = readServerManifest();
  if (manifest && manifest.port === API_TEST_PORT) {
    if (isProcessAlive(manifest.pid)) {
      if (!(await answersReadiness(apiOrigin))) {
        throw new Error(
          `Shared API server (pid ${manifest.pid}) is not reachable at ${apiOrigin}. ` +
            `Its log is ${manifest.logPath}. This is an infrastructure failure, not an assertion:\n` +
            logTail(manifest.logPath),
        );
      }
      attachedToSharedServer = true;
      logPath = manifest.logPath;
      logReadOffset = fileSize(manifest.logPath);
      return;
    }
    removeServerManifest();
  }

  const ownedLogPath = `${RESULTS_DIR}/api-server-owned-${process.pid}.log`;
  truncateFile(ownedLogPath);
  const server = await spawnNextDev({ port: API_TEST_PORT, logPath: ownedLogPath });
  ownedServer = server;
  logPath = ownedLogPath;
  logReadOffset = 0;

  /*
   * Own the signals before waiting, not after.
   *
   * The shared path gets this handler from `globalSetup`, but that is only
   * wired in by `vitest.api.config.ts`. A direct single-file run
   * (`npx vitest run tests/integration/api/<file>.test.ts`) has no globalSetup,
   * so this process is the only one that could ever stop the child it just
   * spawned. Without a handler, Ctrl-C during the 30 s readiness wait killed
   * the worker and left the detached child on :3101, and the next run failed
   * the "something is already serving" pre-check - the same leak
   * `global-setup.ts` documents, on the path that had no fix.
   *
   * `clearManifest: false`: only `globalSetup` writes `test-results/api-server.json`,
   * so an owned worker deleting it would remove a document it did not author.
   */
  removeOwnedSignalCleanup = installSignalCleanup(server);

  try {
    await waitForReady(apiOrigin, server.child, ownedLogPath, 30_000);
  } catch (error) {
    /*
     * Retire the handler and stop the child before rethrowing.
     *
     * The previous version only cleared `ownedServer`, which made
     * `stopApiServer()` a no-op in `afterAll` and left the half-started child
     * running. `waitForReady` SIGKILLs the group at its deadline, but it throws
     * for other reasons too - a spawn error, a child that exited on its own
     * (EADDRINUSE), a port that answers from something else - and on those the
     * child may still be alive. `stop()` resolves only once it is gone, so the
     * failure path now ends with nothing listening, which is what AC-9 of
     * `docs/tasks/2026-11-22-drizzle-rls-failures.md` measures.
     */
    removeOwnedSignalCleanup?.();
    removeOwnedSignalCleanup = undefined;
    ownedServer = undefined;
    await server.stop();
    throw error;
  }
}

/**
 * Stops only what this process started.
 *
 * In shared mode this is deliberately a no-op for the process, but it does drop
 * the attachment: the next file re-validates the manifest instead of inheriting
 * this file's worker state, which is what keeps a dead server from reading as
 * alive for the rest of the run.
 */
export async function stopApiServer(): Promise<void> {
  if (attachedToSharedServer) {
    attachedToSharedServer = false;
    return;
  }

  removeOwnedSignalCleanup?.();
  removeOwnedSignalCleanup = undefined;

  const activeServer = ownedServer;
  ownedServer = undefined;
  if (activeServer) await activeServer.stop();
}

export async function apiRequest(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${apiOrigin}${path}`, init);
}

export async function jsonRequest(
  path: string,
  body: unknown,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  return apiRequest(path, {
    ...init,
    headers,
    body: JSON.stringify(body),
  });
}

export async function responseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
