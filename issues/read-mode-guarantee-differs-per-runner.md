---
kind: decision
priority: medium
evidence: confirmed
status: open
---

# Same `read` permission, different guarantees

## Problem

- `restrictsReadMode` is only yes / no
- `claude`: edit tools denied, shell can write
- `codex` sandbox; `cursor` plan mode and `copilot` `--deny-tool write` untested, including operator access

## Next

- Report `canCallOperator` and protection level per adapter, from real runs
