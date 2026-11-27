---
scope: genba
summary: Move the local server into packages/factory, laid out like sf HQ
why: apps/genba mixed server, execution, and CLI; the server needs its own boundary and shape
date: 2026-11-27
---

- `packages/factory`: Hono app, scheduler, supervisor, SQLite; app uses only `start`, `embedded`, `cell-homes`
- HQ shape: contract per endpoint with output check, `cliProcedure` / `cellProcedure`, thin routes, `app.request()` tests
- `packages/line` (definitions, station ids) and `packages/host` (host I/O) hold what app and factory share
- Packages, not apps: one binary, and apps never import another app's `src/`
- Kept `StorePort`; HQ procedures query Drizzle directly, rewriting queries was out of scope
- `run --once` now calls the real routes in process, so replies match daemon replies
- Invalid request message is now `invalid request <section>:` plus Zod text; error `type` values unchanged
- JSON bodies now need `content-type: application/json`; oversize `content-length` replies 413
- Added contracts for health, shutdown, scale, runner, cancel; `getOrderContract` moved to `jobs.contract` with `jobs`
- Cell execution stays in `apps/genba`; hub deferred
