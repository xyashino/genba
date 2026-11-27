---
kind: bug
priority: high
evidence: confirmed
status: open
---

# `git status` guard misses some writes

## Problem

- `git status --porcelain` does not report ignored files or writes inside `.git/`
- Role `forbidPaths: .git/**` cannot trigger from git status
- Cell collection of `changedPaths` not built yet

## Next

- Decide how Cell detects ignored and `.git/` writes before relying on guard as read-only enforcement
