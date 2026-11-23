/**
 * Hosted app-role rotation guard.
 *
 * Migration `0001_app_authenticated_role_trigger.sql` contains a deliberately
 * public password so local Supabase and CI can create a deterministic role.
 * That password must never reach a hosted database: a hosted deployment has to
 * rotate `app_authenticated` after applying the migration.
 *
 * This guard is intentionally not part of the local preflight. Local
 * `DATABASE_URL` values point at 127.0.0.1 and are expected to carry the
 * fixture; a production deployment runs this with its real `DATABASE_URL`
 * before the app is released. It compares the decoded URL password with the
 * migration literal and prints neither value.
 *
 * Usage:
 *   DATABASE_URL=... npm run security:hosted-rotation
 *
 * Exit codes: 0 = loopback fixture or rotated hosted password, 1 = hosted URL
 * still carries the public fixture, 2 = missing or malformed input.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export type HostedRotationStatus =
  | 'missing-url'
  | 'missing-fixture'
  | 'invalid-url'
  | 'missing-password'
  | 'local'
  | 'fixture'
  | 'rotated';

export interface HostedRotationResult {
  status: HostedRotationStatus;
}

const MIGRATION_PATH = new URL(
  '../supabase/migrations/0001_app_authenticated_role_trigger.sql',
  import.meta.url,
);
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]', '0.0.0.0']);

export function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

/**
 * Classify a `DATABASE_URL` against the migration fixture.
 *
 * A non-loopback host with the fixture password is the only failure. A
 * different password is the expected hosted state. No password is returned or
 * logged by this function.
 */
export function checkHostedRotation(
  connectionString: string | undefined,
  fixturePassword: string | undefined,
): HostedRotationResult {
  if (!connectionString) return { status: 'missing-url' };
  if (!fixturePassword) return { status: 'missing-fixture' };

  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    return { status: 'invalid-url' };
  }
  if (url.password === '') return { status: 'missing-password' };
  if (isLoopbackHost(url.hostname)) return { status: 'local' };

  let password: string;
  try {
    password = decodeURIComponent(url.password);
  } catch {
    return { status: 'invalid-url' };
  }

  return { status: password === fixturePassword ? 'fixture' : 'rotated' };
}

export function migrationFixturePassword(): string | undefined {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  return /PASSWORD '([^']+)'/.exec(sql)?.[1];
}

function main(): number {
  const result = checkHostedRotation(process.env.DATABASE_URL, migrationFixturePassword());

  console.log('Hosted app-role rotation guard');
  switch (result.status) {
    case 'local':
      console.log('  SKIP  DATABASE_URL is loopback; the public local/CI fixture is expected.');
      return 0;
    case 'rotated':
      console.log('  ok    hosted DATABASE_URL password differs from the migration 0001 fixture.');
      return 0;
    case 'fixture':
      console.error(
        '  FAIL  hosted DATABASE_URL still uses the public migration 0001 password. ' +
          'Rotate app_authenticated before deploying. No secret was printed.',
      );
      return 1;
    case 'missing-url':
      console.error('  FAIL  DATABASE_URL is required (for example: DATABASE_URL=... npm run security:hosted-rotation).');
      return 2;
    case 'missing-fixture':
      console.error('  FAIL  migration 0001 has no PASSWORD literal to compare against.');
      return 2;
    case 'invalid-url':
      console.error('  FAIL  DATABASE_URL is not a valid connection URL.');
      return 2;
    case 'missing-password':
      console.error('  FAIL  DATABASE_URL carries no password segment.');
      return 2;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
