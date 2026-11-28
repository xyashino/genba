---
scope: genba/cell
summary: Move cell runtime from apps/genba into packages/cell
why: Cell loop, worktrees, stations and guards belong with @repo/cell so apps/genba only wires them
date: 2026-11-28
---

- Move `apps/genba/src/runtimes/cell/` (11 files) to `packages/cell/src/runtime/` as git renames
- Move built-in `ROLE.md` templates to `packages/cell/src/builtin/roles/`; `BUILTIN_ROLES` lives in `@repo/cell/builtin/registry`
  - `apps/genba` keeps `BUILTIN_LINES` for `init` templates and imports roles from `@repo/cell`
- Move `RULE_FILES` into `station-operator.ts`; drop it from `apps/genba/src/domain/detect-project.ts`
- Runtime imports inside `packages/cell` are relative; the package imports neither `@repo/genba` nor `@repo/factory`
- Export `@repo/cell/main`, `@repo/cell/loop`, and `@repo/cell/deps` in `packages/cell/package.json`
- `apps/genba/src/bin.ts` (`__cell`) and `runtimes/standalone/main.ts` import the runtime from `@repo/cell`
- ESLint: cell domain bans `**/runtime/**`; genba operator rule bans the cell entrypoints and `@repo/cell/runtime/**`; `runtimes/cell` rule removed
- `docs/architecture.md` `packages/cell` section describes the runtime as moved
