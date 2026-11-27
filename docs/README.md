# Genba

Injectable autonomous software factory for any git repo. Wraps existing AI CLIs (`claude`, `codex`, `copilot`, `cursor`, `opencode`, `antigravity`) into repeatable production lines delivering verified Pull/Merge Requests — zero server required on day 1.

## Docs

- [architecture.md](./architecture.md) — Monorepo layout, Option 1 single-binary package split, dependency rules
- [boundaries.md](./boundaries.md) — Hub / Factory / Cell / Line / Order boundaries, worktree ownership, invariants
- [lines-and-roles.md](./lines-and-roles.md) — Repo-agnostic Lines, `ROLE.md` guards, Forge Andon
- [migration.md](./migration.md) — Phased migration plan from `software-factory`

## Core Value

- **60-second injection**: `genba init` auto-detects stack, verify checks, rules, runners, and git forge -> writes one `.genba/config.json`.
- **Repo-agnostic engine**: binary ships templates for Lines (`fast`, `standard`, `feature`) and roles (`planner`, `builder`, `doctor`, `mechanic`); each repo owns its copies in `.genba/`.
- **Lower token waste**: Surgical role context, live `genba operator done` guards.
- **Forge-native**: Opens PR/MR on delivery; pushes WIP Draft PR + `genba:andon` Issue on escalation (`gh` / `glab`).
- **Provable ROI (`genba stats`)**: Planned for Phase 4: First-Pass Yield, Autonomous Rate, Merge Rate.
- **Optional Hub + Web UI**: Local Factory works standalone; `hub` is opt-in bridge for multi-machine browser visibility.

## Glossary

| Term | Meaning |
| :--- | :--- |
| **Genba** | Single compiled binary (`apps/genba`): CLI, `operator` client, and local Factory/Cell runtimes |
| **Factory** | Local control plane (`packages/factory`, Hono + SQLite, `127.0.0.1:7072`): owns queue, scheduling, retries, and Cell supervision for 1 repo |
| **Cell** | Disposable worker slot (`packages/cell`, `cell-1..N`, 1 `herdr` workspace): claims 1 Job at a time, attaches to the Order's worktree, runs 1 station |
| **Line** | Static workflow blueprint in `.genba/lines/` (`packages/line`) declaring changeover, agents, stations, and delivery rules |
| **Plan** | Optional batch/epic grouping `1..N` related Orders via `planId` (may form a `depends_on` / `parentSlug` DAG) |
| **Order** | Single deliverable unit of work moving through a Line; owns 1 git branch (`genba/<slug>`), 1 worktree (`.worktrees/<slug>/`), and 1 PR |
| **Step** | One station instance (`order_steps`) along an Order's Line, tracking attempts and feedback |
| **Job** | One concrete execution attempt (`jobs`) of a Step, claimed and executed by 1 Cell |
| **Role (`ROLE.md`)** | Executable agent contract (`rules`, `skills`, `outputs`, `guards`) compiled via `@repo/prompt` (`stage: runtime`) |
| **Andon / Incident** | Escalated blocker: opens WIP Draft PR + `genba:andon` Issue on GitHub/GitLab and frees Cell |
| **Mechanic** | Read-only AI triager attempting self-heal before escalating to human |
| **Hub** | Optional thin multi-factory bridge (`apps/hub`): outbound Factory registry, read projections, SSE fan-out, command outbox (zero execution logic) |
