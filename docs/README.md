# Genba

Injectable autonomous software factory for any git repo. Wraps existing AI CLIs (`claude`, `codex`, `copilot`, `cursor`, `opencode`, `antigravity`) into repeatable production lines delivering verified Pull/Merge Requests — zero server required on day 1.

## Docs

- [architecture.md](./architecture.md) — Monorepo layout, runtime boundaries, import rules
- [boundaries.md](./boundaries.md) — Runtime ownership matrix, topology, security invariants
- [lines-and-roles.md](./lines-and-roles.md) — Repo-agnostic Lines, `ROLE.md` guards, Forge Andon
- [cli.md](./cli.md) — Command reference, solo and queue flows, order file format, incidents
- [migration.md](./migration.md) — Phased migration plan from `software-factory`

## Core Value

- **60-second injection**: `genba init` auto-detects stack, verify checks, rules, runners, and git forge -> writes one `.genba/config.json`.
- **Repo-agnostic engine**: binary ships templates for Lines (`fast`, `standard`, `feature`) and roles (`planner`, `builder`, `doctor`, `mechanic`); each repo owns its copies in `.genba/`.
- **Lower token waste**: Surgical role context, live `genba operator done` guards.
- **Forge-native**: Opens PR/MR on delivery; pushes WIP Draft PR + `genba:andon` Issue on escalation (`gh` / `glab`).
- **Provable ROI (`genba stats`)**: Planned for Phase 4: First-Pass Yield, Autonomous Rate, Merge Rate.
- **Optional Hub + Web UI**: Local server works standalone; `hub` is opt-in bridge for multi-machine browser visibility.

## Glossary

| Term | Meaning |
| :--- | :--- |
| **Genba** | Single binary: CLI + local loopback server (`127.0.0.1:7072`) owning SQLite, queue, telemetry, and Cells |
| **Cell** | Disposable worker process: 1 Job, 1 git worktree, 1 runner or inspection command |
| **Line** | Workflow in `.genba/lines/` declaring changeover, agents, stations, delivery |
| **Role (`ROLE.md`)** | Executable agent contract (`rules`, `skills`, `outputs`, `guards`) compiled via `@repo/prompt` (`stage: runtime`) |
| **Andon / Incident** | Escalated blocker: opens WIP Draft PR + `genba:andon` Issue on GitHub/GitLab and frees Cell |
| **Mechanic** | Read-only AI triager attempting self-heal before escalating to human |
| **Hub** | Optional thin Web UI bridge: outbound Genba registry, read cache, command outbox (zero execution logic) |
