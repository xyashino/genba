---
scope: genba
summary: Move operator env names to contracts so operator skips cell
why: genba operator must lazy-load without @repo/cell, yet cell and the operator both need the GENBA_OPERATOR_URL and GENBA_CYCLE_TOKEN names
date: 2026-11-28
---

- Move `OPERATOR_URL_ENV` and `CYCLE_TOKEN_ENV` from `packages/cell/src/ports/operator.port.ts` to `packages/contracts/src/operator.contract.ts`
- Move `OperatorUnreachableError`, `OperatorReply` and `OperatorClientPort` from cell port into `apps/genba/src/operator/client.ts`; cell never used them
- `bin.ts` reads the env names from `@repo/contracts/operator.contract`; the operator branch no longer imports `@repo/cell`
- ESLint: operator bans all of `@repo/cell/**` and `@repo/factory/**`
- Cell loopback adapter and fake runner import the env names from `@repo/contracts/operator.contract`
- `docs/architecture.md`: drop the stale `GENBA --> packages/prompt` edge; ESLint paragraph says operator stays off `@repo/cell` entirely
