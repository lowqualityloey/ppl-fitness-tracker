import {
  closeSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

/**
 * The one module that knows how to run a Next dev server for the API suite.
 *
 * Split out of `test-server.ts` so the two lifecycle owners can share it: the
 * suite's `globalSetup` (one server for every file) and `startApiServer()`
 * (a server this process owns, used by a direct single-file run). Neither
 * should have its own copy of the spawn argv, the readiness probe, or the
 * SIGTERM-then-SIGKILL teardown - that is exactly the kind of duplication that
 * lets one path rot while the other keeps passing.
 */

/**
 * The port the suite runs on, validated at module load.
 *
 * A typo used to reach the child as `--port NaN` (measured 2026-11-19:
 * `M1_16_API_TEST_PORT=abc` -> `Number(...)` -> `NaN`), which Next answers
 * with a usage error 30 s into the run. Throwing here fails at collection time
 * and names the variable the operator typed.
 */
export function readPort(raw: string | undefined): number {
  if (raw === undefined || raw === '') return 3101;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`M1_16_API_TEST_PORT must be an integer in 1..65535, got "${raw}"`);
  }
  return port;
}

export const API_TEST_PORT = readPort(process.env.M1_16_API_TEST_PORT);
export const apiOrigin = `http://127.0.0.1:${API_TEST_PORT}`;

/** Where the suite's own artifacts live. Gitignored (`.gitignore` line 9). */
export const RESULTS_DIR = 'test-results';

/**
 * The shared server's log, and the manifest that tells a test worker a server
 * is already up, which process owns it, and which file to read its trail from.
 *
 * The manifest is not decoration: without it a worker would have to assume that
 * "something answers on 3101" means "the server this run booted", and a leaked
 * process from a killed run would be silently trusted. See `readServerManifest`
 * and the freshness guard in `global-setup.ts`.
 */
export const SHARED_LOG_PATH = `${RESULTS_DIR}/api-server.log`;
const SERVER_MANIFEST_PATH = `${RESULTS_DIR}/api-server.json`;

export interface SharedServerManifest {
  pid: number;
  port: number;
  logPath: string;
  startedAt: string;
}

export interface SpawnedServer {
  child: ChildProcess;
  stop(): Promise<void>;
}

/**
 * The subset of a child environment this module is willing to decide on its own.
 *
 * A partial map on purpose: the caller merges it over `process.env`, so the child
 * inherits the operator's environment and only these three names are settled here.
 * Typed as `string` rather than `string | undefined` because a resolved value is
 * always present - the one variable with no safe default is either supplied by the
 * operator or refused before the child is spawned.
 */
export interface SpawnEnvOverrides {
  NEXT_PUBLIC_APP_URL: string;
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
}

/**
 * Parses a manifest document, rejecting anything that could describe a process
 * this run does not own.
 *
 * `pid` must be a positive integer: `process.kill(0, 0)` succeeds on POSIX, so a
 * corrupt `pid: 0` used to read as a live server (measured 2026-11-19). `port`
 * is range-checked for the same reason - a manifest that cannot name a real
 * port cannot describe a real server.
 */
export function parseServerManifest(raw: string): SharedServerManifest | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object') return null;
  const candidate = parsed as Partial<SharedServerManifest>;
  if (typeof candidate.pid !== 'number' || !Number.isInteger(candidate.pid) || candidate.pid < 1) {
    return null;
  }
  if (
    typeof candidate.port !== 'number' ||
    !Number.isInteger(candidate.port) ||
    candidate.port < 1 ||
    candidate.port > 65_535
  ) {
    return null;
  }
  if (typeof candidate.logPath !== 'string') return null;
  return {
    pid: candidate.pid,
    port: candidate.port,
    logPath: candidate.logPath,
    startedAt: typeof candidate.startedAt === 'string' ? candidate.startedAt : 'unknown',
  };
}

export function readServerManifest(): SharedServerManifest | null {
  try {
    return parseServerManifest(readFileSync(SERVER_MANIFEST_PATH, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Writes the manifest atomically: a temp file, then a rename onto the target.
 *
 * Workers read this file from other processes. An in-place write exposes a
 * window where the document is truncated or half-written, and a reader that
 * lands in it sees a manifest it must treat as corrupt - which is
 * indistinguishable from "no server". `rename(2)` is atomic within a
 * filesystem, so a reader sees either the previous complete document or the
 * new one.
 */
export function writeServerManifest(manifest: SharedServerManifest): void {
  mkdirSync(RESULTS_DIR, { recursive: true });
  const temporary = `${SERVER_MANIFEST_PATH}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`);
  renameSync(temporary, SERVER_MANIFEST_PATH);
}

export function removeServerManifest(): void {
  rmSync(SERVER_MANIFEST_PATH, { force: true });
  rmSync(`${SERVER_MANIFEST_PATH}.tmp`, { force: true });
}

/** `kill(pid, 0)` sends no signal; it only asks whether the process exists. */
export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Size of a log file, or `0` when it does not exist yet.
 *
 * Only `ENOENT` means "empty". Swallowing every error made an unreadable log
 * (`EACCES`, a directory in the way) read as a zero-length one, so the log
 * reader silently captured nothing and a spec asserting on the trail failed
 * with "no log line matched" instead of naming the permission problem.
 */
export function fileSize(path: string): number {
  try {
    return statSync(path).size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw error;
  }
}

export function truncateFile(path: string): void {
  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(path, '');
}

/**
 * Removes owned-server logs whose pid is gone.
 *
 * The owned path (`startApiServer()`'s fallback for a direct single-file run)
 * names its log after the worker pid, so a killed run leaves the file behind
 * forever. 17 such files dated 2026-10-23 were on disk from exactly this
 * pattern. A log whose pid is still alive is left alone: it belongs to a
 * server that may still be running.
 */
export function pruneStaleOwnedLogs(): number {
  let removed = 0;
  let entries: string[];
  try {
    entries = readdirSync(RESULTS_DIR);
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const match = /^api-server-owned-(\d+)\.log$/.exec(entry);
    if (!match) continue;
    const pid = Number(match[1]);
    if (isProcessAlive(pid)) continue;
    try {
      rmSync(`${RESULTS_DIR}/${entry}`, { force: true });
      removed += 1;
    } catch {
      // A log that cannot be removed is not worth failing a run over.
    }
  }
  return removed;
}

/** The tail of a server log, for a failure that has to explain itself. */
export function logTail(path: string, lines = 40): string {
  try {
    const text = readFileSync(path, 'utf8').trimEnd();
    if (!text) return '<log is empty>';
    return text.split('\n').slice(-lines).join('\n');
  } catch (error) {
    return `<no log at ${path}: ${String(error)}>`;
  }
}

/**
 * The harness supports Linux and macOS only.
 *
 * The `win32` branches were deleted rather than repaired. They could not work:
 * `spawn('npx', ...)` without `shell: true` cannot resolve `npx.cmd` on Windows,
 * and `process.kill(-pid, ...)` addresses a process group Windows does not have,
 * so the signal reached only the `npx` shim while `next dev` kept running. A
 * path that cannot work is worse than an absent one - it reads as support. No
 * Windows runner exists in `.github/workflows/test.yml` (line 62 pins
 * `runs-on: ubuntu-latest`), so nothing exercised it either.
 */
export function assertSupportedPlatform(platform: NodeJS.Platform = process.platform): void {
  if (platform === 'win32') {
    throw new Error(
      'The API-suite harness supports Linux and macOS only. The win32 branch was removed because ' +
        'it could not start npx without a shell and could not signal the real process group; ' +
        'see docs/reviews/2026-11-19-api-suite-shared-server.md (S4).',
    );
  }
}

export function signalApiServer(child: ChildProcess, signal: NodeJS.Signals): void {
  assertSupportedPlatform();
  if (child.pid !== undefined) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // Fall through when the process group has already exited.
    }
  }
  child.kill(signal);
}

/**
 * Stops a server this process spawned, and resolves only once it is gone.
 *
 * Two things were wrong with the previous guard, both measured 2026-11-19:
 *
 * 1. It tested `child.exitCode !== null` alone. A signal-killed child reports
 *    `code: null, signal: 'SIGKILL'` and afterwards `exitCode === null` with
 *    `signalCode === 'SIGKILL'`, so the guard never fired and teardown burned
 *    the whole 5 s budget on a child that was already dead.
 * 2. The 5 s timer called `finish()` itself, so a SIGKILL that did not take
 *    effect immediately resolved `stop()` while the child was still alive and
 *    the port still bound. The next run then failed the "something is already
 *    serving" pre-check.
 *
 * Now the 5 s is a deadline for *escalating* to SIGKILL, and the promise
 * settles on the child's own `exit` event. The abandon timer below is the last
 * resort for a pid that never was ours; it is not the normal path.
 */
export async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;

  let settle: () => void = () => {};
  const exited = new Promise<void>((resolve) => {
    settle = resolve;
    child.once('exit', () => resolve());
  });

  signalApiServer(child, 'SIGTERM');
  const escalate = setTimeout(() => signalApiServer(child, 'SIGKILL'), 5_000);
  const abandon = setTimeout(() => settle(), 8_000);
  try {
    await exited;
  } finally {
    clearTimeout(escalate);
    clearTimeout(abandon);
  }
}

/**
 * Signals the child and, when asked, drops the manifest on the way out of a killed run.
 *
 * `globalSetup` returns a teardown closure, and Vitest only runs that closure
 * on its normal exit path. Its SIGINT/SIGTERM handler calls `process.exit()`
 * from a `setTimeout(..., 1)` without running teardown (measured in Vitest
 * 5.0.5, `dist/chunks/index.1TqnEahn.js:8578-8595`), so Ctrl-C on a running
 * suite used to leave the detached child holding :3101 forever. The next run
 * then failed the "something is already serving" pre-check and had to be
 * cleaned up by hand; 17 orphaned `api-server-owned-*.log` files dated
 * 2026-10-23 were the residue of exactly this.
 *
 * It lives here rather than in `global-setup.ts` because both lifecycle owners
 * need it. The owned path (`startApiServer()`) had no handler at all: a Ctrl-C
 * during its readiness wait killed the worker and left the child it had just
 * spawned on :3101, which is the same leak the shared path was fixed for. A
 * copy in each file is what let the two drift apart in the first place.
 *
 * The first half is deliberately synchronous. A competing listener may call
 * `process.exit()` one tick later, so the SIGTERM to the child's process group
 * (and the manifest removal, for the owner that wrote one) happen before
 * anything is awaited - both are operations that have already taken effect by
 * the time the next line runs. The awaited `stop()` afterwards is best effort.
 *
 * Registering a signal listener suppresses Node's default terminate, so when
 * nothing else is listening this handler exits with the conventional 128+n
 * status instead of hanging the terminal.
 *
 * `clearManifest` is false for the owned path on purpose: only `globalSetup`
 * writes `test-results/api-server.json`, so an owned worker removing it would
 * be deleting a document another process is the author of.
 */
export function installSignalCleanup(
  server: SpawnedServer,
  options: { clearManifest?: boolean } = {},
): () => void {
  const clearManifest = options.clearManifest === true;
  const hadOwnHandler = new Map<NodeJS.Signals, boolean>([
    ['SIGINT', process.listenerCount('SIGINT') > 0],
    ['SIGTERM', process.listenerCount('SIGTERM') > 0],
  ]);
  let handled = false;

  const onSignal = (signal: NodeJS.Signals): void => {
    if (handled) return;
    handled = true;
    signalApiServer(server.child, 'SIGTERM');
    if (clearManifest) removeServerManifest();
    void server.stop();
    if (hadOwnHandler.get(signal) !== true) {
      process.exitCode = signal === 'SIGINT' ? 130 : 143;
      process.exit(process.exitCode);
    }
  };

  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  return () => {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  };
}

/**
 * The variables the spawned child cannot invent, with the ones it can.
 *
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY` used to fall back to the well-known Supabase
 * local-development anon key right here in `spawnNextDev`. That fallback is gone,
 * for two reasons and in that order of importance:
 *
 * 1. **It hid the real failure one layer down.** `lib/env/server.ts` makes the
 *    child require this name (`ServerEnvSchema`), and `src/instrumentation.ts`
 *    ends the process on a bad environment. So a parent that never had the key
 *    still spawned a child that exited 1, and the harness reported
 *    `Next test server exited before readiness (code 1)` - a sentence about a
 *    server instead of a sentence about a missing variable. The precondition
 *    belongs on the side that can name it.
 * 2. **The fallback was a credential-shaped literal in the tree.** It is the
 *    published local-development key, so it was never a leaked secret, but the
 *    repo's documented policy is a placeholder (`.env.example`: `REPLACE_ME`),
 *    and a test harness quietly disagreeing with that policy is how a fixture key
 *    survives into a place it was never meant to reach.
 *
 * The other two names keep their defaults on purpose, and the distinction is the
 * whole point: `http://127.0.0.1:54321` and this harness's own origin are
 * **addresses** with one obvious local answer, while a key has no correct default
 * - any value the harness invented would be a credential the operator did not
 * choose.
 *
 * Returns only the keys this module decides, not a whole environment. The caller
 * spreads them over `process.env`, so the child still inherits everything the
 * operator set, and the result is assignable to `spawn`'s `env` option without a
 * cast (`@types/node` requires `NODE_ENV` there, which a bare record lacks).
 *
 * Pure and argument-driven so it is testable without mutating `process.env`, the
 * same shape as `readPort` and `parseServerManifest`.
 */
export function resolveSpawnEnv(
  source: Record<string, string | undefined> = process.env,
): SpawnEnvOverrides {
  const anonKey = source.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (anonKey === undefined || anonKey === '') {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_ANON_KEY must be set for the API suite: the harness no ' +
        'longer substitutes a local-development key, because the child rejects a ' +
        'missing one by exiting 1 and that surfaces as a readiness failure. Add it ' +
        'to .env.local (values: `npm run db:status`, names: .env.example); ' +
        '`npm run test:api` loads that file.',
    );
  }

  return {
    NEXT_PUBLIC_APP_URL: source.NEXT_PUBLIC_APP_URL ?? apiOrigin,
    NEXT_PUBLIC_SUPABASE_URL: source.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
  };
}

/**
 * Spawns `next dev` with its stdout/stderr going straight to `logPath`.
 *
 * Two file descriptors on the same path in append mode, not one shared fd: a
 * JSON line written by the seam can arrive on either stream (`consoleSink` puts
 * `info`/`debug` on stdout and `warn`/`error` on stderr). `O_APPEND` makes
 * each `write(2)` atomic at end-of-file, but it does **not** order two
 * descriptors against each other - they are exactly as interleavable as one fd
 * would be. What keeps the lines intact is that the seam writes each entry as
 * one whole line, so no interleaving can split an entry. Two fds are still the
 * right shape: they are what keeps the two streams from being merged *inside*
 * the child before either is written.
 *
 * The caller truncates the file first; `spawnNextDev` only appends.
 *
 * `--port` is explicit on purpose. Next only retries neighbouring ports when the
 * port came from a default (`allowRetry = portSource === 'default'` in
 * `node_modules/next/dist/cli/next-dev.js`), so an occupied 3101 makes this child
 * exit 1 with `EADDRINUSE` rather than quietly serving a different port. The
 * freshness guard depends on that, and it is verified against the installed
 * Next 16.4.1 rather than remembered.
 */
export async function spawnNextDev(opts: {
  port: number;
  logPath: string;
}): Promise<SpawnedServer> {
  assertSupportedPlatform();
  // Resolved before the log descriptors are opened: a rejected environment must
  // not leave two open handles behind on its way out.
  const envOverrides = resolveSpawnEnv();
  const stdoutFd = openSync(opts.logPath, 'a');
  const stderrFd = openSync(opts.logPath, 'a');
  const child = spawn(
    'npx',
    ['--no-install', 'next', 'dev', '--port', String(opts.port)],
    {
      cwd: process.cwd(),
      detached: true,
      // Spread over the parent's environment, which is what makes this a
      // `ProcessEnv` and lets the child keep every variable the operator set.
      env: { ...process.env, ...envOverrides },
      stdio: ['ignore', stdoutFd, stderrFd],
    },
  );
  // The child holds its own duplicates; the parent's copies would only leak.
  closeSync(stdoutFd);
  closeSync(stderrFd);

  return {
    child,
    stop: async () => stopChild(child),
  };
}

/**
 * Waits a bounded window to see whether a child that just answered readiness
 * is still alive.
 *
 * The previous guard slept a fixed 250 ms and then checked `exitCode` once.
 * Measured 2026-11-19 on this machine, with a listener holding `:3101`,
 * `npx --no-install next dev --port 3101` exits **code 1 after 1,161 ms** - so
 * the fixed sleep checked roughly 4.6x too early and would have read a doomed
 * child as healthy. Polling returns the moment the child dies and costs at most
 * `timeoutMs` once per run.
 *
 * Returns `true` when the child survived the window, `false` when it did not.
 * It does not throw: the caller owns the message, because it is the caller that
 * knows the port and the log path.
 */
export async function confirmSurvived(
  child: ChildProcess,
  timeoutMs = 2_000,
  intervalMs = 50,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (child.exitCode !== null || child.signalCode !== null) return false;
    if (Date.now() >= deadline) return true;
    await delay(intervalMs);
  }
}

/** How a child stopped, for a message a human has to act on. */
export function describeExit(child: ChildProcess): string {
  if (child.signalCode !== null) return `signal ${child.signalCode}`;
  return `code ${String(child.exitCode)}`;
}

/**
 * Polls the readiness probe until the server answers, the child dies, or the
 * deadline passes.
 *
 * Probed path: an unmatched route whose 404 the app router itself produces,
 * rather than `/`.
 *
 * What is established: a readiness probe must not be a request through a
 * product screen. `/` is now the dashboard (M3-04, #61), so probing it means
 * the harness's notion of "up" depends on that route compiling and, for a
 * signed-in visitor, on Supabase auth and three database queries. Any future
 * work on `/` then changes what "ready" means, and a 500 from a hiccup reads
 * as "the server never started".
 *
 * What is **not** established, and was measured rather than assumed: this is
 * not a speed fix, at least not on a warm cache. Measured here with `.next`
 * already populated - production server: probe 166 ms, `/` 162 ms
 * (unauthenticated `/` answers 307 to sign-in and never reaches the
 * queries). Dev server, first request after boot: probe **3115 ms**, `/`
 * **1827 ms**; second request 70 ms and 87 ms. The probe is the *slower* one
 * cold, because it compiles the not-found route instead. So the case for it is
 * the dependency, not the latency, and the CI failure this followed
 * (`Hook timed out in 10000ms` in `prefill.test.ts`) is attributed to the
 * budget below - which was genuinely unreachable - rather than to a proven cost
 * in `/`. A cold CI checkout, where the dashboard's route graph has to compile
 * from nothing, remains the untested suspect.
 *
 * `status < 500` stays the contract: a 500 means the router is up but broken.
 *
 * Failure attribution, all measured 2026-11-19:
 * - A spawn that fails (`ENOENT`) never sets `pid` and never sets
 *   `exitCode`, so the old exit branch could not fire; the run reported
 *   `last client error: TypeError: fetch failed` after the full 30 s. The spawn
 *   error is now kept separately and preferred in the message.
 * - A signal-killed child has `exitCode === null`, so the exit branch also has
 *   to test `signalCode`.
 * - A *blocked* probe hid the exit entirely. With a listener that accepts
 *   connections and never answers, the child exited with code 1 at 1.3 s and
 *   this loop did not look at it again for 45 s, because it was parked inside
 *   an unanswered `fetch`; the run reported a readiness timeout while the log
 *   held `EADDRINUSE`. Each attempt is therefore bounded (2 s, or whatever is
 *   left of the budget) and aborted the moment the child exits, so the exit
 *   check above is actually reached.
 */
export async function waitForReady(
  origin: string,
  child: ChildProcess,
  logPath: string,
  timeoutMs = 30_000,
): Promise<void> {
  let lastError: unknown;
  let spawnError: unknown;
  child.once('error', (error) => {
    spawnError = error;
  });

  // Give the 'error' event its tick: for a failed spawn, `pid` stays undefined
  // and the event is emitted after the current macrotask.
  await delay(0);
  if (child.pid === undefined && child.exitCode === null && child.signalCode === null) {
    throw new Error(
      'Next test server could not be spawned' +
        (spawnError === undefined ? '' : `: ${String(spawnError)}`) +
        ': ' +
        (logTail(logPath) || '<log is empty>'),
    );
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(
        `Next test server exited before readiness (${describeExit(child)})` +
          (spawnError === undefined ? '' : ` - spawn error: ${String(spawnError)}`) +
          ': ' +
          logTail(logPath),
      );
    }

    /*
     * Each attempt is bounded, and it is cut short the moment the child dies.
     *
     * Without this, one probe could hang for as long as the socket's own
     * timeout - measured 2026-11-19 with a listener that accepts connections
     * and never answers (the exact shape of a leaked holder): the child exited
     * with code 1 at 1.3 s, and the loop did not look at it again for 45 s,
     * because it was parked inside `fetch` the whole time. The run then
     * reported a 30 s readiness timeout instead of the `EADDRINUSE` sitting in
     * the log. The exit check above is only worth having if the loop returns
     * to it.
     */
    const controller = new AbortController();
    const onExit = (): void => controller.abort();
    child.once('exit', onExit);
    const attempt = setTimeout(
      () => controller.abort(),
      Math.max(1, Math.min(2_000, deadline - Date.now())),
    );

    try {
      const response = await fetch(`${origin}/__readiness-probe__`, {
        signal: controller.signal,
      });
      if (response.status < 500) {
        /*
         * A response is readiness. Releasing the body is politeness, not part
         * of the gate: a dev server that has already answered 404 must not be
         * re-read as "not up yet" because the socket failed while its body was
         * discarded. That distinction is not hypothetical - it produced a run
         * that polled a perfectly healthy server for 30 s and then failed the
         * suite with nothing but 404 lines to show for it.
         */
        await response.body?.cancel().catch(() => {});
        return;
      }
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(attempt);
      child.off('exit', onExit);
    }

    await delay(100);
  }

  signalApiServer(child, 'SIGKILL');
  throw new Error(
    `Next test server did not become ready within ${timeoutMs}ms` +
      (spawnError === undefined ? '' : ` (spawn error: ${String(spawnError)})`) +
      (lastError === undefined ? '' : ` (last client error: ${String(lastError)})`) +
      ': ' +
      (logTail(logPath) || '<log is empty>'),
  );
}

/**
 * One readiness question, single attempt, for liveness checks.
 *
 * Deliberately does not retry: it answers "is something already serving this
 * port right now", and a refused connection is the ordinary answer during a
 * cold start. Retrying would add its whole budget to every run that has no
 * server yet. A hung holder answers `false` after the deadline and fails one
 * step later with `EADDRINUSE`, which is equally loud.
 */
export async function answersReadiness(origin: string, timeoutMs = 2_000): Promise<boolean> {
  try {
    const response = await fetch(`${origin}/__readiness-probe__`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    await response.body?.cancel();
    return response.status < 500;
  } catch {
    return false;
  }
}
