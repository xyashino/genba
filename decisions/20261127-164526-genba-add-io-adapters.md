---
scope: genba
summary: Add genba ports and IO adapters with forge and SQLite
why: Phase 2 needs every IO boundary built and tested alone before the daemon and Cell
date: 2026-11-27
---

- Add `src/ports/` and port process, fs, git, runner, and loopback adapters from `software-factory/apps/sf`
- Drop herdr, the interactive runner, trust files, and `git clone`: headless repo-local engine needs none
- Headless runs always use `buildHeadlessCommand`, required on every runner
  - Only `claude` and `antigravity` return argv different from `buildCommand`
- Move the shell heredoc quirk into the Claude adapter
  - Write mode forbids heredoc file writes; read mode requires them because file-edit tools are denied
- Adapters map run logs to one `RunnerReport` through optional `parseOutput`
  - Only `claude` and `codex` support token usage; others omit it
- Skip storing token usage and measuring USD cost for now: no job contract fields or columns
- Operator endpoint checks the bearer token and validates `operatorRequestSchema`, new in `@repo/contracts`
- Add `ForgePort` for `gh` and `glab` with remote detection and router
  - Look up open PRs only, so a merged branch PR is never edited; sync base and draft state
  - Hidden body marker keeps one `genba:andon` issue per order
- Add `adapters/sqlite` with hand-written migration `0001` holding job runner, duration, and forge URL columns
- Rename the lint boundary from `adapters/db` to `**/adapters/sqlite/**`
- Test forge and runners with executable stubs; `glab` flags checked against docs, not a live CLI
- Relative imports use the real `.ts` path repo-wide; `rewriteRelativeImportExtensions` keeps emitted `nitpick` and `prompt` output on `.js`
- Add `issues/` with one file per open bug, decision, or question, tagged by priority and evidence
  - Visible folder next to `decisions/`, linked from `.nitpick/entry.md`
