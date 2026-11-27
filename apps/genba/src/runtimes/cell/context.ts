import { join } from 'node:path';
import { parseLine } from '../../domain/line.ts';
import type { LineDefinition } from '../../domain/line.ts';
import { parseRepoManifest } from '../../domain/manifest.ts';
import type { RepoManifest } from '../../domain/manifest.ts';
import { parseRole } from '../../domain/role.ts';
import type { RoleDefinition } from '../../domain/role.ts';
import {
  CELL_DIR,
  MANIFEST_PATH,
  isAssetName,
  linePathOf,
  rolePathOf,
} from '../../domain/runtime-paths.ts';
import type { ForgePort } from '../../ports/forge.port.ts';
import type { FsPort, LockPort } from '../../ports/fs.port.ts';
import type { GitPort } from '../../ports/git.port.ts';
import type { OperatorEndpointPort } from '../../ports/operator.port.ts';
import type {
  RunHandle,
  RunnerCatalogPort,
  RunnerPort,
  RunSpec,
} from '../../ports/runner.port.ts';
import type { JobAssignment } from '@repo/contracts/jobs.contract';

const TAIL_CHARS = 4_000;

export type CellDeps = {
  repoRoot: string;
  selfCommand: readonly string[];
  git: GitPort;
  fs: FsPort;
  runner: RunnerPort;
  catalog: RunnerCatalogPort;
  operator: OperatorEndpointPort;
  /** one `changeover.root` at a time across Cells */
  rootLock: LockPort;
  forgeOf: (manifest: RepoManifest) => ForgePort;
  /** tells the daemon which process group to kill if this Cell dies */
  trackRunner: (
    runner: { pid: number; command: string } | null,
  ) => Promise<void>;
  /** aborts when the Cell is told to stop */
  signal: AbortSignal;
};

export type JobContext = CellDeps & {
  assignment: JobAssignment;
  manifest: RepoManifest;
  line: LineDefinition;
};

export type Workspace = {
  path: string;
  branch: string;
  baseBranch: string;
  /** where the order's own commits start */
  baseSha: string;
};

export type ProcessEnd =
  | { kind: 'exited'; exitCode: number }
  | { kind: 'timeout' }
  | { kind: 'signalled' };

export class CellStopped extends Error {}

const raceEnd = async (
  deps: CellDeps,
  handle: RunHandle,
  command: string,
  timeoutMs: number,
  finished: Promise<unknown>,
): Promise<ProcessEnd> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stopped = Promise.withResolvers<'stopped'>();
  const onStop = (): void => stopped.resolve('stopped');
  deps.signal.addEventListener('abort', onStop, { once: true });
  try {
    if (handle.pid !== undefined) {
      await deps.trackRunner({ pid: handle.pid, command });
    }
    const end = await Promise.race([
      deps.runner
        .wait(handle)
        .then(({ exitCode }) => ({ kind: 'exited' as const, exitCode })),
      finished.then(() => ({ kind: 'signalled' as const })),
      new Promise<ProcessEnd>((resolve) => {
        timer = setTimeout(() => resolve({ kind: 'timeout' }), timeoutMs);
      }),
      stopped.promise,
    ]);
    if (end === 'stopped') throw new CellStopped();
    return end;
  } finally {
    clearTimeout(timer);
    deps.signal.removeEventListener('abort', onStop);
  }
};

export const tailOf = (text: string): string => text.slice(-TAIL_CHARS);

export const loadManifest = async (
  fs: FsPort,
  repoRoot: string,
): Promise<RepoManifest> =>
  parseRepoManifest(
    JSON.parse(await fs.readText(join(repoRoot, MANIFEST_PATH))),
  );

export const stationDirOf = (workspace: Workspace, stationId: string): string =>
  join(workspace.path, CELL_DIR, stationId);

export const readIfPresent = async (
  fs: FsPort,
  path: string,
): Promise<string | undefined> =>
  (await fs.exists(path)) ? fs.readText(path) : undefined;

/**
 * Runs one child process group until it exits, times out, `finished` resolves, or the Cell stops.
 * No process of the group survives this call.
 */
export const runTracked = async (
  deps: CellDeps,
  spec: RunSpec,
  timeoutMs: number,
  finished: Promise<unknown> = new Promise(() => undefined),
): Promise<ProcessEnd> => {
  if (deps.signal.aborted) throw new CellStopped();
  const handle = await deps.runner.start(spec);
  const sweep = async (): Promise<void> => {
    if (!(await deps.runner.abort(handle))) {
      throw new Error(`process ${handle.pid} survived abort`);
    }
    await deps.trackRunner(null).catch(() => undefined);
  };
  let end: ProcessEnd;
  try {
    end = await raceEnd(deps, handle, spec.command, timeoutMs, finished);
  } catch (error) {
    await sweep();
    throw error;
  }
  await sweep();
  return end;
};

// Read from the repo root, never a worktree: an agent must not edit its own guards.
const readAsset = async (
  fs: FsPort,
  repoRoot: string,
  name: string,
  pathOf: (name: string) => string,
): Promise<string> => {
  if (!isAssetName(name)) throw new Error(`invalid name "${name}"`);
  const path = pathOf(name);
  const text = await readIfPresent(fs, join(repoRoot, path));
  if (text === undefined) throw new Error(`missing ${path}`);
  return text;
};

export const loadLine = async (
  fs: FsPort,
  repoRoot: string,
  name: string,
): Promise<LineDefinition> =>
  parseLine(await readAsset(fs, repoRoot, name, linePathOf));

export const roleOf = async (
  { fs, repoRoot }: Pick<CellDeps, 'fs' | 'repoRoot'>,
  name: string,
): Promise<RoleDefinition> =>
  parseRole(await readAsset(fs, repoRoot, name, rolePathOf));
