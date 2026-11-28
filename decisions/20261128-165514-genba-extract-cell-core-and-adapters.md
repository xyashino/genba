---
scope: genba/cell
summary: Extract cell domain, ports, and IO adapters into @repo/cell
why: Split worker domain and adapters out of apps/genba before extracting the cell runtime
date: 2026-11-28
---

- Add `packages/cell` (`@repo/cell`) with domain, ports, adapters, and unit tests
  - `domain/`: role, guidance, pr-body, quota
  - `ports/`: git, forge, runner, operator, loopback-api
  - `adapters/`: git, forge, runners, operator-endpoint, http, process/child-env
- Add `@repo/cell/probes` for CLI `init`, `doctor`, and `genba test pr` (git, forge, runner catalog)
  - Const and type aliases, not `export from`: shared lint bans barrel exports
- Keep `apps/genba/src/runtimes/cell/` in place; it imports moved modules via `@repo/cell/*`
- Split `role.test.ts`: contract tests move to `packages/cell` with inline fixtures; builtin role and init template tests stay in `apps/genba`
- Move test fakes to `packages/cell/src/__tests__/support/`; genba e2e and timeline tests import them
- ESLint: cell never imports factory, sqlite-kit, or genba; domain has no adapters, runtimes, or node fs, child_process, net, http
