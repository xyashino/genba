---
kind: decision
priority: medium
evidence: likely
status: open
---

# Push after rollback likely rejected

## Problem

- `GitPort.push` has no force option
- After `resetHard` drops already pushed commits, push is non-fast-forward

## Next

- Decide: `--force-with-lease` on Cell-owned branches, or never roll back pushed commits
