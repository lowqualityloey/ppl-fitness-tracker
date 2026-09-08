import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../../db/schema/index.js';

export type Db = ReturnType<typeof drizzle<typeof schema>>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
