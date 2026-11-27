import { randomBytes } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { createFileLock } from '@repo/host/fs/lock';
import { createPidFile } from '@repo/host/fs/pid-file';
import { createHerdrWorkspaces } from '@repo/host/herdr-workspaces';
import { orderBranchOf } from '@repo/line/branch';
import { onceIdOf, workspaceLabelOf } from '@repo/line/cells';
import { DATA_DIR, WORKTREES_DIR } from '@repo/line/runtime-paths';
import { renderEntry, renderHeader } from '@repo/line/timeline';
import { createLoopbackApi } from '../../adapters/http/loopback-api.ts';
import { cellDepsOf } from '../cell/deps.ts';
import { runCellLoop } from '../cell/loop.ts';
import { readOrders } from '../cli/commands/orders.ts';
import { timelineReader } from '../cli/commands/watch-full.ts';
import type { CliDeps } from '../cli/context.ts';
import { CliError, manifestOf, repoRootOf } from '../cli/context.ts';
import { createCellHomes } from '@repo/factory/cell-homes';
import { EMBEDDED_URL, createEmbeddedFactory } from '@repo/factory/embedded';
import { untilSettled } from './local-api.ts';

const POLL_MS = 500;
const INTERRUPTED_EXIT = 130;
const ID_BYTES = 4;
// "<order> <station> attempt N" and "<order> <station> -> <outcome>".
const PROGRESS = / (attempt \d+|-> \w+)$/;
const STOP_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;

// Read once, so editing a line file cannot change a run midway.
const readOnce = (deps: CliDeps, root: string) => {
  const read = new Map<string, string>();
  return (path: string): string | undefined => {
    const full = join(root, path);
    if (!read.has(full)) {
      const text = deps.readTextIfPresent(full);
      if (text !== undefined) read.set(full, text);
    }
    return read.get(full);
  };
};

const singleOrder = async (deps: CliDeps, path: string) => {
  const orders = await readOrders(deps, [path]);
  const [order] = orders;
  if (orders.length !== 1 || order === undefined) {
    throw new CliError('`genba run` takes one order file');
  }
  if (order.parentSlug !== null) {
    throw new CliError(
      '--once runs one order alone: remove depends_on, or use the queue',
    );
  }
  if (order.status !== 'queued') {
    throw new CliError(`order status is "${order.status}", not queued`);
  }
  return order;
};

/** `genba run --once`: one order in this process, with its own temporary Cell. */
export const runOnce = async (deps: CliDeps, path: string): Promise<number> => {
  const root = realpathSync(await repoRootOf(deps));
  const order = await singleOrder(deps, path);
  const manifest = await manifestOf(deps, root);
  const dataDir = join(root, DATA_DIR);
  await deps.git.excludeLocally(root, `${DATA_DIR}/`);
  const lock = createPidFile(`once-${order.slug}.lock`);
  if (!(await lock.acquire(dataDir, process.pid))) {
    throw new CliError(`${order.slug} is already running with --once`);
  }
  const cellId = onceIdOf(randomBytes(ID_BYTES).toString('hex'));
  const workspaces = createHerdrWorkspaces({
    process: deps.process,
    fs: deps.fs,
    lock: createFileLock('herdr.lock'),
    dataDir,
  });
  const homes = createCellHomes({
    fs: deps.fs,
    workspaces,
    repoRoot: root,
    selfCommand: deps.selfCommand,
    now: () => new Date().toISOString(),
    warn: deps.err,
  });
  const stop = new AbortController();
  let interrupted = false;
  const interrupt = (): void => {
    interrupted = true;
    stop.abort();
  };
  try {
    const branch = orderBranchOf(order.slug);
    if ((await deps.git.branchHead(root, branch)) !== null) {
      throw new CliError(
        `branch ${branch} exists from an earlier run: rename the order file, or remove ${WORKTREES_DIR}/${order.slug} and the branch`,
      );
    }
    const factory = createEmbeddedFactory({
      cellId,
      readRepo: readOnce(deps, root),
    });
    const apiOf = (token: string) =>
      createLoopbackApi({ url: EMBEDDED_URL, token, fetch: factory.fetch });
    await apiOf(factory.cliToken).request('POST', '/orders/import', {
      orders: [order],
    });
    await homes.open(cellId, { crashed: false });
    for (const signal of STOP_SIGNALS) process.on(signal, interrupt);

    const color = Boolean(process.stdout.isTTY);
    const read = timelineReader(deps.fs, root, { cell: cellId });
    const print = async (): Promise<void> => {
      for (const entry of await read()) deps.out(renderEntry(entry, color));
    };
    deps.out(renderHeader({ order: order.slug }, color));
    let printing = Promise.resolve();
    const timer = setInterval(() => {
      printing = printing.then(print);
    }, POLL_MS);
    try {
      await runCellLoop(
        cellDepsOf({
          cellId,
          repoRoot: root,
          api: untilSettled(
            apiOf(factory.cellToken),
            () => factory.order(order.slug)!.status,
            () => stop.abort(),
          ),
          signal: stop.signal,
          // No daemon watches this process; Ctrl+C stops the agent itself.
          trackRunner: async () => undefined,
          // Only problems: the timeline already shows the progress.
          log: (line) => {
            if (!PROGRESS.test(line)) deps.err(line);
          },
        }),
      );
    } finally {
      clearInterval(timer);
      await printing;
      await print();
    }

    const result = factory.order(order.slug)!;
    const delivered = result.status === 'delivered';
    if (delivered || interrupted) {
      await homes.close(cellId);
    }
    if (interrupted) {
      deps.err(`${order.slug}: interrupted, the worktree is kept`);
      return INTERRUPTED_EXIT;
    }
    deps.out(
      `${order.slug}: ${result.status}${result.prUrl === null ? '' : ` ${result.prUrl}`}`,
    );
    if (delivered) return 0;
    for (const job of factory.jobsOf(result.id)) {
      if (job.status === 'failed') {
        deps.err(`${job.stationId} #${job.attempt}: ${job.summary ?? ''}`);
      }
    }
    if (manifest.herdr) {
      deps.err(
        `workspace ${workspaceLabelOf(manifest.project, root, cellId)} is kept so you can look: close it when done`,
      );
    }
    return 1;
  } finally {
    for (const signal of STOP_SIGNALS) process.off(signal, interrupt);
    await lock.remove(dataDir);
  }
};
