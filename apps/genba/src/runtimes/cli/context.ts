import { dirname, join } from 'node:path';
import { parseRepoManifest } from '../../domain/manifest.ts';
import type { RepoManifest } from '../../domain/manifest.ts';
import { MANIFEST_PATH } from '../../domain/runtime-paths.ts';
import type { ForgePort } from '../../ports/forge.port.ts';
import type { FsPort } from '../../ports/fs.port.ts';
import type { GitPort } from '../../ports/git.port.ts';
import type { ProcessPort } from '../../ports/process.port.ts';
import type { RunnerCatalogPort } from '../../ports/runner.port.ts';

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
