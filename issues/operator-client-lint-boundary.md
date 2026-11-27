---
kind: decision
priority: medium
evidence: confirmed
status: open
---

# Operator runtime cannot import its client

## Problem

- Lint forbids `src/runtimes/operator/**` importing `../../adapters/**`
- Client lives in `adapters/operator-client`

## Next

- Options: `bin.ts` injects client, lint exception for `operator-client`, or move client
