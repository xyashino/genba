import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { createNodeFs } from '@repo/host/fs/node-fs';
import { createFileLock } from '@repo/host/fs/lock';
import { createPidFile } from '@repo/host/fs/pid-file';
import { createProcessAdapter } from '@repo/host/process/spawn';
import { createSystemClock } from '@repo/host/process/system-clock';
import { createHerdrWorkspaces } from '@repo/host/herdr-workspaces';
import { createSqliteStore } from './adapters/sqlite/store.ts';
import {
  CLI_TOKEN_FILE,
  DATA_DIR,
  DB_FILE,
  PORT_ENV,
  daemonUrlOf,
  portOf,
} from '@repo/line/runtime-paths';
import type { FactoryContext } from './application/core/context.ts';
import { createCellHomes } from './application/cells/cell-homes.ts';
import { createLineLoader } from './application/core/lines.ts';
import { createEventBus } from './adapters/memory/event-bus.adapter.ts';
import { createTokenAuth } from './adapters/auth/token-auth.adapter.ts';
import { createApp } from './app.ts';
import { createTransport } from './adapters/hono/transport.ts';
import {
  ID_BYTES,
  MAX_BODY_BYTES,
  RECONCILE_MS,
  TOKEN_BYTES,
} from './config.ts';
import { createSupervisor } from './application/cells/supervisor.ts';

const newToken = (): string => randomBytes(TOKEN_BYTES).toString('hex');

export type FactoryOptions = {
  repoRoot: string;
  /** the argv prefix that starts the host binary again */
  selfCommand: readonly string[];
  /** the host binary's verb that runs a Cell */
  cellVerb: string;
};

/** The one writer of the repo's queue; resolves once the factory shuts down. */
export const startFactory = async ({
  repoRoot,
  selfCommand,
  cellVerb,
}: FactoryOptions): Promise<number> => {
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
  const context: FactoryContext = {
    store: createSqliteStore(join(dataDir, DB_FILE)),
    clock: createSystemClock(),
    newId: (prefix) => `${prefix}-${randomBytes(ID_BYTES).toString('hex')}`,
    publish: events.publish,
    lineOf: createLineLoader((path) => {
      const full = join(root, path);
      return existsSync(full) ? readFileSync(full, 'utf8') : undefined;
    }),
  };
  const cliToken = newToken();
  const supervisor = createSupervisor({
    homes: createCellHomes({
      fs,
      repoRoot: root,
      selfCommand,
      now: () => new Date().toISOString(),
      warn: (message) => console.error(message),
      workspaces: createHerdrWorkspaces({
        process: processes,
        fs,
        lock: createFileLock('herdr.lock'),
        dataDir,
      }),
    }),
    context,
    process: processes,
    fs,
    repoRoot: root,
    dataDir,
    daemonUrl: daemonUrlOf(port),
    cellCommand: [...selfCommand, cellVerb],
    newToken,
  });
  const stopped = Promise.withResolvers<void>();
  const app = createApp(
    createTransport({
      ...context,
      supervisor,
      events,
      repoRoot: root,
      shutdown: () => stopped.resolve(),
      auth: createTokenAuth(cliToken, supervisor.cellOfToken),
    }),
    { port },
  );
  let server: ReturnType<typeof Bun.serve>;
  try {
    // Bind before touching anything a running daemon might own.
    server = Bun.serve({
      hostname: '127.0.0.1',
      port,
      maxRequestBodySize: MAX_BODY_BYTES,
      // An SSE client stays open far longer than the default idle limit.
      idleTimeout: 0,
      fetch: app.fetch,
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
