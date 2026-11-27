---
kind: decision
priority: medium
evidence: confirmed
status: open
---

# New worktree can start from stale base

## Problem

- `worktreeAdd` fetches, then prefers local base branch over `origin/<base>`
- Local `main` behind remote means agents build on old code and PR may conflict

## Next

- Prefer `origin/<base>` for repo base branch; keep local branch for parent stacking
