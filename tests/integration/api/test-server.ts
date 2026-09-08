import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const port = Number(process.env.M1_16_API_TEST_PORT ?? '3101');
export const apiOrigin = `http://127.0.0.1:${port}`;

let server: ChildProcess | undefined;

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
      stdio: ['ignore', 'ignore', 'pipe'],
    },
  );
  server = child;

  const stderr: string[] = [];
  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', (chunk: string) => stderr.push(chunk));

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
      const response = await fetch(`${apiOrigin}/`);
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
