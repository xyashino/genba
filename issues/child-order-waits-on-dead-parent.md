---
kind: decision
priority: low
evidence: confirmed
status: open
---

# Child waits forever on cancelled or blocked parent

## Problem

- Child is claimable only after parent is `delivered` or `merged`
- Queue shows it as `queued` with no reason

## Next

- Show wait reason; decide whether cancelling parent cancels children
