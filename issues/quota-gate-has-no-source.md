---
kind: question
priority: medium
evidence: confirmed
status: open
---

# Quota gate has no data source

## Problem

- `checkRunnerQuota` needs `remainingPct`; no adapter provides it
- Missing quota allows run
- `agy` documents `/usage` for quota; not run, print-mode support untested

## Next

- Add optional quota method only for runners that support it, or remove gate until then
