import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { createLoopbackApi } from '../../adapters/http/loopback-api.ts';
import {
  CLI_TOKEN_FILE,
  DATA_DIR,
  PORT_ENV,
  daemonUrlOf,
} from '../../domain/runtime-paths.ts';
import {
  ApiError,
  ApiUnreachableError,
} from '../../ports/loopback-api.port.ts';
import type { LoopbackApiPort } from '../../ports/loopback-api.port.ts';
import type { CliDeps } from './context.ts';
import { CliError, repoRootOf } from './context.ts';

const BOOT_TIMEOUT_MS = 15_000;
const POLL_MS = 100;
const LOG_TAIL_CHARS = 2_000;

export const healthSchema = z.object({
  repoRoot: z.string(),
  pid: z.number(),
  desired: z.number(),
  crashLoop: z.boolean(),
  cells: z.array(
    z.object({
      cellId: z.string(),
      pid: z.number(),
      state: z.enum(['idle', 'running']),
      jobId: z.string().nullable(),
    }),
  ),
});

export type Health = z.infer<typeof healthSchema>;

export type DaemonLink = {
  api: LoopbackApiPort;
  health: Health;
};

const portHint = (port: number): string =>
  `another genba daemon holds port ${port}: stop it, or set ${PORT_ENV}`;

/** The running daemon of this repo, or null when none answers. */
export const findDaemon = async (deps: CliDeps): Promise<DaemonLink | null> => {
  const root = realpathSync(await repoRootOf(deps));
  const tokenPath = join(root, DATA_DIR, CLI_TOKEN_FILE);
  const token = (await deps.fs.exists(tokenPath))
    ? (await deps.fs.readText(tokenPath)).trim()
    : 'none';
  const api = createLoopbackApi({ url: daemonUrlOf(deps.port), token });
  try {
    const health = healthSchema.parse(await api.request('GET', '/health'));
    if (health.repoRoot !== root) throw new CliError(portHint(deps.port));
    return { api, health };
  } catch (error) {
    if (error instanceof ApiUnreachableError) return null;
    if (error instanceof ApiError && error.status === 401) {
      throw new CliError(portHint(deps.port));
    }
    throw error;
  }
};

export const requireDaemon = async (deps: CliDeps): Promise<DaemonLink> => {
  const link = await findDaemon(deps);
  if (link === null) {
    throw new CliError('no genba daemon is running: run `genba start`');
  }
  return link;
};

export const ensureDaemon = async (deps: CliDeps): Promise<DaemonLink> => {
  const running = await findDaemon(deps);
  if (running !== null) return running;
  const root = realpathSync(await repoRootOf(deps));
  const logPath = join(root, DATA_DIR, 'logs', 'daemon.log');
  await deps.git.excludeLocally(root, `${DATA_DIR}/`);
  const [command = '', ...prefix] = deps.selfCommand;
  const pid = await deps.process.spawnDetached({
    command,
    args: [...prefix, '__daemon'],
    env: {},
    cwd: root,
    logPath,
  });
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (Date.now() < deadline && deps.process.isAlive(pid)) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    // The token file appears only once the daemon is ready, so earlier 401s are expected.
    const link = await findDaemon(deps).catch(() => null);
    if (link !== null) return link;
  }
  const log = (await deps.fs.exists(logPath))
    ? await deps.fs.readText(logPath)
    : '';
  throw new CliError(
    `the genba daemon did not start\n${log.slice(-LOG_TAIL_CHARS)}`,
  );
};
