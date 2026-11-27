---
scope: genba
summary: Add local daemon, Cell runtime, CLI, and single-binary packaging
why: Phase 3 needs a first standalone order-to-PR loop with no Hub or HQ
date: 2026-11-27
---

- Scheduling, retries, tier escalation, and incidents are pure rules in `domain/schedule.ts`
- Station, `deliver`, `mechanic`, and `escalate` all run as Cell jobs, so only Cells call the forge
- One daemon per repo with state in `.genba-local/`; `GENBA_PORT` overrides 7072
- Daemon API requires bearer tokens and rejects `Origin` and foreign `Host` headers
- Kill before requeue covers the Cell process and its runner process group
  - Deliberate stop refunds the attempt; a crash spends it
  - `abort` also sweeps processes left behind after the runner exits
- Commit after each passed write station; push only at delivery or escalation
  - `restart_from_scratch` force-pushes with a lease on the replaced commit
- Use `Bun.serve`, not Hono: no new dependency for a loopback API
- Inject the operator client from `bin.ts` so the operator lint boundary stays
- Make verdict `feedback` and incident `diagnosis` optional; the Cell reads role outputs
- Refuse read roles on runners whose read mode restricts nothing
- Strip `GENBA_*` from agents, setup, and checks; this is not a sandbox
- Match `forbidPaths` with real globs
- Add job assignment and outcome contracts, and migration `0002` for scheduler state
- Port `install.mjs` and `install-release.sh`; no release workflow yet
- E2E compiles the binary and runs it on a Makefile repo with fake `claude` and `gh`
- `genba stats` and quota gating stay out of Phase 3
