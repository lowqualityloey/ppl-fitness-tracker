import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resetAndSeed } from '../src/setup-db.js';

const FIXTURES = new URL('../.tmp/fixtures.json', import.meta.url);

export default async function setup() {
  // sql/001-setup.sql is idempotent by design, which means it also *repairs* a
  // deliberately broken control. scripts/mutation-check.ts needs the schema
  // left exactly as it found it, so it sets SKIP_DB_SETUP=1. Without this, the
  // mutation check would silently heal every mutation before asserting on it —
  // which is how it behaved on the first run.
  if (process.env.SKIP_DB_SETUP === '1' && existsSync(FIXTURES)) return;

  const fixtures = await resetAndSeed();
  await mkdir(new URL('../.tmp/', import.meta.url), { recursive: true });
  await writeFile(FIXTURES, JSON.stringify(fixtures, null, 2));
}
