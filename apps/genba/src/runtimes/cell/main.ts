import { createLoopbackApi } from '@repo/cell/adapters/http/loopback-api';
import {
  CELL_TOKEN_ENV,
  DAEMON_URL_ENV,
  REPO_ROOT_ENV,
} from '@repo/line/runtime-paths';
import { cellDepsOf } from './deps.ts';
import { runCellLoop } from './loop.ts';

/** `genba __cell <id>`: a disposable worker with one job and one worktree at a time. */
export const runCell = async (cellId: string): Promise<number> => {
  const url = process.env[DAEMON_URL_ENV];
  const token = process.env[CELL_TOKEN_ENV];
  const repoRoot = process.env[REPO_ROOT_ENV];
  if (!url || !token || !repoRoot) {
    console.error('genba __cell is started by the daemon only');
    return 1;
  }
  const api = createLoopbackApi({ url, token });
  const stop = new AbortController();
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => stop.abort());
  }
  await runCellLoop(
    cellDepsOf({
      cellId,
      repoRoot,
      api,
      signal: stop.signal,
      trackRunner: async (runner) => {
        await api.request('POST', '/cells/runner', { runner });
      },
      log: (line) => console.log(`${new Date().toISOString()} ${line}`),
    }),
  );
  return 0;
};
