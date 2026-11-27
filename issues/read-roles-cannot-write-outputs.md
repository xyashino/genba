---
kind: decision
priority: high
evidence: confirmed
status: open
---

# Read roles must write output files

## Problem

- `planner`, `doctor`, `mechanic` are `mode: read` but require `plan.md`, `audit.md`, `diagnosis.md`
- Claude works around with shell heredoc (untested live); Codex read-only sandbox should block writes

## Next

- Suggested: `genba operator write <output-name>` reading stdin; Cell maps name to path, rejects unknown names
- Does not fix [codex-read-only-blocks-operator](./codex-read-only-blocks-operator.md)
