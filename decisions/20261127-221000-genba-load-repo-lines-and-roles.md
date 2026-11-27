---
scope: genba
summary: Repo-owned software-factory style lines with changeover hooks
why: Repos must own lines and roles, with per-line control as in software-factory
date: 2026-11-27
---

- `genba init` writes `.genba/lines/*.yml` and `.genba/roles/*.md`; `--force` overwrites
- Daemon and Cell read repo copies only, from repo root, not worktrees; no fallback
- Lines declare `operators`, `mechanic`, station `exec`, timeouts, `deliver.requireAdr`
- `changeover.root` (main checkout, locked across Cells) and `changeover.worktree` replace `workspace.setup`
- Worktrees now start from `origin/<base>` so a root fetch takes effect; unpushed local base commits are excluded
- `permission` moves from role `mode` to line operator
- Headless only: `headless: false` rejected; unknown line keys rejected
- Removed `tiers`, `checks`, `workspace`, `stationTimeoutMinutes` from config, and retry model escalation; job `tier` stays null
- Breaking: rerun `genba init --force`; old config keys are ignored, old lines fail to parse
- `genba doctor` checks lines, roles, quality gates, line runners
- Not ported: `sf` role file format, interactive runs, `gemini` line (antigravity cannot run read roles)
- Roles list `rules` and `skills`; Cell adds file paths to every prompt and fails on a missing file after changeover
- Removed `context.rules` and `context.conventions`: text was inlined for all roles, twice here
- Template role instructions adapted from `sf` operators
- Template roles require no output headings; `requiredHeadings` stays optional for custom roles
- Config `rules` / `skills` set the guidance folders, default `.agents/`; `sf` declares these keys but reads only `project`
- Dropped `.git/**` guard: git never reports those paths; only builder keeps `requireDiff`
- A rule entry may be a folder (all its files) or a file; skills still point at `SKILL.md`
- This repo: `requireAdr` on `standard` and `feature`
