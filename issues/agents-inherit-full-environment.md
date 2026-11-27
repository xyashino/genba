---
kind: bug
priority: high
evidence: confirmed
status: open
---

# Agents inherit most of parent environment

## Problem

- Fixed: `GENBA_*` stripped from agents, setup, and checks
- Still inherited: everything else, including forge and cloud tokens in your shell

## Next

- Decide allowlist per runner (CLI auth variables differ) or document as accepted risk
