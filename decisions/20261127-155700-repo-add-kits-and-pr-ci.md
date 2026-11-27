---
scope: repo
summary: Add contract-kit, sqlite-kit, and PR CI workflow to finish Phase 0
why: Complete leaf package ports and automated PR verification before Phase 1
date: 2026-11-27
---

- Port `packages/contract-kit` (`@repo/contract-kit`) from `software-factory/packages/zod-contract-kit`
- Port `packages/sqlite-kit` (`@repo/sqlite-kit`) from `software-factory/packages/bun-sqlite-kit` and add `drizzle-orm` to root catalog
- Add `.github/workflows/pr-ci.yml` running `bun install --frozen-lockfile` and the Turborepo verification gate
- Add `contract-kit` and `sqlite-kit` to `.nitpick/config.ts` decision-log scopes and update `README.md` / `docs/migration.md`
