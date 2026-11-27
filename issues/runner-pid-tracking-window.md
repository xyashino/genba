---
kind: bug
priority: low
evidence: likely
status: open
---

# Runner can escape if Cell dies right after start

## Problem

- Cell reports runner pid after spawn
- `SIGKILL` of Cell between spawn and report leaves runner running while job is requeued

## Next

- Start runner paused until daemon acknowledges pid, or have daemon spawn guard process
