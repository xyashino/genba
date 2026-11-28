import { join } from 'node:path';
import { orderBranchOf } from '@repo/line/branch';
import { CELL_DIR, DATA_DIR, WORKTREES_DIR } from '@repo/line/runtime-paths';
import type { Hook } from '@repo/line/line';
import type { JobContext, Workspace } from './context.ts';
import { runTracked, tailOf } from './context.ts';

const ROOT_MARKER = 'changeover-root.done';
const WORKTREE_MARKER = 'changeover-worktree.done';
export const WORKTREE_LOG = 'changeover-worktree.log';
const REPLACES_FILE = 'replaces';

// Returns the failure, or null.
const runHook = async (
  job: JobContext,
  name: string,
  hook: Hook,
  cwd: string,
  logPath: string,
): Promise<string | null> => {
  await job.fs.remove(logPath);
  for (const command of hook.exec) {
    await job.note(`${name} start`, command);
    const end = await runTracked(
      job,
      { command: 'sh', args: ['-c', command], cwd, env: {}, logPath },
      hook.timeoutMs,
    );
    if (end.kind !== 'exited' || end.exitCode !== 0) {
      const log = (await job.fs.exists(logPath))
        ? await job.fs.readText(logPath)
        : '';
      return `${name} command \`${command}\` failed\n${tailOf(log)}`;
    }
  }
  return null;
};

// Runs in the user's own checkout, so nothing here may clean or reset it.
const runRootHook = async (job: JobContext): Promise<string | null> => {
  const hook = job.line.changeover.root;
  if (hook === undefined) return null;
  const dataDir = join(job.repoRoot, DATA_DIR);
  const log = join(
    dataDir,
    'logs',
    `changeover-${job.assignment.order.slug}.log`,
  );
  return job.rootLock.withLock(dataDir, job.signal, () =>
    runHook(job, 'changeover.root', hook, job.repoRoot, log),
  );
};

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

const resolveBaseBranch = async (job: JobContext): Promise<string> => {
  const parent = job.assignment.parentBranch;
  if (parent === null) return job.manifest.git.baseBranch;
  const hasOrigin = (await job.git.remoteUrl(job.repoRoot)) !== null;
  if (hasOrigin && !(await job.git.hasRemoteBranch(job.repoRoot, parent))) {
    return job.manifest.git.baseBranch;
  }
  return parent;
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

/**
 * Creates, re-attaches, or reuses the order's worktree.
 * `changeover` runs `changeover.root` first when the worktree has not had it.
 */
export const ensureWorktree = async (
  job: JobContext,
  { changeover = false }: { changeover?: boolean } = {},
): Promise<Workspace> => {
  const { git, fs, repoRoot, assignment } = job;
  const { slug } = assignment.order;
  const path = worktreePathOf(repoRoot, slug);
  const branch = orderBranchOf(slug);
  const baseBranch = await resolveBaseBranch(job);
  await git.excludeLocally(repoRoot, `${WORKTREES_DIR}/`);
  await git.excludeLocally(repoRoot, `${DATA_DIR}/`);
  const rootMarker = join(path, CELL_DIR, ROOT_MARKER);
  // A worktree an escalation created has no marker, so the hook still runs for it.
  const needsRoot =
    changeover && (assignment.freshWorktree || !(await fs.exists(rootMarker)));
  // Before any discard: a failure here must not lose what the old branch held.
  if (needsRoot) {
    const failure = await runRootHook(job);
    if (failure !== null) throw new Error(failure);
  }
  const replaced = assignment.freshWorktree
    ? await discardHistory(job, path, branch)
    : null;
  const existed = await fs.exists(join(path, '.git'));
  await job.note(existed ? 'worktree reuse' : 'worktree create', branch);
  if (!existed) {
    if ((await git.branchHead(repoRoot, branch)) !== null) {
      await git.worktreeAttach(repoRoot, path, branch);
    } else {
      await git.worktreeAdd(repoRoot, path, branch, baseBranch);
    }
  }
  await git.excludeLocally(path, `${CELL_DIR}/`);
  if (needsRoot) await fs.writeText(rootMarker, 'done\n');
  if (replaced !== null) {
    await fs.writeText(join(path, CELL_DIR, REPLACES_FILE), `${replaced}\n`);
  }
  const baseSha = await git.mergeBase(
    path,
    await git.baseRef(path, baseBranch),
  );
  return { path, branch, baseBranch, baseSha };
};

/** Runs `changeover.worktree` once per worktree; returns the failure, or null. */
export const runWorktreeHook = async (
  job: JobContext,
  workspace: Workspace,
): Promise<string | null> => {
  const hook = job.line.changeover.worktree;
  const marker = join(workspace.path, CELL_DIR, WORKTREE_MARKER);
  if (hook === undefined || (await job.fs.exists(marker))) return null;
  const clean = await job.git.isClean(workspace.path);
  const failure = await runHook(
    job,
    'changeover.worktree',
    hook,
    workspace.path,
    join(workspace.path, CELL_DIR, WORKTREE_LOG),
  );
  if (failure !== null) return failure;
  // The hook may rewrite tracked files such as lockfiles; they are not the agent's work.
  if (clean) await job.git.discardChanges(workspace.path);
  await job.fs.writeText(marker, 'done\n');
  return null;
};
