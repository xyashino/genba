---
kind: bug
priority: high
evidence: confirmed
status: open
---

# Role commands do not satisfy operator contracts

## Problem

- `doctor` says `verdict pass|fail`; contract requires `feedback`
- `mechanic` says `incident <resolution>`; contract requires `diagnosis`

## Next

- Suggested: make fields optional, Cell fills from `audit.md` / `diagnosis.md`
