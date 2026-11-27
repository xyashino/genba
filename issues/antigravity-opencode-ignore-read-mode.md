---
kind: bug
priority: medium
evidence: confirmed
status: open
---

# `antigravity` and `opencode` have no read mode

## Problem

- Both build same argv for `read` and `write`
- Cell now refuses them for read roles (`restrictsReadMode: false`), so `standard` and `feature` Lines cannot use them there

## Next

- Find real restriction flags (`agy --help` lists `--mode plan`, `--sandbox`; untested)
