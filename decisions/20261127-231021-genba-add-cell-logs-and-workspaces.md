---
scope: genba
summary: Add named Cells with timelines, herdr workspaces and full watch
why: Logs and workspaces should follow each Cell and attempt files must outlive it
date: 2026-11-27
---

- Cells named `cell-1`..`cell-N`; scale down removes highest first, even when busy
- Timeline is a JSONL file per Cell, not SQLite: it lives and dies with the Cell
- Crashed Cell timeline kept in `crash.jsonl` until its slot is removed
- `genba watch --full` reads files, with `--cell` and `--order` filters; strips control characters
- With `herdr`, one workspace per Cell, first tab runs full watch, last agent tab stays open
- Workspaces carry project and repo hash; only recorded ids are closed
- Station files copied to `.genba-local/runs/` per job with mode 0600; pane launchers skipped
- `genba run --once` runs one order in process: in-memory queue, temporary `once-<hex>` Cell, no daemon
- New `runtimes/standalone` composes daemon procedures and the Cell loop; the loop is unchanged
- Once workspace closes on delivery or Ctrl+C, stays when blocked; `kill -9` can leave it and the agent
