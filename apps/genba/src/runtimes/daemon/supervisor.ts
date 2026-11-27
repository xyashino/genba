import { join } from 'node:path';
import { z } from 'zod';
import { cellIdOf, slotOf } from '../../domain/cells.ts';
import {
  CELLS_FILE,
  CELL_TOKEN_ENV,
  DAEMON_URL_ENV,
  REPO_ROOT_ENV,
} from '../../domain/runtime-paths.ts';
import type { FsPort } from '../../ports/fs.port.ts';
import type { ProcessPort } from '../../ports/process.port.ts';
import type { CellHomes } from './cell-homes.ts';
import type { DaemonContext } from './core/context.ts';
import { DaemonError } from './core/errors.ts';
import { nowOf } from './core/context.ts';
import { requeueJob } from './procedures/requeue-job.ts';

const CELL_COMMAND = '__cell';
// A stopping Cell first aborts its runner, which may itself take a SIGTERM and a SIGKILL window.
const STOP_WAIT_MS = 15_000;
const KILL_WAIT_MS = 5_000;
const POLL_MS = 50;
const CRASH_WINDOW_MS = 60_000;
const CRASH_LIMIT = 5;
const RESPAWN_BASE_MS = 500;
const RESPAWN_MAX_MS = 15_000;

const runnerSchema = z.object({
  pid: z.number().int().positive(),
  command: z.string(),
});
const savedSchema = z.array(
  z.object({
    cellId: z.string(),
    pid: z.number().int().positive(),
    runner: runnerSchema.nullable(),
  }),
);

export type RunnerProcess = z.infer<typeof runnerSchema>;

export type CellView = {
  cellId: string;
  pid: number;
  state: 'idle' | 'running';
  jobId: string | null;
  startedAt: string;
};

export type SupervisorDeps = {
  context: DaemonContext;
  process: ProcessPort;
  fs: FsPort;
  repoRoot: string;
  dataDir: string;
  daemonUrl: string;
  selfCommand: readonly string[];
  newToken: () => string;
  homes: CellHomes;
};

export type Supervisor = {
  /** kills what a previous daemon left behind, then requeues its jobs */
  recover(): Promise<void>;
  scale(count: number): Promise<void>;
  /** one health pass: bury dead Cells, then respawn up to the target */
  reconcile(): Promise<void>;
  status(): { desired: number; crashLoop: boolean; cells: CellView[] };
  /** the Cell owning a bearer token */
  cellOfToken(token: string): string | undefined;
  isStopping(cellId: string): boolean;
  setRunner(cellId: string, runner: RunnerProcess | null): void;
  /** stops the Cell working on a job; its replacement comes from the next reconcile */
  stopCellOfJob(jobId: string): Promise<void>;
  stopAll(): Promise<void>;
};

type Entry = {
  cellId: string;
  token: string;
  pid: number;
  runner: RunnerProcess | null;
  startedAt: string;
  stopping: boolean;
};

export const createSupervisor = (deps: SupervisorDeps): Supervisor => {
  const { context, process: processes, fs, dataDir } = deps;
  const cells = new Map<string, Entry>();
  const savedPath = join(dataDir, CELLS_FILE);
  let desired = 0;
  let exits: number[] = [];
  let crashLoop = false;
  let nextSpawnAt = 0;
  // Cells that died on their own: their replacement keeps the log.
  const crashed = new Set<string>();
  const { homes } = deps;
  let queue: Promise<unknown> = Promise.resolve();

  // Spawn, kill, and requeue never interleave.
  const exclusive = <T>(work: () => Promise<T>): Promise<T> => {
    const result = queue.then(work);
    queue = result.catch(() => undefined);
    return result;
  };

  const persist = async (): Promise<void> => {
    await fs.writeText(
      savedPath,
      `${JSON.stringify(
        [...cells.values()].map(({ cellId, pid, runner }) => ({
          cellId,
          pid,
          runner,
        })),
      )}\n`,
      0o600,
    );
  };

  const goneWithin = async (
    isAlive: () => boolean,
    timeoutMs: number,
  ): Promise<boolean> => {
    const deadline = context.clock.now() + timeoutMs;
    while (isAlive()) {
      if (context.clock.now() >= deadline) return false;
      await context.clock.sleep(POLL_MS);
    }
    return true;
  };

  const killRunner = async (runner: RunnerProcess | null): Promise<void> => {
    if (runner === null || !processes.isGroupAlive(runner.pid)) return;
    processes.signalGroup(runner.pid, 'SIGKILL');
    if (
      !(await goneWithin(
        () => processes.isGroupAlive(runner.pid),
        KILL_WAIT_MS,
      ))
    ) {
      throw new Error(`runner ${runner.pid} did not exit after SIGKILL`);
    }
  };

  const killProcess = async (pid: number): Promise<void> => {
    if (!processes.isAlive(pid)) return;
    processes.terminate(pid);
    if (await goneWithin(() => processes.isAlive(pid), STOP_WAIT_MS)) return;
    processes.forceKill(pid);
    if (!(await goneWithin(() => processes.isAlive(pid), KILL_WAIT_MS))) {
      throw new Error(`cell process ${pid} did not exit after SIGKILL`);
    }
  };

  const jobOf = (cellId: string) =>
    context.store.activeJobs().find((job) => job.cellId === cellId);

  const changed = (): void => {
    context.publish({
      type: 'cells',
      at: nowOf(context),
      detail: `${cells.size}/${desired}`,
    });
  };

  // Only reached once the Cell and its runner are confirmed dead.
  const release = async (cellId: string, refund: boolean): Promise<void> => {
    const job = jobOf(cellId);
    if (job !== undefined) requeueJob(context, job, refund);
    cells.delete(cellId);
    await persist();
    changed();
  };

  const stopCell = async (entry: Entry): Promise<void> => {
    entry.stopping = true;
    await killProcess(entry.pid);
    await killRunner(entry.runner);
    await release(entry.cellId, true);
  };

  const noteExit = (): void => {
    const now = context.clock.now();
    exits = [...exits.filter((at) => now - at < CRASH_WINDOW_MS), now];
    if (exits.length >= CRASH_LIMIT) {
      crashLoop = true;
      return;
    }
    nextSpawnAt =
      now + Math.min(RESPAWN_BASE_MS * 2 ** (exits.length - 1), RESPAWN_MAX_MS);
  };

  const freeCellId = (): string => {
    let slot = 1;
    while (cells.has(cellIdOf(slot))) slot += 1;
    return cellIdOf(slot);
  };

  // Removes everything left by Cells above the target, alive or not.
  const purge = async (above: number): Promise<void> => {
    for (const cellId of await homes.known()) {
      if (slotOf(cellId)! <= above || cells.has(cellId)) continue;
      await homes.close(cellId);
      crashed.delete(cellId);
    }
  };

  const spawnCell = async (): Promise<void> => {
    const cellId = freeCellId();
    try {
      await homes.open(cellId, { crashed: crashed.has(cellId) });
    } catch (error) {
      noteExit();
      throw new DaemonError(
        409,
        'invalid_state',
        `cannot set up ${cellId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const token = deps.newToken();
    const [command = '', ...prefix] = deps.selfCommand;
    const pid = await processes.spawnDetached({
      command,
      args: [...prefix, CELL_COMMAND, cellId],
      env: {
        [CELL_TOKEN_ENV]: token,
        [DAEMON_URL_ENV]: deps.daemonUrl,
        [REPO_ROOT_ENV]: deps.repoRoot,
      },
      cwd: deps.repoRoot,
      logPath: join(dataDir, 'logs', `${cellId}.log`),
    });
    cells.set(cellId, {
      cellId,
      token,
      pid,
      runner: null,
      startedAt: nowOf(context),
      stopping: false,
    });
    crashed.delete(cellId);
    await homes.note(cellId, 'cell start', `pid ${pid}`);
    await persist();
    changed();
  };

  const bury = async (): Promise<void> => {
    for (const entry of [...cells.values()]) {
      if (processes.isAlive(entry.pid)) continue;
      await killRunner(entry.runner);
      await homes.note(
        entry.cellId,
        'cell crash',
        'its job goes back to the queue',
      );
      crashed.add(entry.cellId);
      await release(entry.cellId, false);
      noteExit();
    }
  };

  const fill = async (): Promise<void> => {
    while (
      !crashLoop &&
      cells.size < desired &&
      context.clock.now() >= nextSpawnAt
    ) {
      await spawnCell();
    }
  };

  // The highest names go first, so what remains is always cell-1 to cell-N.
  const trim = async (): Promise<void> => {
    for (const entry of [...cells.values()]) {
      if (slotOf(entry.cellId)! > desired) await stopCell(entry);
    }
  };

  const recorded = async (pid: number, marker: string): Promise<boolean> =>
    (await processes.commandOf(pid))?.includes(marker) ?? false;

  const readSaved = async (): Promise<z.infer<typeof savedSchema>> =>
    (await fs.exists(savedPath))
      ? savedSchema.parse(JSON.parse(await fs.readText(savedPath)))
      : [];

  return {
    recover: () =>
      exclusive(async () => {
        for (const saved of await readSaved()) {
          if (await recorded(saved.pid, saved.cellId)) {
            await killProcess(saved.pid);
          }
          crashed.add(saved.cellId);
          // A pid that now runs something else was reused: leave it alone.
          const { runner } = saved;
          if (runner !== null) {
            const command = await processes.commandOf(runner.pid);
            if (command === null || command.includes(runner.command)) {
              await killRunner(runner);
            }
          }
        }
        for (const job of context.store.activeJobs()) {
          requeueJob(context, job, true);
        }
        await persist();
      }),
    scale: (count) =>
      exclusive(async () => {
        desired = count;
        exits = [];
        crashLoop = false;
        nextSpawnAt = 0;
        await bury();
        await trim();
        await purge(count);
        await fill();
      }),
    reconcile: () =>
      exclusive(async () => {
        await bury();
        await fill();
      }),
    status: () => ({
      desired,
      crashLoop,
      cells: [...cells.values()].map((entry) => {
        const job = jobOf(entry.cellId);
        return {
          cellId: entry.cellId,
          pid: entry.pid,
          state: job === undefined ? 'idle' : 'running',
          jobId: job?.id ?? null,
          startedAt: entry.startedAt,
        };
      }),
    }),
    cellOfToken: (token) =>
      [...cells.values()].find((entry) => entry.token === token)?.cellId,
    isStopping: (cellId) => cells.get(cellId)?.stopping ?? true,
    setRunner: (cellId, runner) => {
      const entry = cells.get(cellId);
      if (entry === undefined) return;
      entry.runner = runner;
      void exclusive(persist);
    },
    stopCellOfJob: (jobId) =>
      exclusive(async () => {
        const cellId = context.store.findJob(jobId)?.cellId;
        const entry = cellId === undefined ? undefined : cells.get(cellId);
        if (entry !== undefined && jobOf(entry.cellId)?.id === jobId) {
          await stopCell(entry);
        }
      }),
    stopAll: () =>
      exclusive(async () => {
        desired = 0;
        await bury();
        await trim();
        await purge(0);
      }),
  };
};
