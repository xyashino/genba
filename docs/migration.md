# Migration Plan from `software-factory`

Phased port order into `genba` — copy battle-tested adapters/packages, rewrite only the repo-first local engine and thin Hub bridge.

## Phases

| Phase | Scope | Source / Action |
| :--- | :--- | :--- |
| **Phase 0: Core Monorepo** | Turborepo, Bun catalog, `pr-ci.yml`, `packages/contract-kit`, `packages/sqlite-kit`, `packages/prompt`, `packages/nitpick`, `packages/eslint-config`, `packages/typescript-config`, `.nitpick/` | **Done** — ported from `software-factory`; `@repo/prompt` wired into `@repo/nitpick` (`stage: sync`) |
| **Phase 1: Unified Contracts & Domain Core** | `packages/contracts`, `apps/genba/src/builtin/`, `apps/genba/src/domain/` | **Done** — unified wire schemas, repo manifest, built-in Lines & `ROLE.md`, DAG, escalation |
| **Phase 2: `apps/genba` Built-ins & Adapters** | `builtin/{lines,roles}` (`with { type: 'text' }`), `ports/`, `adapters/{process,fs,git,runners,operator-endpoint,operator-client,forge,sqlite}` | **Done** — ported process/fs/git/runner/loopback adapters (headless only); fresh `ForgePort` (`gh` + `glab`) and SQLite migration `0001` |
| **Phase 3: Local Engine & CLI** | Local daemon (`127.0.0.1:7072`), Cell runtime, live `ROLE.md` guards, `genba init` auto-detect, CLI, single-binary packaging | **Done** — local-first loop, tested end to end with fake runner and forge; not yet run with real CLIs (see `issues/`) |
| **Phase 4: Yield Controls** | PR merge sync, `genba stats` (OEE); usage storage, cost tracking, and budget caps deferred | New high-value features baked into local SQLite |
| **Phase 5: Optional Thin Hub** | `apps/hub` (outbound Genba registry, read projections, SSE fan-out, command outbox) | Slim bridge for remote Web UI — zero step/retry/Mechanic logic |
| **Phase 6: Optional Web UI** | `apps/web` (fleet, orders, Andon issues with forge links, OEE dashboard) | Port RxJS EDA shell from `software-factory/apps/web` targeting Hub or local loopback |
