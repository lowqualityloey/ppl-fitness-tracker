import {
  API_TEST_PORT,
  answersReadiness,
  apiOrigin,
  assertTrackedTsconfigUnchanged,
  confirmSurvived,
  describeExit,
  installSignalCleanup,
  logTail,
  pruneStaleOwnedLogs,
  readServerManifest,
  readTrackedTsconfig,
  removeServerManifest,
  SHARED_LOG_PATH,
  spawnNextDev,
  truncateFile,
  waitForReady,
  writeServerManifest,
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

  /*
   * D6 guard: Next.js rewrites `tsconfig.json` in place when it wants entries
   * the checked-in file does not have. Those entries are committed now, so the
   * check below asserts the boot did not write the file. The snapshot is taken
   * before the spawn because Next writes during startup, and it is compared the
   * moment readiness answers: a rewrite is a setup failure in seconds, not a
   * teardown failure after the whole suite has already run against the new file.
   */
  const tsconfigBefore = readTrackedTsconfig();

  truncateFile(SHARED_LOG_PATH);
  const server = await spawnNextDev({ port: API_TEST_PORT, logPath: SHARED_LOG_PATH });
  const removeSignalCleanup = installSignalCleanup(server, { clearManifest: true });
  try {
    await waitForReady(apiOrigin, server.child, SHARED_LOG_PATH, 30_000);
    assertTrackedTsconfigUnchanged(tsconfigBefore, readTrackedTsconfig());
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
