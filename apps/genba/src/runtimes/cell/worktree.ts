import { join } from 'node:path';
import { orderBranchOf } from '../../domain/branch.ts';
import {
  CELL_DIR,
  DATA_DIR,
  WORKTREES_DIR,
} from '../../domain/runtime-paths.ts';
import type { JobContext, Workspace } from './context.ts';
import { runTracked, tailOf } from './context.ts';

const SETUP_MARKER = 'setup.done';
const SETUP_LOG = 'setup.log';
const REPLACES_FILE = 'replaces';

// Drops the old worktree and branch, and returns the commit a later push may overwrite.
const discardHistory = async (
  job: JobContext,
  path: string,
  branch: string,
): Promise<string | null> => {
  const { git, fs, repoRoot } = job;
  // A repeated reset must keep the first value: it is what the remote still holds.
  const replaced =
    (await replacedBy(job, path)) ?? (await git.branchHead(repoRoot, branch));
  if (await fs.exists(path)) await git.worktreeRemove(repoRoot, path);
  await git.deleteBranch(repoRoot, branch);
  return replaced;
};

export const worktreePathOf = (repoRoot: string, slug: string): string =>
  join(repoRoot, WORKTREES_DIR, slug);

/** The commit this worktree's history replaced, when it was restarted from scratch. */
export const replacedBy = async (
  job: JobContext,
  path: string,
): Promise<string | undefined> => {
  const file = join(path, CELL_DIR, REPLACES_FILE);
  return (await job.fs.exists(file))
    ? (await job.fs.readText(file)).trim()
    : undefined;
};

export const removeWorktree = async (
  job: JobContext,
  workspace: Workspace,
): Promise<void> => {
  await job.git.worktreeRemove(job.repoRoot, workspace.path);
};

/** Creates, re-attaches, or reuses the order's worktree. */
export const ensureWorktree = async (job: JobContext): Promise<Workspace> => {
  const { git, fs, repoRoot, assignment, manifest } = job;
  const { slug } = assignment.order;
  const path = worktreePathOf(repoRoot, slug);
  const branch = orderBranchOf(slug);
  const baseBranch = assignment.parentBranch ?? manifest.git.baseBranch;
  await git.excludeLocally(repoRoot, `${WORKTREES_DIR}/`);
  await git.excludeLocally(repoRoot, `${DATA_DIR}/`);
  const replaced = assignment.freshWorktree
    ? await discardHistory(job, path, branch)
    : null;
  if (!(await fs.exists(join(path, '.git')))) {
    if ((await git.branchHead(repoRoot, branch)) !== null) {
      await git.worktreeAttach(repoRoot, path, branch);
    } else {
      await git.worktreeAdd(repoRoot, path, branch, baseBranch);
    }
  }
  await git.excludeLocally(path, `${CELL_DIR}/`);
  if (replaced !== null) {
    await fs.writeText(join(path, CELL_DIR, REPLACES_FILE), `${replaced}\n`);
  }
  const baseSha = await git.mergeBase(
    path,
    await git.baseRef(path, baseBranch),
  );
  return { path, branch, baseBranch, baseSha };
};

/** Runs `workspace.setup` once per worktree; returns the failure, or null. */
export const runSetup = async (
  job: JobContext,
  workspace: Workspace,
  timeoutMs: number,
): Promise<string | null> => {
  const marker = join(workspace.path, CELL_DIR, SETUP_MARKER);
  if (await job.fs.exists(marker)) return null;
  const logPath = join(workspace.path, CELL_DIR, SETUP_LOG);
  const clean = await job.git.isClean(workspace.path);
  for (const command of job.manifest.workspace.setup) {
    const end = await runTracked(
      job,
      {
        command: 'sh',
        args: ['-c', command],
        cwd: workspace.path,
        env: {},
        logPath,
      },
      timeoutMs,
    );
    if (end.kind !== 'exited' || end.exitCode !== 0) {
      const log = (await job.fs.exists(logPath))
        ? await job.fs.readText(logPath)
        : '';
      return `setup command \`${command}\` failed\n${tailOf(log)}`;
    }
  }
  // Setup may rewrite tracked files such as lockfiles; they are not the agent's work.
  if (clean) await job.git.discardChanges(workspace.path);
  await job.fs.writeText(marker, 'done\n');
  return null;
};
