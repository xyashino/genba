---
scope: repo
summary: Bootstrap genba Turborepo with ported core packages
why: Start genba repo-first with shared prompt, nitpick, lint, and TS tooling
date: 2026-11-27
---

- Port `packages/prompt`, `packages/nitpick`, `packages/eslint-config`, `packages/typescript-config`, and `.nitpick/` from `software-factory`
- Configure Bun workspace catalog, `turbo.json`, Prettier, Husky hooks, and `scripts/prepare.mjs`
- Update `.nitpick/config.ts` scopes and `.nitpick/entry.md` for `genba`
