---
kind: decision
priority: high
evidence: confirmed
status: open
---

# Agents can read daemon and forge credentials

## Problem

- Agent runs as your user; worktree sits inside repo, so `../../.genba-local/cli-token` is readable
- With it, agent can resolve incidents or cancel orders
- Agent can also run `git push` / `gh` itself with your login

## Next

- Options: separate OS user or container per Cell, data dir outside repo (obscurity only), runner sandbox flags
- Until then: trusted repos and orders only
