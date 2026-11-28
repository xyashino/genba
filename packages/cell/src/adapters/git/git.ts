import { rm } from 'node:fs/promises';
import { baseRefOf } from '@repo/line/branch';
import type { GitPort } from '../../ports/git.port.ts';
import type { ProcessPort } from '@repo/host/ports/process.port';
import { addInfoExclude } from './exclude.ts';

const GIT = 'git';
const REMOTE = 'origin';

export const createGitAdapter = (process: ProcessPort): GitPort => {
  const git = async (args: string[], cwd: string): Promise<string> => {
    const result = await process.run(GIT, args, cwd);
    if (result.exitCode !== 0) {
      throw new Error(`git ${args[0]} failed: ${result.stderr.trim()}`);
    }
    return result.stdout;
  };
  const hasOrigin = async (cwd: string): Promise<boolean> =>
    (await process.run(GIT, ['remote', 'get-url', REMOTE], cwd)).exitCode === 0;
  const fetchOrigin = async (cwd: string): Promise<void> => {
    const result = await process.run(GIT, ['fetch', REMOTE], cwd);
    if (result.exitCode !== 0) {
      throw new Error(`git fetch ${REMOTE} failed: ${result.stderr.trim()}`);
    }
  };
  const startPointOf = async (
    cwd: string,
    baseBranch: string,
  ): Promise<string> => {
    const remote = await process.run(
      GIT,
      [
        'rev-parse',
        '--verify',
        '--quiet',
        `refs/remotes/${REMOTE}/${baseBranch}`,
      ],
      cwd,
    );
    return baseRefOf(baseBranch, remote.exitCode === 0);
  };
  const lines = (text: string): string[] => text.split('\0').filter(Boolean);
  return {
    baseRef: startPointOf,
    mergeBase: async (cwd, ref) =>
      (await git(['merge-base', 'HEAD', ref], cwd)).trim(),
    changedPaths: async (cwd, sinceSha) => {
      const tracked = await git(
        ['diff', '--name-only', '--no-renames', '-z', sinceSha, '--'],
        cwd,
      );
      const untracked = await git(
        ['ls-files', '--others', '--exclude-standard', '-z'],
        cwd,
      );
      return [...new Set([...lines(tracked), ...lines(untracked)])].sort();
    },
    addedPaths: async (cwd, sinceSha, dir) =>
      lines(
        await git(
          [
            'diff',
            '--name-only',
            '--diff-filter=A',
            '--no-renames',
            '-z',
            sinceSha,
            'HEAD',
            '--',
            dir,
          ],
          cwd,
        ),
      ),
    diffSince: (cwd, sha) => git(['diff', sha, 'HEAD', '--'], cwd),
    commitCountSince: async (cwd, sha) =>
      Number((await git(['rev-list', '--count', `${sha}..HEAD`], cwd)).trim()),
    commitAll: async (cwd, message, allowEmpty = false) => {
      await git(['add', '--all'], cwd);
      const flags = allowEmpty ? ['--allow-empty'] : [];
      await git(['commit', '--no-verify', ...flags, '-m', message], cwd);
    },
    branchHead: async (repoRoot, branch) => {
      const result = await process.run(
        GIT,
        ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`],
        repoRoot,
      );
      return result.exitCode === 0 ? result.stdout.trim() : null;
    },
    worktreeAttach: async (repoRoot, path, branch) => {
      await git(['worktree', 'prune'], repoRoot);
      await git(['worktree', 'add', path, branch], repoRoot);
    },
    currentBranch: async (cwd) =>
      (await git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)).trim(),
    isClean: async (cwd) => (await git(['status', '--porcelain'], cwd)) === '',
    worktreeAdd: async (repoRoot, path, branch, baseBranch) => {
      if (await hasOrigin(repoRoot)) {
        await fetchOrigin(repoRoot);
      }
      const startPoint = await startPointOf(repoRoot, baseBranch);
      await git(['worktree', 'add', path, '-b', branch, startPoint], repoRoot);
    },
    // Falls back to deleting the directory: a half-built or missing worktree still has to go.
    worktreeRemove: async (repoRoot, path) => {
      const result = await process.run(
        GIT,
        ['worktree', 'remove', '--force', path],
        repoRoot,
      );
      if (result.exitCode === 0) return;
      await rm(path, { recursive: true, force: true });
      await git(['worktree', 'prune'], repoRoot);
    },
    deleteBranch: async (repoRoot, branch) => {
      if ((await git(['branch', '--list', branch], repoRoot)).trim() === '') {
        return;
      }
      await git(['branch', '-D', branch], repoRoot);
    },
    excludeLocally: async (worktree, pattern) => {
      await addInfoExclude(process, worktree, pattern);
    },
    // `--no-verify`: the Line's quality gate runs the repo's checks itself.
    commit: async (cwd, paths, message) => {
      await git(['add', '--', ...paths], cwd);
      await git(['commit', '--no-verify', '-m', message, '--', ...paths], cwd);
    },
    push: async (cwd, branch, replacing) => {
      const args = ['push', '--no-verify', '--set-upstream', REMOTE, branch];
      try {
        await git(args, cwd);
      } catch (error) {
        if (replacing === undefined) throw error;
        const lease = `--force-with-lease=refs/heads/${branch}:${replacing}`;
        await git([...args, lease], cwd);
      }
    },
    headSha: async (cwd) => (await git(['rev-parse', 'HEAD'], cwd)).trim(),
    status: (cwd) => git(['status', '--porcelain'], cwd),
    remoteUrl: async (cwd) => {
      const result = await process.run(GIT, ['remote', 'get-url', REMOTE], cwd);
      return result.exitCode === 0 ? result.stdout.trim() : null;
    },
    hasRemoteBranch: async (cwd, branch) =>
      (
        await process.run(
          GIT,
          ['ls-remote', '--exit-code', '--heads', REMOTE, branch],
          cwd,
        )
      ).exitCode === 0,
    hasAuthorIdentity: async (cwd) =>
      (await process.run(GIT, ['var', 'GIT_AUTHOR_IDENT'], cwd)).exitCode === 0,
    // `clean` never takes `-x`: ignored `.cell/` files must survive a discard.
    resetHard: async (cwd, sha) => {
      await git(['reset', '--hard', sha], cwd);
    },
    discardChanges: async (cwd) => {
      await git(['reset', '--hard', 'HEAD'], cwd);
      await git(['clean', '-fd'], cwd);
    },
    hasCommit: async (cwd, sha) =>
      (await process.run(GIT, ['cat-file', '-e', `${sha}^{commit}`], cwd))
        .exitCode === 0,
  };
};
