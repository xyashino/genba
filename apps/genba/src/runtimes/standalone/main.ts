import { randomBytes } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { createFileLock } from '../../adapters/fs/lock.ts';
import { createPidFile } from '../../adapters/fs/pid-file.ts';
import { createSystemClock } from '../../adapters/process/system-clock.ts';
import { createHerdrWorkspaces } from '../../adapters/runners/herdr-workspaces.ts';
import { createSqliteStore } from '../../adapters/sqlite/store.ts';
import { orderBranchOf } from '../../domain/branch.ts';
import { onceIdOf, workspaceLabelOf } from '../../domain/cells.ts';
import { DATA_DIR, WORKTREES_DIR } from '../../domain/runtime-paths.ts';
import { renderEntry, renderHeader } from '../../domain/timeline.ts';
import { cellDepsOf } from '../cell/deps.ts';
import { runCellLoop } from '../cell/loop.ts';
import { readOrders } from '../cli/commands/orders.ts';
import { timelineReader } from '../cli/commands/watch-full.ts';
import type { CliDeps } from '../cli/context.ts';
import { CliError, manifestOf, repoRootOf } from '../cli/context.ts';
import { createCellHomes } from '../daemon/cell-homes.ts';
import type { DaemonContext } from '../daemon/core/context.ts';
import { createLineLoader } from '../daemon/core/lines.ts';
import { importOrders } from '../daemon/procedures/import-orders.ts';
import { createLocalApi } from './local-api.ts';

const POLL_MS = 500;
const INTERRUPTED_EXIT = 130;
const ID_BYTES = 4;
const STOP_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;

const contextOf = (deps: CliDeps, root: string): DaemonContext => {
  // Read once, so editing a line file cannot change a run midway.
  const read = new Map<string, string>();
  return {
    // Nothing outlives the run, so the queue is never written to disk.
    store: createSqliteStore(':memory:'),
    clock: createSystemClock(),
    newId: (prefix) => `${prefix}-${randomBytes(ID_BYTES).toString('hex')}`,
    publish: () => undefined,
    lineOf: createLineLoader((path) => {
      const full = join(root, path);
      if (!read.has(full)) {
        const text = deps.readTextIfPresent(full);
        if (text !== undefined) read.set(full, text);
      }
      return read.get(full);
    }),
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
    const context = contextOf(deps, root);
    importOrders(context, { orders: [order] });
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
          api: createLocalApi(context, order.slug, () => stop.abort()),
          signal: stop.signal,
          // No daemon watches this process; Ctrl+C stops the agent itself.
          trackRunner: async () => undefined,
          log: () => undefined,
        }),
      );
    } finally {
      clearInterval(timer);
      await printing;
      await print();
    }

    const result = context.store.findOrder(order.slug)!;
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
    for (const job of context.store.jobsOf(result.id)) {
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
