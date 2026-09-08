import { afterEach, describe, expect, it } from 'vitest';
import { closeDb, createDb, getDb, type DbHandle } from '../../../lib/db/client.js';

const globalWithDb = globalThis as typeof globalThis & {
  __pplFitnessDb?: DbHandle;
};

async function restoreEnvironment(
  runtimeUrl: string | undefined,
  migrationUrl: string | undefined,
): Promise<void> {
  await closeDb();
  if (runtimeUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = runtimeUrl;
  if (migrationUrl === undefined) delete process.env.MIGRATION_DATABASE_URL;
  else process.env.MIGRATION_DATABASE_URL = migrationUrl;
}

afterEach(async () => {
  await closeDb();
});

describe('runtime database client', () => {
  it('creates an isolated pool from the app connection string', async () => {
    const handle = createDb('postgresql://app_authenticated:test@127.0.0.1:54329/postgres');
    expect(handle.pool.options.connectionString).toContain('app_authenticated:test@127.0.0.1:54329');
    await handle.pool.end();
  });

  it('rejects an empty connection string before opening a pool', () => {
    expect(() => createDb('   ')).toThrow('DATABASE_URL is required');
  });

  it('uses DATABASE_URL and ignores MIGRATION_DATABASE_URL for the singleton', async () => {
    const originalRuntimeUrl = process.env.DATABASE_URL;
    const originalMigrationUrl = process.env.MIGRATION_DATABASE_URL;
    const runtimeUrl = 'postgresql://runtime-user:runtime-password@127.0.0.1:54329/postgres';
    const migrationUrl = 'postgresql://migration-user:migration-password@127.0.0.1:54322/postgres';

    await closeDb();
    process.env.DATABASE_URL = runtimeUrl;
    process.env.MIGRATION_DATABASE_URL = migrationUrl;

    try {
      getDb();
      expect(globalWithDb.__pplFitnessDb?.pool.options.connectionString).toBe(runtimeUrl);
    } finally {
      await restoreEnvironment(originalRuntimeUrl, originalMigrationUrl);
    }
  });

  it('fails when DATABASE_URL is missing instead of falling back to the migration URL', async () => {
    const originalRuntimeUrl = process.env.DATABASE_URL;
    const originalMigrationUrl = process.env.MIGRATION_DATABASE_URL;

    await closeDb();
    delete process.env.DATABASE_URL;
    process.env.MIGRATION_DATABASE_URL = 'postgresql://migration-user:password@127.0.0.1:54322/postgres';

    try {
      expect(() => getDb()).toThrow('DATABASE_URL is required');
    } finally {
      await restoreEnvironment(originalRuntimeUrl, originalMigrationUrl);
    }
  });
});
