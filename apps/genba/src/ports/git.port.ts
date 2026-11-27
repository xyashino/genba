export type GitPort = {
  currentBranch(cwd: string): Promise<string>;
  isClean(cwd: string): Promise<boolean>;
  status(cwd: string): Promise<string>;
  headSha(cwd: string): Promise<string>;
  hasCommit(cwd: string, sha: string): Promise<boolean>;
  remoteUrl(cwd: string): Promise<string | null>;
  worktreeAdd(
    repoRoot: string,
    path: string,
    branch: string,
    baseBranch: string,
  ): Promise<void>;
  worktreeRemove(repoRoot: string, path: string): Promise<void>;
  deleteBranch(repoRoot: string, branch: string): Promise<void>;
  excludeLocally(worktree: string, pattern: string): Promise<void>;
  commit(cwd: string, paths: readonly string[], message: string): Promise<void>;
  push(cwd: string, branch: string): Promise<void>;
  resetHard(cwd: string, sha: string): Promise<void>;
  discardChanges(cwd: string): Promise<void>;
};
