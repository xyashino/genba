---
scope: genba
summary: Flatten apps/genba runtimes and adapters into thin shell
why: After cell extraction apps/genba only wires CLI, operator client and standalone, so nested runtimes and adapters dirs add no boundary
date: 2026-11-28
---

- Move `src/runtimes/{cli,operator,standalone}` to `src/{cli,operator,standalone}` as git renames
- Fold `src/adapters/operator-client/` into `src/operator/`; drop empty `src/adapters/`, `src/ports/`, `src/runtimes/`
- Drop `@repo/contract-kit` and `@repo/prompt` from `apps/genba/package.json`; no genba source imports them
- ESLint: domain bans `cli`, `operator`, `standalone`, `@repo/factory`; operator bans cell entrypoints and factory; cli bans factory
- ESLint: operator no longer bans its sibling client import, since the client now lives beside it
- `bin.ts` lazy-imports `operator/main.ts`, `operator/client.ts`, `operator/exit-map.ts`; `cli/main.ts` for everything else
- `docs/architecture.md` already shows the flat `apps/genba/src/` tree; its "Not extracted yet" note is in `decisions/20261127-232334-genba-extract-factory-server.md`, left as history
