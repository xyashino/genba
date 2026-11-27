---
kind: verify
priority: high
evidence: untested
status: open
---

# Never ran against real tools

## Problem

- E2E uses fake `claude` and fake `gh`; no real model, GitHub, or GitLab call was made
- Unchecked: headless runs, whether `claude` finishes a station through `genba operator`, interactive argv, Claude heredoc guidance
- Unchecked: usage formats, `gh` live output, `glab` JSON (`glab` not installed), `opencode run` without `--auto`
- Install scripts ran on Linux x64 only

## Next

- First: one real `claude` order on a throwaway repo
- Then each other runner; mark supported only after pass
