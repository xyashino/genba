import { createForgeRouter } from '../../adapters/forge/router.ts';
import { createNodeFs } from '../../adapters/fs/node-fs.ts';
import { createGitAdapter } from '../../adapters/git/git.ts';
import { createLoopbackApi } from '../../adapters/http/loopback-api.ts';
import { createLoopbackEndpoint } from '../../adapters/operator-endpoint/loopback.ts';
import { selfCommand } from '../../adapters/process/self.ts';
import { createProcessAdapter } from '../../adapters/process/spawn.ts';
import { createSystemClock } from '../../adapters/process/system-clock.ts';
import { createRunnerCatalog } from '../../adapters/runners/catalog.ts';
import { createHeadlessRunner } from '../../adapters/runners/headless.ts';
import {
  CELL_TOKEN_ENV,
  DAEMON_URL_ENV,
  REPO_ROOT_ENV,
} from '../../domain/runtime-paths.ts';
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
  const processes = createProcessAdapter();
  const git = createGitAdapter(processes);
  const api = createLoopbackApi({ url, token });
  const stop = new AbortController();
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => stop.abort());
  }
  await runCellLoop({
    cellId,
    repoRoot,
    api,
    git,
    selfCommand: selfCommand(),
    fs: createNodeFs(),
    clock: createSystemClock(),
    runner: createHeadlessRunner(),
    catalog: createRunnerCatalog(),
    operator: createLoopbackEndpoint(),
    forgeOf: (manifest) =>
      createForgeRouter({
        process: processes,
        git,
        config: {
          provider: manifest.git.provider,
          host: manifest.git.host,
        },
      }),
    trackRunner: async (runner) => {
      await api.request('POST', '/cells/runner', { runner });
    },
    signal: stop.signal,
    log: (line) => console.log(`${new Date().toISOString()} ${line}`),
  });
  return 0;
};
