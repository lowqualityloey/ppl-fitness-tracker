import { readFileSync } from 'node:fs';
import type { Fixtures } from '../src/setup-db.js';

export const fixtures: Fixtures = JSON.parse(
  readFileSync(new URL('../.tmp/fixtures.json', import.meta.url), 'utf8'),
) as Fixtures;

export const { userA, userB } = fixtures;
