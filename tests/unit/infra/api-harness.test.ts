import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  API_TEST_PORT,
  answersReadiness,
  apiOrigin,
  assertSupportedPlatform,
  confirmSurvived,
  describeExit,
  fileSize,
  isProcessAlive,
  logTail,
  parseServerManifest,
  pruneStaleOwnedLogs,
  readPort,
  removeServerManifest,
  resolveSpawnEnv,
  signalApiServer,
  stopChild,
  truncateFile,
  waitForReady,
  writeServerManifest,
} from '../../../tests/integration/api/server-process.js';
import { isServerLogEntry } from '../../../tests/integration/api/test-server.js';

/**
 * Unit coverage for the API-suite harness's pure decisions.
 *
 * Every case here corresponds to a finding in
 * `docs/reviews/2026-11-19-api-suite-shared-server.md`. The ones that cannot be
 * exercised without spawning a real server (AC-1, AC-7) stay in the integration
 * lane; these are the ones that used to be reachable only by running the whole
 * suite and reading a confusing failure.
 */

const scratch = mkdtempSync(join(tmpdir(), 'api-harness-'));

describe('readPort (S8)', () => {
  it('defaults to 3101 when unset or empty', () => {
    expect(readPort(undefined)).toBe(3101);
    expect(readPort('')).toBe(3101);
  });

  it('accepts a valid port', () => {
    expect(readPort('3102')).toBe(3102);
  });

  it('throws on a value Number() would turn into NaN', () => {
    // Measured before the fix: this reached the child as `--port NaN`.
    expect(() => readPort('abc')).toThrow(/M1_16_API_TEST_PORT must be an integer/);
    expect(() => readPort('3101.5')).toThrow(/must be an integer/);
    expect(() => readPort('0')).toThrow(/must be an integer/);
    expect(() => readPort('70000')).toThrow(/must be an integer/);
  });

  it('exposes a validated module constant', () => {
    expect(Number.isInteger(API_TEST_PORT)).toBe(true);
    expect(API_TEST_PORT).toBeGreaterThan(0);
  });
});

describe('parseServerManifest (S3)', () => {
  const valid = { pid: 4321, port: 3101, logPath: 'test-results/api-server.log', startedAt: 'x' };

  it('accepts a well-formed manifest', () => {
    expect(parseServerManifest(JSON.stringify(valid))).toEqual(valid);
  });

  it('rejects pid 0, which process.kill(0, 0) reports as alive', () => {
    // The reason this check exists: kill(0, 0) targets the caller's process
    // group and succeeds, so a corrupt manifest used to read as a live server.
    expect(() => process.kill(0, 0)).not.toThrow();
    expect(parseServerManifest(JSON.stringify({ ...valid, pid: 0 }))).toBeNull();
  });

  it('rejects negative, fractional, and non-numeric pids', () => {
    expect(parseServerManifest(JSON.stringify({ ...valid, pid: -1 }))).toBeNull();
    expect(parseServerManifest(JSON.stringify({ ...valid, pid: 1.5 }))).toBeNull();
    expect(parseServerManifest(JSON.stringify({ ...valid, pid: '4321' }))).toBeNull();
  });

  it('rejects an out-of-range or missing port', () => {
    expect(parseServerManifest(JSON.stringify({ ...valid, port: 0 }))).toBeNull();
    expect(parseServerManifest(JSON.stringify({ ...valid, port: 70_000 }))).toBeNull();
    expect(parseServerManifest(JSON.stringify({ ...valid, port: undefined }))).toBeNull();
  });

  it('rejects malformed JSON and non-objects instead of throwing', () => {
    expect(parseServerManifest('not json')).toBeNull();
    expect(parseServerManifest('null')).toBeNull();
    expect(parseServerManifest('[]')).toBeNull();
  });
});

describe('writeServerManifest (S7)', () => {
  it('leaves no .tmp behind and is readable through the public reader', () => {
    const manifest = { pid: 1234, port: 3101, logPath: 'x.log', startedAt: 'now' };
    writeServerManifest(manifest);
    expect(existsSync('test-results/api-server.json.tmp')).toBe(false);
    expect(JSON.parse(readFileSync('test-results/api-server.json', 'utf8'))).toEqual(manifest);
    removeServerManifest();
    expect(existsSync('test-results/api-server.json')).toBe(false);
    expect(existsSync('test-results/api-server.json.tmp')).toBe(false);
  });
});

describe('fileSize (S9)', () => {
  it('returns 0 for a file that does not exist', () => {
    expect(fileSize(join(scratch, 'absent.log'))).toBe(0);
  });

  it('returns the real size for a file that exists', () => {
    const path = join(scratch, 'present.log');
    writeFileSync(path, 'hello');
    expect(fileSize(path)).toBe(5);
  });

  it('rethrows a non-ENOENT error instead of reporting an empty log', () => {
    // A path *under* a regular file yields ENOTDIR. That used to be swallowed
    // into 0, which read as "the log is empty" and sent the reader looking for
    // a missing log line instead of a broken path.
    const blocker = join(scratch, 'not-a-directory');
    writeFileSync(blocker, '');
    expect(() => fileSize(join(blocker, 'child.log'))).toThrow(/ENOTDIR/);
  });
});

describe('isProcessAlive', () => {
  it('reports this process alive and a non-positive pid dead', () => {
    expect(isProcessAlive(process.pid)).toBe(true);
    expect(isProcessAlive(0)).toBe(false);
    expect(isProcessAlive(-1)).toBe(false);
    expect(isProcessAlive(1.5)).toBe(false);
  });
});

describe('logTail', () => {
  it('returns the last N lines and a marker when the file is absent', () => {
    const path = join(scratch, 'tail.log');
    writeFileSync(path, ['a', 'b', 'c', 'd'].join('\n'));
    expect(logTail(path, 2)).toBe('c\nd');
    expect(logTail(join(scratch, 'nope.log'))).toMatch(/<no log at /);
  });

  it('reports an empty file distinctly from a missing one', () => {
    const path = join(scratch, 'empty.log');
    writeFileSync(path, '');
    expect(logTail(path)).toBe('<log is empty>');
  });
});

describe('truncateFile', () => {
  it('creates or empties a file', () => {
    const path = join(scratch, 'trunc.log');
    writeFileSync(path, 'stale');
    truncateFile(path);
    expect(fileSize(path)).toBe(0);
  });
});

describe('pruneStaleOwnedLogs (S2)', () => {
  it('removes an owned log whose pid is dead and keeps one whose pid is alive', () => {
    // pid 2^22 is above the default pid_max and cannot be a live process.
    const dead = 'test-results/api-server-owned-4194304.log';
    const alive = `test-results/api-server-owned-${process.pid}.log`;
    writeFileSync(dead, 'gone');
    writeFileSync(alive, 'live');
    pruneStaleOwnedLogs();
    expect(existsSync(dead)).toBe(false);
    expect(existsSync(alive)).toBe(true);
    rmSync(alive, { force: true });
  });
});

describe('assertSupportedPlatform (S4)', () => {
  it('rejects win32 with a message naming the reason', () => {
    expect(() => assertSupportedPlatform('win32')).toThrow(/Linux and macOS only/);
  });

  it('accepts linux and darwin', () => {
    expect(() => assertSupportedPlatform('linux')).not.toThrow();
    expect(() => assertSupportedPlatform('darwin')).not.toThrow();
  });
});

describe('stopChild (S1)', () => {
  it('resolves once the child is gone, not on a timer', async () => {
    const child = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' });
    await new Promise<void>((resolve) => child.once('spawn', () => resolve()));
    const started = Date.now();
    await stopChild(child);
    expect(Date.now() - started).toBeLessThan(4_000);
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
  });

  it('is a no-op for a child that already exited', async () => {
    const child = spawn('true', [], { detached: true, stdio: 'ignore' });
    await new Promise<void>((resolve) => child.once('exit', () => resolve()));
    const started = Date.now();
    await stopChild(child);
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('describes a signal death rather than a null code', async () => {
    const child = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' });
    await new Promise<void>((resolve) => child.once('spawn', () => resolve()));
    signalApiServer(child, 'SIGKILL');
    await new Promise<void>((resolve) => child.once('exit', () => resolve()));
    expect(describeExit(child)).toBe('signal SIGKILL');
  });
});

describe('confirmSurvived (S12)', () => {
  it('returns false as soon as the child dies', async () => {
    const child = spawn('sleep', ['0.2'], { detached: true, stdio: 'ignore' });
    await new Promise<void>((resolve) => child.once('spawn', () => resolve()));
    const started = Date.now();
    await expect(confirmSurvived(child, 5_000, 25)).resolves.toBe(false);
    expect(Date.now() - started).toBeLessThan(3_000);
  });

  it('returns true when the child outlives the window', async () => {
    const child = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' });
    await new Promise<void>((resolve) => child.once('spawn', () => resolve()));
    await expect(confirmSurvived(child, 200, 25)).resolves.toBe(true);
    await stopChild(child);
  });
});

describe('waitForReady (S5)', () => {
  it('names the spawn error when the binary does not exist', async () => {
    // Before the fix this reported `last client error: TypeError: fetch failed`
    // after the full 30 s budget, because a failed spawn leaves exitCode null
    // and the old exit branch only tested exitCode.
    const child = spawn('definitely-not-a-real-binary-xyz', [], { stdio: 'ignore' });
    const started = Date.now();
    // Either branch is acceptable - which one wins depends on whether the spawn
    // error lands before the first tick - but the message must name the spawn
    // failure, and it must arrive well inside the budget rather than as a probe
    // timeout after the full 30 s.
    const error = await waitForReady(
      'http://127.0.0.1:1',
      child,
      join(scratch, 'none.log'),
      10_000,
    ).then(
      () => null,
      (thrown: unknown) => thrown,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/ENOENT/);
    expect((error as Error).message).not.toMatch(/did not become ready/);
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it('names an early exit instead of waiting out the budget', async () => {
    const child = spawn('false', [], { stdio: 'ignore' });
    const started = Date.now();
    await expect(
      waitForReady('http://127.0.0.1:1', child, join(scratch, 'none.log'), 10_000),
    ).rejects.toThrow(/exited before readiness/);
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});

describe('answersReadiness', () => {
  it('answers false when nothing is listening', async () => {
    // Port 1 is reserved and never has a dev server on it.
    await expect(answersReadiness('http://127.0.0.1:1', 500)).resolves.toBe(false);
  });
});

describe('resolveSpawnEnv (S5, credential policy)', () => {
  const base = { PATH: '/usr/bin', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-from-env' };

  it('returns only the overrides, defaulting the two addresses', () => {
    const env = resolveSpawnEnv(base);
    // A partial map: the caller merges it over process.env, so PATH must NOT be
    // copied here - otherwise this helper would start deciding names it does not own.
    expect(Object.keys(env).sort()).toEqual([
      'NEXT_PUBLIC_APP_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'NEXT_PUBLIC_SUPABASE_URL',
    ]);
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe('anon-from-env');
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
    expect(env.NEXT_PUBLIC_APP_URL).toBe(apiOrigin);
  });

  it('keeps an explicit URL and app origin instead of the defaults', () => {
    const env = resolveSpawnEnv({
      ...base,
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:9999',
      NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:8888',
    });
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:9999');
    expect(env.NEXT_PUBLIC_APP_URL).toBe('http://127.0.0.1:8888');
  });

  it('throws when the anon key is absent, naming the variable', () => {
    // The regression this guards: a substituted key meant the child exited 1 on
    // its own env assertion and the run reported a readiness failure instead.
    expect(() => resolveSpawnEnv({ PATH: '/usr/bin' })).toThrow(
      /NEXT_PUBLIC_SUPABASE_ANON_KEY must be set/,
    );
  });

  it('treats an empty string as absent', () => {
    expect(() => resolveSpawnEnv({ ...base, NEXT_PUBLIC_SUPABASE_ANON_KEY: '' })).toThrow(
      /must be set/,
    );
  });

  it('never invents a key value', () => {
    // A future "just default it" edit is the exact mistake this suite exists to
    // catch, so assert the failure rather than only the message.
    expect(() => resolveSpawnEnv({})).toThrow();
    expect(resolveSpawnEnv(base).NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe('anon-from-env');
  });
});

describe('isServerLogEntry (S10)', () => {
  it('accepts an entry with the three envelope keys and a string msg', () => {
    expect(
      isServerLogEntry({ time: 't', level: 'info', msg: 'hello', request_id: null }),
    ).toBe(true);
  });

  it('rejects an entry whose msg is missing or not a string', () => {
    expect(isServerLogEntry({ level: 'info', request_id: null })).toBe(false);
    expect(isServerLogEntry({ level: 'info', msg: 42, request_id: null })).toBe(false);
    expect(isServerLogEntry({ msg: 'hello', request_id: null })).toBe(false);
  });

  it('rejects non-objects', () => {
    expect(isServerLogEntry(null)).toBe(false);
    expect(isServerLogEntry('{}')).toBe(false);
    expect(isServerLogEntry([])).toBe(false);
  });
});
