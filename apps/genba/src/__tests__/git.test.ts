import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createGitAdapter } from '../adapters/git/git.ts';
import { createProcessAdapter } from '../adapters/process/spawn.ts';
import { tempDir } from './support/stub-bin.ts';

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();

const writeFile = (path: string, text: string): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};

const identify = (repo: string): void => {
  git(repo, 'config', 'user.name', 'Genba Test');
  git(repo, 'config', 'user.email', 'genba-test@example.invalid');
};

const commitFile = (repo: string, file: string): string => {
  writeFile(join(repo, file), `${file}\n`);
  git(repo, 'add', '--', file);
  git(repo, 'commit', '-m', `chore(test): add ${file}`);
  return git(repo, 'rev-parse', 'HEAD');
};

describe('git adapter', () => {
  const port = createGitAdapter(createProcessAdapter());
  let root: string;
  let repo: string;
  let worktreeAt: (name: string) => string;

  beforeEach(() => {
    root = tempDir('git');
    repo = join(root, 'repo');
    git(root, 'init', '-b', 'main', repo);
    identify(repo);
    commitFile(repo, 'README.md');
    worktreeAt = (name) => join(repo, '.worktrees', name);
  });

  const withOrigin = (): string => {
    const origin = join(root, 'origin.git');
    git(root, 'init', '--bare', '-b', 'main', origin);
    git(repo, 'remote', 'add', 'origin', origin);
    git(repo, 'push', '-u', 'origin', 'main');
    return origin;
  };

  it('adds a worktree on a new branch without an origin', async () => {
    await port.worktreeAdd(repo, worktreeAt('a'), 'genba/a', 'main');

    expect(await port.currentBranch(worktreeAt('a'))).toBe('genba/a');
    expect(await port.remoteUrl(repo)).toBeNull();
  });

  it('stacks a child branch on its parent work', async () => {
    await port.worktreeAdd(repo, worktreeAt('a'), 'genba/a', 'main');
    writeFile(join(worktreeAt('a'), 'a.txt'), 'a\n');
    await port.commit(worktreeAt('a'), ['.'], 'feat(test): add a');

    await port.worktreeAdd(repo, worktreeAt('b'), 'genba/b', 'genba/a');

    expect(existsSync(join(worktreeAt('b'), 'a.txt'))).toBe(true);
  });

  it('stacks on a parent that only exists on origin', async () => {
    withOrigin();
    git(repo, 'checkout', '-b', 'genba/parent');
    const parentSha = commitFile(repo, 'parent.txt');
    git(repo, 'push', 'origin', 'genba/parent');
    git(repo, 'checkout', 'main');
    git(repo, 'branch', '-D', 'genba/parent');

    await port.worktreeAdd(repo, worktreeAt('c'), 'genba/c', 'genba/parent');

    expect(await port.headSha(worktreeAt('c'))).toBe(parentSha);
  });

  it('adds no worktree when origin cannot be fetched', async () => {
    git(repo, 'remote', 'add', 'origin', join(root, 'gone.git'));

    const attempt = port.worktreeAdd(repo, worktreeAt('a'), 'genba/a', 'main');

    await expect(attempt).rejects.toThrow('git fetch origin failed');
    expect(existsSync(worktreeAt('a'))).toBe(false);
  });

  it('checkpoints work, leaves cell files out, and pushes', async () => {
    const origin = withOrigin();
    await port.worktreeAdd(repo, worktreeAt('a'), 'genba/a', 'main');
    await port.excludeLocally(worktreeAt('a'), '.cell/');
    writeFile(join(worktreeAt('a'), '.cell', 'report.md'), 'report\n');
    writeFile(join(worktreeAt('a'), 'a.txt'), 'a\n');

    await port.commit(worktreeAt('a'), ['.'], 'feat(test): add a');
    await port.push(worktreeAt('a'), 'genba/a');

    expect(await port.isClean(worktreeAt('a'))).toBe(true);
    expect(git(origin, 'ls-tree', '--name-only', 'genba/a')).toBe(
      'README.md\na.txt',
    );
    expect(await port.remoteUrl(repo)).toBe(origin);
  });

  it('writes the exclude pattern once', async () => {
    await port.excludeLocally(repo, '.cell/');

    await port.excludeLocally(repo, '.cell/');

    const exclude = readFileSync(join(repo, '.git', 'info', 'exclude'), 'utf8');
    expect(
      exclude.split('\n').filter((line) => line === '.cell/'),
    ).toHaveLength(1);
  });

  it('rolls back to a checkpoint', async () => {
    const checkpoint = await port.headSha(repo);
    commitFile(repo, 'later.txt');

    await port.resetHard(repo, checkpoint);

    expect(await port.headSha(repo)).toBe(checkpoint);
    expect(existsSync(join(repo, 'later.txt'))).toBe(false);
    expect(await port.hasCommit(repo, checkpoint)).toBe(true);
    expect(await port.hasCommit(repo, 'f'.repeat(40))).toBe(false);
  });

  it('discards edits and new files but keeps cell files', async () => {
    await port.excludeLocally(repo, '.cell/');
    writeFile(join(repo, '.cell', 'commit.txt'), 'kept\n');
    writeFile(join(repo, 'README.md'), 'edited\n');
    writeFile(join(repo, 'scratch.txt'), 'untracked\n');

    await port.discardChanges(repo);

    expect(await port.status(repo)).toBe('');
    expect(existsSync(join(repo, '.cell', 'commit.txt'))).toBe(true);
  });

  it('removes a worktree and its branch, even if half deleted', async () => {
    await port.worktreeAdd(repo, worktreeAt('a'), 'genba/a', 'main');
    rmSync(join(worktreeAt('a'), '.git'));

    await port.worktreeRemove(repo, worktreeAt('a'));
    await port.deleteBranch(repo, 'genba/a');
    await port.deleteBranch(repo, 'genba/a');

    expect(existsSync(worktreeAt('a'))).toBe(false);
    expect(git(repo, 'branch', '--list', 'genba/a')).toBe('');
  });
});
