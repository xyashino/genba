---
scope: genba
summary: Flatten genba shell and keep operator off cell
why: After cell extraction genba is a thin shell; operator must lazy-load without @repo/cell or @repo/factory, so shared env names moved to contracts
date: 2026-11-28
---

- Flatten `src/runtimes/{cli,operator,standalone}` to `src/{cli,operator,standalone}` as git renames
- Fold `src/adapters/operator-client/` into `src/operator/`; drop empty `src/adapters/`, `src/ports/`, `src/runtimes/`
- Drop `@repo/contract-kit` and `@repo/prompt` from `apps/genba/package.json`; no genba source imports them
- Move `OPERATOR_URL_ENV` and `CYCLE_TOKEN_ENV` from `packages/cell/src/ports/operator.port.ts` to `packages/contracts/src/operator.contract.ts`
- Move `OperatorUnreachableError`, `OperatorReply` and `OperatorClientPort` from cell port into `apps/genba/src/operator/client.ts`; cell never used them
- `bin.ts` lazy-imports `operator/main.ts`, `operator/client.ts`, `operator/exit-map.ts`; `cli/main.ts` for everything else
- `bin.ts` reads the env names from `@repo/contracts/operator.contract`; the operator branch no longer imports `@repo/cell`
- ESLint: domain bans `../cli/**`, `../operator/**`, `../standalone/**`, `@repo/factory/**`; cli bans `@repo/factory/**`
- ESLint: operator bans all of `@repo/cell/**` and `@repo/factory/**`; no sibling-client ban, the client lives beside it
- Cell loopback adapter and fake runner import the env names from `@repo/contracts/operator.contract`
- `docs/architecture.md`: drop the stale `GENBA --> packages/prompt` edge; ESLint paragraph says operator stays off `@repo/cell` entirely
