import { createSystemClock } from '@repo/host/process/system-clock';
import { createEventBus } from '../../src/adapters/memory/event-bus.adapter.ts';
import { createTokenAuth } from '../../src/adapters/auth/token-auth.adapter.ts';
import { createSqliteStore } from '../../src/adapters/sqlite/store.ts';
import { createApp } from '../../src/app.ts';
import { createTransport } from '../../src/adapters/hono/transport.ts';
import type { Supervisor } from '../../src/application/cells/supervisor.ts';
import { createLineLoader } from '../../src/application/core/lines.ts';
import { STANDARD_LINE } from './standard-line.ts';

export const PORT = 7072;
export const CLI_TOKEN = 'cli-token';
export const CELL_TOKEN = 'cell-token';

const idleSupervisor: Supervisor = {
  recover: async () => undefined,
  scale: async () => undefined,
  reconcile: async () => undefined,
  status: () => ({ desired: 0, crashLoop: false, cells: [] }),
  cellOfToken: (token) => (token === CELL_TOKEN ? 'cell-1' : undefined),
  isStopping: () => false,
  setRunner: () => undefined,
  stopCellOfJob: async () => undefined,
  stopAll: async () => undefined,
};

type CallOptions = {
  token?: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

export const createTestApp = () => {
  const events = createEventBus();
  let ids = 0;
  const app = createApp(
    createTransport({
      store: createSqliteStore(':memory:'),
      clock: createSystemClock(),
      newId: (prefix) => `${prefix}-${(ids += 1)}`,
      publish: events.publish,
      lineOf: createLineLoader(() => STANDARD_LINE),
      supervisor: idleSupervisor,
      events,
      repoRoot: '/repo',
      shutdown: () => undefined,
      auth: createTokenAuth(CLI_TOKEN, idleSupervisor.cellOfToken),
    }),
    { port: PORT },
  );
  const call = async (
    method: 'GET' | 'POST',
    path: string,
    { token = CLI_TOKEN, body, headers, signal }: CallOptions = {},
  ): Promise<Response> =>
    app.request(`/api/v1${path}`, {
      method,
      signal,
      headers: {
        host: `127.0.0.1:${PORT}`,
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { call, events };
};
