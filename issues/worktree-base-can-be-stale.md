---
kind: decision
priority: medium
evidence: confirmed
status: open
---

# New worktree can start from stale base

## Problem

- `worktreeAdd` fetches, then prefers local base branch over `origin/<base>`
- Behaviour copied from `sf`

## Next

- Decide when `origin/<base>` wins, keeping parent-branch stacking working
