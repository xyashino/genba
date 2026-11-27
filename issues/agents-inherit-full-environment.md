---
kind: bug
priority: high
evidence: confirmed
status: open
---

# Agents inherit full parent environment

## Problem

- `adapters/runners/headless.ts` spawns with `{ ...process.env, ...spec.env }`
- Conflicts with `docs/boundaries.md` invariant 1: agents only see operator URL and cycle token

## Next

- Pass allowlisted env to agents, or change invariant to say what is really isolated
