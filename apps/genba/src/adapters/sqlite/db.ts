import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createDb } from '@repo/sqlite-kit/create-db';
import type { BunSqliteDb } from '@repo/sqlite-kit/create-db';
import { migrations } from './migrations.js';
import { schema } from './schema.js';

export type GenbaDb = BunSqliteDb<typeof schema>;

export const openGenbaDb = (sqlitePath: string): GenbaDb => {
  mkdirSync(dirname(sqlitePath), { recursive: true });
  return createDb(sqlitePath, { schema, migrations });
};
