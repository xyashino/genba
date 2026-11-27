import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Database } from 'bun:sqlite';
import { createDb } from '@repo/sqlite-kit/create-db';
import type { BunSqliteDb } from '@repo/sqlite-kit/create-db';
import { migrations } from './migrations.ts';
import { schema } from './schema.ts';

export type GenbaDb = BunSqliteDb<typeof schema> & { $client: Database };

export const openGenbaDb = (sqlitePath: string): GenbaDb => {
  mkdirSync(dirname(sqlitePath), { recursive: true });
  return createDb(sqlitePath, { schema, migrations }) as GenbaDb;
};
