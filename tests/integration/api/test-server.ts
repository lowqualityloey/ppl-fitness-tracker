import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const port = Number(process.env.M1_16_API_TEST_PORT ?? '3101');
export const apiOrigin = `http://127.0.0.1:${port}`;

let server: ChildProcess | undefined;

/**
 * M4-05 (#94): the app's structured trail, read where it actually lands.
 *
 * `consoleSink` splits streams by severity — `info`/`debug` on stdout,
 * `warn`/`error` on stderr — so a spec that only watched one would be
 * blind to half the trail it is asserting on. Both are absorbed here and
 * rejoined by request id, which is the whole point of the id.
 *
 * Lines are filtered by shape (`level` + `request_id` keys), not by a
 * marker: `next dev` writes its own prose to the same pipes, and a JSON
 * entry from the seam is the only structured thing in the stream. The
 * filter is deliberately `in`-based on the two envelope keys every entry
 * carries, so a malformed seam line surfaces as a failed predicate rather
 * than as a silently dropped one.
 */
export interface ServerLogEntry {
  time: string;
  level: string;
  msg: string;
  request_id: string | null;
  [field: string]: unknown;
}

const capturedLogs: ServerLogEntry[] = [];
const partialLines: Map<'stdout' | 'stderr', string> = new Map();

function absorbChunk(stream: 'stdout' | 'stderr', chunk: string): void {
  let buffer = (partialLines.get(stream) ?? '') + chunk;
  let newlineAt = buffer.indexOf('\n');
  while (newlineAt >= 0) {
    const line = buffer.slice(0, newlineAt).trim();
    buffer = buffer.slice(newlineAt + 1);
    newlineAt = buffer.indexOf('\n');
    if (!line.startsWith('{')) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        'level' in parsed &&
        'request_id' in parsed
      ) {
        capturedLogs.push(parsed as ServerLogEntry);
      }
    } catch {
      // `next dev`'s own stdout is prose that can start with `{` (webpack
      // digests). It is not the seam's line, and the seam either writes
      // whole lines or is the bug under test.
    }
  }
  partialLines.set(stream, buffer);
}

/** Every structured line captured from the running server, in arrival order. */
export function serverLogEntries(): readonly ServerLogEntry[] {
  return capturedLogs;
}

/**
 * Polls the captured trail until a matching entry exists. The write happens
 * in the server child and crosses a pipe, so "the response has arrived" does
 * not imply "the line has arrived" — the wait is what keeps the spec from
 * racing its own assertion. On timeout the failure names the predicates'
 * neighbourhood (captured msgs) rather than nothing, because "found none"
 * with no context is the worst possible debugging output.
 */
export async function waitForLogEntry(
  predicate: (entry: ServerLogEntry) => boolean,
  timeoutMs = 5_000,
): Promise<ServerLogEntry> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
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

function signalApiServer(child: ChildProcess, signal: NodeJS.Signals): void {
  if (process.platform !== 'win32' && child.pid !== undefined) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // Fall through when the process group has already exited.
    }
  }
  child.kill(signal);
}

export async function startApiServer(): Promise<void> {
  if (server) return;

  const child = spawn(
    'npx',
    ['--no-install', 'next', 'dev', '--port', String(port)],
    {
      cwd: process.cwd(),
      detached: true,
      env: {
        ...process.env,
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? apiOrigin,
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  server = child;

  const stderr: string[] = [];
  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', (chunk: string) => {
    stderr.push(chunk);
    absorbChunk('stderr', chunk);
  });
  child.stdout?.setEncoding('utf8');
  child.stdout?.on('data', (chunk: string) => absorbChunk('stdout', chunk));

  let lastError: unknown;
  child.once('error', (error) => {
    lastError = error;
  });

  const describeFailure = (): string => stderr.join('').trim() || String(lastError);
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      server = undefined;
      throw new Error(`Next test server exited before readiness: ${describeFailure()}`);
    }

    try {
      // Probed path: an unmatched route whose 404 the app router itself produces,
      // rather than `/`.
      //
      // What is established: a readiness probe must not be a request through a
      // product screen. `/` is now the dashboard (M3-04, #61), so probing it means
      // the harness's notion of "up" depends on that route compiling and, for a
      // signed-in visitor, on Supabase auth and three database queries. Any future
      // work on `/` then changes what "ready" means, and a 500 from a hiccup reads as
      // "the server never started".
      //
      // What is **not** established, and was measured rather than assumed: this is
      // not a speed fix, at least not on a warm cache. Measured here with `.next`
      // already populated — production server: probe 166 ms, `/` 162 ms (unauthenticated
      // `/` answers 307 to sign-in and never reaches the queries). Dev server, first
      // request after boot: probe **3115 ms**, `/` **1827 ms**; second request 70 ms and
      // 87 ms. The probe is the *slower* one cold, because it compiles the not-found
      // route instead. So the case for it is the dependency, not the latency, and the
      // CI failure this followed (`Hook timed out in 10000ms` in `prefill.test.ts`) is
      // attributed to the budget below — which was genuinely unreachable — rather than
      // to a proven cost in `/`. A cold CI checkout, where the dashboard's route graph
      // has to compile from nothing, remains the untested suspect.
      //
      // `status < 500` stays the contract: a 500 means the router is up but broken.
      const response = await fetch(`${apiOrigin}/__readiness-probe__`);
      if (response.status < 500) return;
    } catch (error) {
      lastError = error;
    }

    await delay(100);
  }

  server = undefined;
  signalApiServer(child, 'SIGKILL');
  throw new Error(`Next test server did not become ready: ${describeFailure()}`);
}

export async function stopApiServer(): Promise<void> {
  const activeServer = server;
  server = undefined;
  if (!activeServer || activeServer.exitCode !== null) return;

  signalApiServer(activeServer, 'SIGTERM');
  await new Promise<void>((resolve) => {
    const finish = (): void => {
      clearTimeout(timeout);
      resolve();
    };
    const timeout = setTimeout(() => {
      signalApiServer(activeServer, 'SIGKILL');
      finish();
    }, 5_000);

    activeServer.once('exit', finish);
  });
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
