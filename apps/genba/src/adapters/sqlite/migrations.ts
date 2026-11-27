import { embeddedMigrationsOf } from '@repo/sqlite-kit/embedded-migrations';
import init from './migrations/0001_init.sql' with { type: 'text' };
import schedulerState from './migrations/0002_scheduler_state.sql' with { type: 'text' };
import journal from './migrations/meta/_journal.json' with { type: 'json' };

export const migrations = embeddedMigrationsOf({
  journal,
  sqlByTag: { '0001_init': init, '0002_scheduler_state': schedulerState },
});
