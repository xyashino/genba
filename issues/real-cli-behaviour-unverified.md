---
kind: verify
priority: high
evidence: untested
status: open
---

# Adapters never ran against real tools

## Problem

- Tests use fake runner and fake `gh` / `glab`
- Unchecked: headless runs, interactive `claude` / `antigravity`, Claude heredoc guidance
- Unchecked: `claude` / `codex` usage formats, `glab` JSON and create output (`glab` not installed)
- `opencode run` has no `--auto`; may block on approval

## Next

- Run each in throwaway repo; mark runner supported only after pass
