import { randomBytes } from 'node:crypto';
import { createSystemClock } from '@repo/host/process/system-clock';
import { createEventBus } from './adapters/memory/event-bus.adapter.ts';
import { createSqliteStore } from './adapters/sqlite/store.ts';
import { createApp } from './app.ts';
import { createTransport } from './bootstrap/transport.ts';
import type { Supervisor } from './application/cells/supervisor.ts';
import { createLineLoader } from './application/core/lines.ts';
import { ID_BYTES } from './config.ts';

const EMBEDDED_PORT = 0;
export const EMBEDDED_URL = 'http://factory.embedded';

export type EmbeddedFactoryOptions = {
  /** the one Cell this process runs */
  cellId: string;
  /** a repo file by relative path, or undefined when it is missing */
  readRepo: (path: string) => string | undefined;
};

// The caller owns its only Cell, so there is nothing to spawn, stop, or respawn.
const noFleet: Supervisor = {
  recover: async () => undefined,
  scale: async () => undefined,
  reconcile: async () => undefined,
  status: () => ({ desired: 0, crashLoop: false, cells: [] }),
  cellOfToken: () => undefined,
  isStopping: () => false,
  setRunner: () => undefined,
  stopCellOfJob: async () => undefined,
  stopAll: async () => undefined,
};

/** The factory's HTTP API in this process: no socket, and nothing written to disk. */
export const createEmbeddedFactory = ({
  cellId,
  readRepo,
}: EmbeddedFactoryOptions) => {
  const store = createSqliteStore(':memory:');
  const events = createEventBus();
  const token = randomBytes(ID_BYTES).toString('hex');
  const cliToken = randomBytes(ID_BYTES).toString('hex');
  const app = createApp(
    createTransport({
      store,
      events,
      clock: createSystemClock(),
      newId: (prefix) => `${prefix}-${randomBytes(ID_BYTES).toString('hex')}`,
      publish: events.publish,
      lineOf: createLineLoader(readRepo),
      supervisor: noFleet,
      repoRoot: '',
      shutdown: () => undefined,
      auth: {
        verify: (bearer) => {
          if (bearer === cliToken) return { kind: 'cli' };
          return bearer === token ? { kind: 'cell', cellId } : null;
        },
      },
    }),
    { port: EMBEDDED_PORT },
  );
  return {
    cliToken,
    cellToken: token,
    fetch: async (url: string, init: RequestInit = {}): Promise<Response> => {
      const headers = new Headers(init.headers);
      headers.set('host', `127.0.0.1:${EMBEDDED_PORT}`);
      return app.request(url, { ...init, headers });
    },
    order: (slug: string) => store.findOrder(slug),
    jobsOf: (orderId: string) => store.jobsOf(orderId),
    close: () => store.close(),
  };
};
