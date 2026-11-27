import type { BunSqliteDb, BunSqliteSchema, BunSqliteTx } from './create-db.ts';

export const immediateTx = <S extends BunSqliteSchema, T>(
  db: BunSqliteDb<S>,
  fn: (tx: BunSqliteTx<S>) => T,
): T => db.transaction(fn, { behavior: 'immediate' });
