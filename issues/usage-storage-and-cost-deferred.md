---
kind: question
priority: low
evidence: confirmed
status: open
---

# Usage storage and cost deferred

## Problem

- `parseOutput` returns usage for `claude` and `codex`; nothing consumes or stores it
- No cost, no budget caps

## Next

- Revisit in Phase 4; unknown usage must never count as zero
