---
scope: genba
summary: Add clean architecture doc and ESLint runtime boundary rules
why: Lock hexagonal runtime isolation before Phase 2 adapter and engine work
date: 2026-11-27
---

- Add `docs/architecture.md` locking monorepo boundaries and runtime layout
  - Standalone `apps/hub` (`genba-hub`) binary, never embedded in `genba`
  - Hexagonal `apps/genba` (`domain`, `builtin`, `ports`, `adapters`, `runtimes`)
  - Vertical-slice EDA `apps/web` matching `gon-stack`
- Refine `apps/genba` edges before Phase 2
  - Split mutating execution (`runtimes/cell`) from read-only host probes (`runtimes/cli`)
  - Add `ports/fs.port.ts` and `runtimes/daemon/ports/store.port.ts`
  - Split `runtimes/cell` stations into flat files and use dynamic `import()` in `bin.ts`
- Enforce 4 `no-restricted-imports` runtime boundary rules in `apps/genba/eslint.config.mjs`
- Link `docs/architecture.md` in `README.md`, `docs/README.md`, and `.nitpick/entry.md`
