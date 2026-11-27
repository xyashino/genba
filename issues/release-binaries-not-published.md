---
kind: task
priority: medium
evidence: confirmed
status: open
---

# No release publishes binaries

## Problem

- `scripts/install-release.sh` expects `genba-<os>-<arch>` and `SHA256SUMS` on GitHub releases
- No release workflow exists; script tested with `file://` only

## Next

- Add release workflow building `linux-x64`, `linux-arm64`, `darwin-arm64`
