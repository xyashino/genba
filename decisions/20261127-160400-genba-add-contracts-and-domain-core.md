---
scope: genba
summary: Add unified @repo/contracts and pure genba domain core
why: Establish single wire contract and IO-free lines, roles, and DAG logic
date: 2026-11-27
---

- Add `packages/contracts` (`@repo/contracts`) unifying orders, steps, jobs with usage/cost, incidents with forge links, operator verbs, and hub sync/outbox
- Scaffold `apps/genba` with real built-in `.yml` lines (`fast`, `standard`, `feature`) and `ROLE.md` contracts (`planner`, `builder`, `doctor`, `mechanic`) imported via `with { type: 'text' }`
- Implement pure IO-free domain modules in `apps/genba/src/domain/`
  - Repo manifest parser, line hook binder, and retry model escalation ladder
  - `@repo/prompt` runtime role compiler and live guard validator
  - Order markdown parser, single-parent DAG resolver, and Cell runner usage quota gate
- Add unit tests covering contracts and all pure domain modules
