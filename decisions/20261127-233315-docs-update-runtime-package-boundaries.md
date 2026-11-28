---
scope: docs
summary: Define Hub, Factory, Cell, Line boundaries and Option 1 split
why: Lock runtime, worktree, and package boundaries for single-binary genba before splitting factory and cell
date: 2026-11-27
---

- Document two orthogonal axes in `docs/boundaries.md`
  - Infrastructure axis: Hub (multi-repo), Factory (1 per repo, Hono + SQLite), Cell (herdr workspace slot)
  - Work axis: Line (static blueprint), Plan (optional Order batch), Order (owns branch, worktree, PR), Step, Job
- Lock worktree ownership to Order rather than Cell, Line, Plan, or Job
- Document Option 1 single-binary packaging model in `docs/architecture.md`
  - Keep 3 thin deployables in `apps/`: `genba`, `hub`, `web`
  - Place Hono `factory` and worker `cell` in `packages/` alongside `line`, `host`, and `contracts`
  - Preserve zero-port `--once` mode via `@repo/factory/embedded` (`app.request()` on `:memory:` SQLite)
  - Specify package dependency graph and forbidden import edges
- Align `docs/README.md` glossary with Factory, Cell, Line, Plan, Order, Step, Job, and Hub
