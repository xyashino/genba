---
kind: decision
priority: high
evidence: confirmed
status: open
---

# Same `read` permission, different guarantees

## Problem

- `claude`: edit tools denied, shell can still write
- `codex`: sandbox
- `cursor` plan mode and `copilot` `--deny-tool write`: effect and operator access untested

## Next

- Suggested: adapter reports capability (`canCallOperator`, `fileProtection: sandbox | tool-deny | none`)
- Cell fails early, `genba doctor` shows it; changed-paths check still runs for every read job
