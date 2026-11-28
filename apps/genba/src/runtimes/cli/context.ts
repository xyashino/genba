import { dirname, join } from 'node:path';
import { parseRepoManifest } from '@repo/line/manifest';
import type { RepoManifest } from '@repo/line/manifest';
import { MANIFEST_PATH } from '@repo/line/runtime-paths';
import type { ForgePort, GitPort, RunnerCatalogPort } from '@repo/cell/probes';
import type { FsPort } from '@repo/host/ports/fs.port';
import type { ProcessPort } from '@repo/host/ports/process.port';

export type CliDeps = {
  cwd: string;
  port: number;
  selfCommand: readonly string[];
  fs: FsPort;
  /** line files are read while the queue is being changed, which cannot wait */
  readTextIfPresent: (path: string) => string | undefined;
  git: GitPort;
  process: ProcessPort;
  catalog: RunnerCatalogPort;
  forgeOf: (manifest: RepoManifest) => ForgePort;
  out: (text: string) => void;
  err: (text: string) => void;
};

/** A problem the user can fix: printed without a stack trace. */
export class CliError extends Error {}

/** The main checkout, even when the command runs inside a linked worktree. */
export const repoRootOf = async (deps: CliDeps): Promise<string> => {
  const result = await deps.process.run(
    'git',
    ['rev-parse', '--path-format=absolute', '--git-common-dir'],
    deps.cwd,
  );
  if (result.exitCode !== 0) {
    throw new CliError('not inside a git repository');
  }
  return dirname(result.stdout.trim());
};

export const manifestOf = async (
  deps: CliDeps,
  repoRoot: string,
): Promise<RepoManifest> => {
  const path = join(repoRoot, MANIFEST_PATH);
  if (!(await deps.fs.exists(path))) {
    throw new CliError(`${MANIFEST_PATH} is missing: run \`genba init\``);
  }
  try {
    return parseRepoManifest(JSON.parse(await deps.fs.readText(path)));
  } catch (error) {
    throw new CliError(
      `${MANIFEST_PATH} is invalid: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};
