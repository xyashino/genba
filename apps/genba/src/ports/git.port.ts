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
  /**
   * `replacing`: the commit this branch's new history discards. The remote branch is
   * overwritten only while it still points there, so commits pushed by others survive.
   */
  push(cwd: string, branch: string, replacing?: string): Promise<void>;
  resetHard(cwd: string, sha: string): Promise<void>;
  discardChanges(cwd: string): Promise<void>;
  /** the origin branch ref when it exists, else the local one */
  baseRef(cwd: string, baseBranch: string): Promise<string>;
  mergeBase(cwd: string, ref: string): Promise<string>;
  /** tracked changes since `sinceSha` (committed or not) plus untracked files */
  changedPaths(cwd: string, sinceSha: string): Promise<string[]>;
  /** files committed since `sinceSha` that did not exist then, under `dir` */
  addedPaths(cwd: string, sinceSha: string, dir: string): Promise<string[]>;
  diffSince(cwd: string, sha: string): Promise<string>;
  commitCountSince(cwd: string, sha: string): Promise<number>;
  commitAll(cwd: string, message: string, allowEmpty?: boolean): Promise<void>;
  /** commit of a local branch, or null when there is none */
  branchHead(repoRoot: string, branch: string): Promise<string | null>;
  worktreeAttach(repoRoot: string, path: string, branch: string): Promise<void>;
};
