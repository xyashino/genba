---
kind: bug
priority: high
evidence: confirmed
status: open
---

# `antigravity` and `opencode` ignore read mode

## Problem

- Both adapters build same argv for `read` and `write`
- `antigravity` passes `--dangerously-skip-permissions`, so read job has no write block

## Next

- Find real restriction flags (`agy --help` lists `--mode plan`, `--sandbox`; untested)
- Until then reject both for read roles
