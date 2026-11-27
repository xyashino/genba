---
scope: genba
summary: Add opt-in herdr panes for interactive agent runs
why: Watching and answering agents live is preferred over headless runs
date: 2026-11-27
---

- `herdr: true` in config runs agents with `buildCommand` in herdr tabs; hooks and gates stay headless
- Removed line `headless` key: config is the one switch; old lines with it fail to parse
- Daemon tracks the launcher path so crash recovery still kills the agent group
- A closed tab ends the run instead of waiting for the timeout
- Pane env: herdr server env, minus `GENBA_*`, plus Cell `PATH` and operator vars
- Did not port `sf` auto-accept of claude and antigravity folder trust: it edits global user settings
- Removed resolved issue `interactive-mode-has-no-runner`
