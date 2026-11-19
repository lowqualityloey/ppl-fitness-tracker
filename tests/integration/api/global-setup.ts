import {
  API_TEST_PORT,
  answersReadiness,
  apiOrigin,
  confirmSurvived,
  describeExit,
  logTail,
  pruneStaleOwnedLogs,
  readServerManifest,
  removeServerManifest,
  SHARED_LOG_PATH,
  signalApiServer,
  spawnNextDev,
  truncateFile,
  waitForReady,
  writeServerManifest,
  type SpawnedServer,
} from './server-process.js';

/**
 * Prints a setup failure, then throws it.
 *
 * Vitest 5.0.5's reporter crashes while printing an error thrown from
 * `globalSetup`: a three-line scratch project reproduces it, and the thrown
 * message is replaced by `TypeError: code.charCodeAt is not a function` from
 * Vite's source-map extraction. So whatever a human can see is printed here
 * first, and the throw still makes the run exit 1 having run zero tests.
 */
function fail(message: string): never {
  console.error(`
API suite setup failed:
${message}
`);
  throw new Error(message);
}

/**
 * Signals the child and drops the manifest on the way out of a killed run.
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
 * The first half is deliberately synchronous. A competing listener may call
 * `process.exit()` one tick later, so the SIGTERM to the child's process group
 * and the manifest removal happen before anything is awaited - both are
 * operations that have already taken effect by the time the next line runs.
 * The awaited `stop()` afterwards is best effort.
 *
 * Registering a signal listener suppresses Node's default terminate, so when
 * nothing else is listening this handler exits with the conventional 128+n
 * status instead of hanging the terminal.
 */
function installSignalCleanup(server: SpawnedServer): () => void {
  const hadOwnHandler = new Map<NodeJS.Signals, boolean>([
    ['SIGINT', process.listenerCount('SIGINT') > 0],
    ['SIGTERM', process.listenerCount('SIGTERM') > 0],
  ]);
  let handled = false;

  const onSignal = (signal: NodeJS.Signals): void => {
    if (handled) return;
    handled = true;
    signalApiServer(server.child, 'SIGTERM');
    removeServerManifest();
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
 * Boots the one `next dev` server the whole API suite shares.
 *
 * `vitest.api.config.ts` wires this in, and only `npm run test:api` uses that
 * config. Everything a test worker needs to attach is written to
 * `test-results/api-server.json`; the server's trail goes to
 * `test-results/api-server.log`, because a worker process cannot see the memory
 * of the process that spawned the child.
 *
 * Why this exists: each of the 14 files used to spawn its own server, measured
 * at 16.65 s for the first boot and 9.47 s for each warm one — roughly 140 s of
 * a 208–249 s CI step spent starting the same server to serve the same routes
 * against the same database. See `docs/specs/2026-10-23-spec-api-suite-shared-server.md`.
 *
 * A throwing `globalSetup` makes Vitest exit 1 having run zero tests, which is
 * the property that keeps a broken harness from looking like a green one.
 */
export default async function setup(): Promise<() => Promise<void>> {
  /*
   * Sweep the owned-mode logs a killed run left behind. A log named after a
   * dead pid can never be written again, and there were 17 of them on disk
   * from the 2026-10-23 runs.
   */
  pruneStaleOwnedLogs();

  /*
   * Refuse to adopt a server this run did not start.
   *
   * The manifest is the only sanctioned way a worker learns a server is up, and
   * this process writes it *after* its own child is ready. So if the port
   * already answers, the manifest is stale or absent and the responder belongs
   * to nobody here — a server leaked by a killed run. Testing against it would
   * report results for a build this checkout no longer has.
   */
  if (await answersReadiness(apiOrigin)) {
    const stale = readServerManifest();
    const started = stale === null ? '' : ` It was started at ${stale.startedAt} by pid ${stale.pid}.`;
    fail(
      `Something is already serving ${apiOrigin} before the suite started. ` +
        'That is a leaked server from a previous run, and reusing it would test a process ' +
        `this run does not own.${started} ` +
        `Kill it and rerun: lsof -ti :${API_TEST_PORT} | xargs kill`,
    );
  }

  truncateFile(SHARED_LOG_PATH);
  const server = await spawnNextDev({ port: API_TEST_PORT, logPath: SHARED_LOG_PATH });
  const removeSignalCleanup = installSignalCleanup(server);
  try {
    await waitForReady(apiOrigin, server.child, SHARED_LOG_PATH, 30_000);
  } catch (error) {
    removeSignalCleanup();
    await server.stop();
    fail(error instanceof Error ? error.message : String(error));
  }

  /*
   * Freshness guard: readiness must come from the child this process spawned.
   *
   * `--port` is explicit, so Next does not retry neighbouring ports and an
   * occupied 3101 makes the child exit 1 (`EADDRINUSE`) instead of serving 3102
   * while the probe answers from whatever already held 3101. The child needs a
   * moment to reach that failure, and the previous fixed 250 ms sleep checked
   * far too early: measured on this machine with a listener holding :3101,
   * `npx --no-install next dev --port 3101` exits 1 after 1,161 ms. `confirmSurvived`
   * polls, so it returns the moment the child dies and costs at most the window
   * once per run.
   */
  if (!(await confirmSurvived(server.child, 2_000))) {
    removeSignalCleanup();
    const how = describeExit(server.child);
    await server.stop();
    fail(
      `Next test server exited right after readiness (${how}) — ` +
        `port ${API_TEST_PORT} was probably taken by a process that is not this run's. ` +
        `Kill it and rerun: lsof -ti :${API_TEST_PORT} | xargs kill\n${logTail(SHARED_LOG_PATH)}`,
    );
  }

  /*
   * `pid: -1` is a sentinel, not a lie: `parseServerManifest` rejects any pid
   * below 1, so a worker that reads this document treats it as corrupt and
   * falls back to a server of its own instead of adopting a stranger. In
   * practice the child always has a pid by now — `waitForReady` throws when it
   * does not — but the manifest should never be the place that assumption is
   * left unchecked.
   */
  writeServerManifest({
    pid: server.child.pid ?? -1,
    port: API_TEST_PORT,
    logPath: SHARED_LOG_PATH,
    startedAt: new Date().toISOString(),
  });

  return async () => {
    removeSignalCleanup();
    await server.stop();
    removeServerManifest();
  };
}
