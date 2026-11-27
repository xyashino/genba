import { join } from 'node:path';
import { createForgeRouter } from '../../adapters/forge/router.ts';
import { createFileLock } from '../../adapters/fs/lock.ts';
import { createNodeFs } from '../../adapters/fs/node-fs.ts';
import { createGitAdapter } from '../../adapters/git/git.ts';
import { createLoopbackEndpoint } from '../../adapters/operator-endpoint/loopback.ts';
import { selfCommand } from '../../adapters/process/self.ts';
import { createProcessAdapter } from '../../adapters/process/spawn.ts';
import { createSystemClock } from '../../adapters/process/system-clock.ts';
import { createRunnerCatalog } from '../../adapters/runners/catalog.ts';
import { createHeadlessRunner } from '../../adapters/runners/headless.ts';
import { createHerdrRunner } from '../../adapters/runners/herdr.ts';
import { createHerdrWorkspaces } from '../../adapters/runners/herdr-workspaces.ts';
import { createRoutingRunner } from '../../adapters/runners/routing.ts';
import { DATA_DIR } from '../../domain/runtime-paths.ts';
import type { LoopDeps } from './loop.ts';

export type CellWiring = Pick<
  LoopDeps,
  'cellId' | 'repoRoot' | 'api' | 'signal' | 'trackRunner' | 'log'
>;

/** The real adapters of a Cell, whoever answers its API. */
export const cellDepsOf = (wiring: CellWiring): LoopDeps => {
  const processes = createProcessAdapter();
  const git = createGitAdapter(processes);
  return {
    ...wiring,
    git,
    rootLock: createFileLock('changeover.lock'),
    selfCommand: selfCommand(),
    fs: createNodeFs(),
    clock: createSystemClock(),
    runner: createRoutingRunner(
      createHeadlessRunner(),
      createHerdrRunner({
        process: processes,
        repoRoot: wiring.repoRoot,
        workspaces: createHerdrWorkspaces({
          process: processes,
          fs: createNodeFs(),
          lock: createFileLock('herdr.lock'),
          dataDir: join(wiring.repoRoot, DATA_DIR),
        }),
      }),
    ),
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
  };
};
