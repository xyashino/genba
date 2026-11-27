---
kind: bug
priority: medium
evidence: confirmed
status: open
---

# `forbidPaths` silently ignores most globs

## Problem

- `domain/role.ts` matches only exact path or trailing `/**`
- Probe: `*.env`, `**/*.pem`, `secrets/*` produced no violation for matching files

## Next

- Use real glob matcher (for example `Bun.Glob`) or reject unsupported patterns in `parseRole`
