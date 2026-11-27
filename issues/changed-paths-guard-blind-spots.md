---
kind: bug
priority: high
evidence: confirmed
status: open
---

# Guard misses ignored files and `.git/` writes

## Problem

- Guard compares against station start commit, so agent commits are caught
- Ignored files and writes inside `.git/` stay invisible; `forbidPaths: .git/**` cannot trigger
- Read stations are reset afterwards, but ignored and `.git/` changes survive

## Next

- Decide how Cell detects them before relying on guard as read-only enforcement
