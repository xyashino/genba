---
kind: question
priority: medium
evidence: confirmed
status: open
---

# Quota gate is not wired

## Problem

- `checkRunnerQuota` and `defaults.minRemainingUsagePct` exist; Cells send no quotas, daemon ignores them
- `agy` documents `/usage`; print-mode support untested

## Next

- Add optional quota method for runners that support it, or remove gate until then
