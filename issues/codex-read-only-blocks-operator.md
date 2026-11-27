---
kind: bug
priority: high
evidence: likely
status: open
---

# Codex read mode blocks operator calls

## Problem

- `codex sandbox` 0.172.0 probe: `read-only` and `workspace-write` cannot reach loopback; `workspace-write` + network can
- Read jobs use `--sandbox read-only`, so `done` / `verdict` likely fail
- Not confirmed with real `codex exec`

## Next

- Confirm with real run
- Options: `workspace-write` + network (loses write block), custom permission profile (untested), MCP operator tools (untested)
