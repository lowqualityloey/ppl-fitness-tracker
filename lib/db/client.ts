import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../../db/schema/index.js';
import type { Db } from './types.js';

export interface DbHandle {
  db: Db;
  pool: Pool;
}

type GlobalWithDb = typeof globalThis & {
  __pplFitnessDb?: DbHandle;
};

const globalWithDb = globalThis as GlobalWithDb;

/**
 * Create an isolated runtime database handle. Tests use this form so they can
 * close their pool explicitly; request-path code should use getDb().
 */
export function createDb(connectionString: string): DbHandle {
  if (!connectionString.trim()) {
    throw new Error('DATABASE_URL is required for the runtime database client.');
  }

  const pool = new Pool({ connectionString });
  return {
    pool,
    db: drizzle(pool, { schema }),
  };
}

/**
 * Lazily create one process-wide runtime pool from DATABASE_URL.
 * MIGRATION_DATABASE_URL is intentionally never consulted here.
 */
export function getDb(): Db {
  if (!globalWithDb.__pplFitnessDb) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is required for the runtime database client.');
    }
    globalWithDb.__pplFitnessDb = createDb(connectionString);
  }

  return globalWithDb.__pplFitnessDb.db;
}

/** Close the process-wide pool, primarily for tests and graceful shutdown. */
export async function closeDb(): Promise<void> {
  const handle = globalWithDb.__pplFitnessDb;
  if (!handle) return;

  globalWithDb.__pplFitnessDb = undefined;
  await handle.pool.end();
}
