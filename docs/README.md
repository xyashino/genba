# Genba

Injectable autonomous software factory for any git repo. Wraps existing AI CLIs (`claude`, `codex`, `gemini`, `opencode`, `cursor`) into repeatable production lines delivering verified Pull/Merge Requests — zero server required on day 1.

## Docs

- [boundaries.md](./boundaries.md) — Runtime ownership matrix, topology, security invariants
- [lines-and-roles.md](./lines-and-roles.md) — Repo-agnostic Lines, `ROLE.md` guards, Forge Andon
- [migration.md](./migration.md) — Phased migration plan from `software-factory`

## Core Value

- **60-second injection**: `genba init` auto-detects stack, verify checks, rules, runners, and git forge -> writes one `.genba/config.json`.
- **Repo-agnostic engine**: Built-in Lines (`fast`, `standard`, `feature`) and `ROLE.md` (`planner`, `builder`, `doctor`, `mechanic`) ship inside the binary.
- **Lower token waste**: Surgical role context, live `genba operator done` guards, cheap-first retry escalation ladder, hard budget caps.
- **Forge-native**: Opens PR/MR on delivery; pushes WIP Draft PR + `genba:andon` Issue on escalation (`gh` / `glab`).
- **Provable ROI (`genba stats`)**: Tracks per-job tokens/cost, First-Pass Yield, Autonomous Rate, First-Pass Merge Rate, Waste Rate, Cost per Merged PR.
- **Optional Hub + Web UI**: Local server works standalone; `hub` is opt-in bridge for multi-machine browser visibility.

## Glossary

| Term | Meaning |
| :--- | :--- |
| **Genba** | Single binary: CLI + local loopback server (`127.0.0.1:7072`) owning SQLite, queue, telemetry, and Cells |
| **Cell** | Disposable worker process: 1 Job, 1 git worktree, 1 runner or inspection command |
| **Line** | Built-in repo-agnostic workflow (`fast`, `standard`, `feature`) binding repo `setup` and `checks.verify` |
| **Role (`ROLE.md`)** | Executable agent contract (`mode`, `outputs`, `guards`) compiled via `@repo/prompt` (`stage: runtime`) |
| **Andon / Incident** | Escalated blocker: opens WIP Draft PR + `genba:andon` Issue on GitHub/GitLab and frees Cell |
| **Mechanic** | Read-only AI triager attempting self-heal before escalating to human |
| **Hub** | Optional thin Web UI bridge: outbound Genba registry, read cache, command outbox (zero execution logic) |
