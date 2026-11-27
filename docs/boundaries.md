# Runtime Boundaries

Strict ownership across `genba` runtimes. Terms: [README.md](./README.md#glossary).

## Ownership Matrix

| Runtime | Owns (Source of Truth) | Never Owns | Talks To | Auth / Trust |
| :--- | :--- | :--- | :--- | :--- |
| **Repo Manifest** (`.genba/config.json`) | Project settings: `project`, `rules` / `skills` folders, `herdr`, `git`, `defaults`; hooks and agents live in `.genba/lines/` | Lines, roles, secrets, runtime state | Read by CLI & Cell | Committed in git (no secrets) |
| **Genba Local Server** (`genba __daemon`, `127.0.0.1:7072`) | Local SQLite DB, scheduling, retries, model escalation, Cell supervision/scaling, SSE stream, optional Hub sync | Running LLM CLIs in-process, mutating worktrees, calling `gh`/`glab` | Loopback HTTP/SSE; optional outbound HTTPS to `hub` | CLI bearer in `.genba-local/cli-token` (0600); ephemeral bearer per Cell; rejects `Origin` and foreign `Host` |
| **Genba Cell** (`genba __cell`) | 1 active Job, 1 worktree (`.worktrees/<slug>/`), `.cell/<step>/`, spawning 1 runner/inspection, live `ROLE.md` guards, `git` + `ForgePort` (`gh`/`glab`) | SQLite writes, `hub` credentials, queue ordering, multi-job concurrency | Local Server loopback; child runner; git/forge | Ephemeral `cell-<hex>` + in-memory bearer |
| **Operator Client** (`genba operator`) | Agent verb parsing (`done`, `verdict`, `block`, `context`, `read`, `incident`), single POST to Cell loopback | State transitions, DB/Hub/Forge calls | Cell loopback (`$GENBA_OPERATOR_URL`) | Per-job `$GENBA_CYCLE_TOKEN` |
| **Genba CLI** (`genba`) | Arg validation, `init` auto-detection, daemon auto-start, table/JSON output | Direct SQLite writes, scheduling, runner spawning | Local Server (`127.0.0.1:7072`) | CLI bearer from `.genba-local/cli-token` |
| **Hub** (`apps/hub`, optional) | Outbound Genba registry, read projections (fleet, orders, issues + forge URLs, OEE), SSE fan-out, command outbox | Step/retry/Mechanic state machines, worktrees, git, `gh`/`glab`, runners | Inbound HTTPS from Genba & Web UI | `hub_join` -> `hub_session`; `web_session` |
| **Web UI** (`apps/web`, optional) | Supervisor views (fleet, orders, Andon issues, OEE), BFF session/CSRF | Direct DB access, process spawning, execution decisions | `hub` or local Genba loopback | `web_session` / loopback |

One Local Server per repo, state in `<repo>/.genba-local/`. Second repo at same time needs another `GENBA_PORT`.

## Topology

```mermaid
flowchart TD
  CLI["genba CLI"] -->|"loopback HTTP/SSE"| D["Genba Local Server\n(SQLite + Scheduler + Escalation)"]
  D -->|"spawns / kills"| C["Genba Cell (disposable)\n(1 Worktree + 1 Runner + ROLE Guards)"]
  C -->|"claims, heartbeats, telemetry"| D
  A["Wrapped AI CLI"] -->|"genba operator (loopback)"| C
  C -->|"git push + gh/glab\n(PR, Draft PR, Andon Issue)"| F["GitHub / GitLab"]
  D -.->|"optional outbound sync + outbox"| H["Thin Hub (optional)"]
  W["Web UI (optional)"] -.->|"HTTPS + SSE"| H
  W -.->|"direct loopback (no Hub)"| D
```

## Prompt & Standards Split

- **`packages/prompt`** (`stage: runtime` / `stage: sync`): single Handlebars + typed frontmatter compiler.
  - `apps/genba` renders role `.md` files (`stage: runtime`) from `.genba/roles/`; templates embedded via `with { type: 'text' }`.
  - Optional `packages/nitpick` renders parameterized `rules/*.md` docs & fix hints (`stage: sync`); plain user docs stay untouched.
- `apps/genba` **never** depends on `packages/nitpick`.

## Hard Invariants

1. **No genba secrets in children**: of `GENBA_*`, agents get only `$GENBA_OPERATOR_URL` and `$GENBA_CYCLE_TOKEN`; setup and checks get none. This is not a sandbox: agents run as your user, keep other env vars, and can read local files ([issue](../issues/agents-can-reach-daemon-token.md)).
2. **Kill before requeue**: Local Server confirms exit of Cell process and its runner process group before reassigning a job.
3. **External caps**: Retry counts, and model escalation are enforced outside the LLM.
4. **Offline autonomy**: Hub outage never stalls or blocks local Cells; state syncs on reconnect.
5. **Non-fatal forge escalation**: If `gh`/`glab` fails during Andon reporting, the Incident still records locally with a warning.
