---
scope: repo
summary: Install workspace deps, hooks, lockfile and genba config
why: Fresh checkout needs deps, hooks, a lockfile and a .genba manifest
date: 2026-11-27
---

- Ran `bun install` with bun 1.4.4 from `packageManager`
- Husky hooks registered via `prepare`; `core.hooksPath` points to `.husky`
- `bun.lock` gains the `genba` bin entry declared in `apps/genba/package.json`
- Ran `genba init` from repo root; wrote `.genba/config.json` (stack node/bun, verify `bun run ci:verify`, runner claude)
- `genba doctor` passes; daemon not running, `.genba-local/` and worktrees excluded locally
- `nitpick:check` passes for generated files
- Barrel exports banned by ESLint `no-restricted-syntax` in `packages/eslint-config/base.js`; `coding-no-barrel-export` rule removed from nitpick
- `as unknown as` flagged and `any` banned in `packages/eslint-config/base.js`; `ts-unknown-as` rule removed from nitpick
