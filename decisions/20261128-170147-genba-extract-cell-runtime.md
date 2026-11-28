---
scope: genba/cell
summary: Move cell runtime loop and stations into @repo/cell
why: apps/genba still held the Cell loop, worktree, stations, and guards; packages/cell must run them without the app
date: 2026-11-28
---

- Move `apps/genba/src/runtimes/cell/` to `packages/cell/src/runtime/` with `git mv`; the old directory is gone
- Export `@repo/cell/main`, `@repo/cell/loop`, and `@repo/cell/deps` as explicit `exports` entries; the `./*` wildcard stays
- Built-in role templates stay in `apps/genba`; they reach the runtime as `CellDeps.builtinRoles`
  - `bin.ts` passes `BUILTIN_ROLES` to `runCell`; standalone `run --once` passes it to `cellDepsOf`
- `RULE_FILES` moves from `apps/genba/src/domain/detect-project.ts` into `station-operator.ts`
- Self-imports of `@repo/cell/*` inside the package become relative `.ts` imports
- ESLint: the cell runtime rule leaves `apps/genba`; `packages/cell` already forbids factory, sqlite-kit, and genba
- `docs/architecture.md` lists the runtime under `packages/cell`
