import { randomBytes } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { createNodeFs } from '../../adapters/fs/node-fs.ts';
import { createPidFile } from '../../adapters/fs/pid-file.ts';
import { selfCommand } from '../../adapters/process/self.ts';
import { createProcessAdapter } from '../../adapters/process/spawn.ts';
import { createSystemClock } from '../../adapters/process/system-clock.ts';
import { createSqliteStore } from '../../adapters/sqlite/store.ts';
import {
  CLI_TOKEN_FILE,
  DATA_DIR,
  DB_FILE,
  PORT_ENV,
  daemonUrlOf,
  portOf,
} from '../../domain/runtime-paths.ts';
import type { DaemonContext } from './core/context.ts';
import { createEventBus } from './events.ts';
import { createDaemonServer } from './server.ts';
import { createSupervisor } from './supervisor.ts';

const RECONCILE_MS = 500;
const TOKEN_BYTES = 24;

const newToken = (): string => randomBytes(TOKEN_BYTES).toString('hex');

/** `genba __daemon`: the one writer of the repo's queue. */
export const runDaemon = async (repoRoot: string): Promise<number> => {
  const root = realpathSync(repoRoot);
  const dataDir = join(root, DATA_DIR);
  const port = portOf(process.env[PORT_ENV]);
  const fs = createNodeFs();
  const processes = createProcessAdapter();
  const pidFile = createPidFile();
  if (!(await pidFile.acquire(dataDir, process.pid))) {
    console.error('a genba daemon already serves this repo');
    return 1;
  }
  const events = createEventBus();
  const context: DaemonContext = {
    store: createSqliteStore(join(dataDir, DB_FILE)),
    clock: createSystemClock(),
    newId: (prefix) => `${prefix}-${randomBytes(4).toString('hex')}`,
    publish: events.publish,
  };
  const cliToken = newToken();
  const supervisor = createSupervisor({
    context,
    process: processes,
    fs,
    repoRoot: root,
    dataDir,
    daemonUrl: daemonUrlOf(port),
    selfCommand: selfCommand(),
    newToken,
  });
  const stopped = Promise.withResolvers<void>();
  let server: ReturnType<typeof createDaemonServer>;
  try {
    // Bind before touching anything a running daemon might own.
    server = createDaemonServer({
      context,
      supervisor,
      events,
      port,
      repoRoot: root,
      cliToken,
      shutdown: () => stopped.resolve(),
    });
  } catch (error) {
    console.error(`cannot listen on 127.0.0.1:${port}: ${String(error)}`);
    context.store.close();
    await pidFile.remove(dataDir);
    return 1;
  }
  await supervisor.recover();
  await fs.writeText(join(dataDir, CLI_TOKEN_FILE), cliToken, 0o600);
  const timer = setInterval(() => {
    supervisor.reconcile().catch((error: unknown) => console.error(error));
  }, RECONCILE_MS);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void supervisor.stopAll().finally(() => stopped.resolve());
    });
  }
  console.log(`genba daemon on ${daemonUrlOf(port)} for ${root}`);
  await stopped.promise;
  clearInterval(timer);
  await server.stop(true);
  context.store.close();
  await fs.remove(join(dataDir, CLI_TOKEN_FILE));
  await pidFile.remove(dataDir);
  return 0;
};
