---
scope: genba
summary: Add genba ports and IO adapters with forge and SQLite
why: Phase 2 needs every IO boundary built and tested alone before the daemon and Cell
date: 2026-11-27
---

- Add `src/ports/` and port process, fs, git, runner, and loopback adapters from `software-factory/apps/sf`
- Drop herdr, interactive launch, trust files, and `git clone`: headless repo-local engine needs none
- Move the shell heredoc quirk into the Claude adapter
  - Write mode forbids heredoc file writes; read mode requires them because file-edit tools are denied
- Add usage parser hooks for `claude` and `codex` only; other runners report null
- Operator endpoint checks the bearer token and validates `operatorRequestSchema`, new in `@repo/contracts`
- Add `ForgePort` for `gh` and `glab` with remote detection and router
  - Look up open PRs only, so a merged branch PR is never edited; sync base and draft state
  - Hidden body marker keeps one `genba:andon` issue per order
- Add `adapters/sqlite` with hand-written migration `0001` holding usage, cost, and forge URL columns
- Rename the lint boundary from `adapters/db` to `**/adapters/sqlite/**`
- Test forge and runners with executable stubs; `glab` flags checked against docs, not a live CLI
