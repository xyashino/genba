---
scope: genba
summary: Fall back to repo base branch when stacked parent branch is deleted
why: Merged parent PRs delete their remote branch, breaking child PR creation against the stale parentBranch
date: 2026-11-28
---

- Add `hasRemoteBranch(cwd, branch)` (`git ls-remote --exit-code --heads origin <branch>`) to `packages/cell/src/ports/git.port.ts` and `packages/cell/src/adapters/git/git.ts`
- Fall back to `manifest.git.baseBranch` in `apps/genba/src/runtimes/cell/worktree.ts` when `assignment.parentBranch` no longer exists on `origin`
