# genba CLI

Reference for every `genba` command. Run from any checkout or worktree of the repo. Repo must have `.genba/config.json` (see `init`). Terms: [README.md](./README.md#glossary).

## Exit codes

- `0`: ok
- `1`: refused: fix what the message says. `doctor` exits `1` when any check fails
- `2`: usage: bad args, usage text printed
- `3`: unreachable: daemon did not answer, or `operator` run outside a station

## Flows

### Solo flow

One order, one terminal. No daemon to manage.

```sh
genba init                  # write .genba/config.json and lines/roles
genba doctor                # check config, runners, forge login, daemon
genba run orders/add-retry.md
```

`run` starts the daemon if needed, scales to 1 cell if none is set, prints each finished job, and exits `0` when the order is `delivered` or `merged`, else `1`.

### Queue flow

Many orders, long-running daemon.

```sh
genba init
genba doctor
genba start 2              # daemon + 2 cells
genba import orders/       # queue every .md in the folder
genba queue                # watch status
genba watch                # stream events; Ctrl+C stops
genba stop                 # stop cells and daemon
```

Commands that need a running daemon (`scale`, `queue`, `order`, `order cancel`, `incident`, `watch`) refuse when none answers, with a hint to run `genba start`. `import` and `run` start the daemon themselves.

## Commands

### init

```
init [--force]               detect the repo and write .genba/config.json
```

Detects stack, verify checks, runners and forge from the repo, then writes `.genba/config.json` and the line and role files under `.genba/`.

- `--force`: replace an existing config, and overwrite the line and role files. Without it, an existing config refuses and existing lines/roles are kept.

```sh
genba init --force
```

### doctor

```
doctor [--json]              check config, runners, forge login, daemon
```

Checks config, origin remote, forge login, every line and role, rules and skills, runners, and daemon state. Prints one line per check.

- `--json`: print checks as a JSON array.

```sh
genba doctor --json
```

### start

```
start [cells]                start the daemon with N cells
```

Starts the daemon for this repo if not running, then sets the cell count. Without `cells`, uses `defaults.cells` from config (1). Max 32.

```sh
genba start 2
```

### scale

```
scale <cells>                change the number of cells
```

Sets the cell count of the running daemon. `cells` is `0` to `32`. Needs a daemon.

```sh
genba scale 0
```

### stop

```
stop                         stop cells and the daemon
```

Asks the daemon to shut down and waits up to 10 s for it to exit. Prints `no genba daemon is running` and exits `0` when none runs.

```sh
genba stop
```

### import

```
import <file|dir>...         queue order markdown files
```

Reads each order file, or every top-level `.md` file in each directory (not recursive). Starts the daemon if needed. Prints `imported N, already known N, not queued N`. See [Order file format](#order-file-format).

```sh
genba import orders/add-retry.md orders/fix-login.md
```

### run

```
run <order.md>               queue one order and follow it to the end
```

Takes exactly one order file. Imports it, follows it until it settles, and prints each finished job. Exit code: `0` delivered or merged, `1` otherwise. Final line includes the PR URL when there is one.

```sh
genba run orders/add-retry.md
```

### queue

```
queue [--json]               list orders
```

Prints cell count (`cells 1/2`), then a table: `ORDER STATUS PRIORITY LINE PR`. Flags a crash loop.

- `--json`: `{ "cells": [...], "orders": [...] }`.

```sh
genba queue --json
```

### order

```
order <slug> [--json]        show one order
```

Prints status, line and priority, PR URL, a station table (`STATION STATUS ATTEMPTS`), and the summary of each failed job.

- `--json`: full order detail: order, steps, jobs.

```sh
genba order add-retry
```

### order cancel

```
order cancel <slug>          cancel an order
```

Cancels the order by slug.

```sh
genba order cancel add-retry
```

### incident

```
incident [--all] [--json]    list open incidents
```

Lists open incidents: `ID ORDER REASON OWNER ISSUE DRAFT PR`. `incident list` is the same command.

- `--all`: include resolved incidents.
- `--json`: incidents as a JSON array.

```sh
genba incident --all
```

### incident resolve

```
incident resolve <id> <resolution> [--step <station>] [--diagnosis <text>]
```

Resolves one incident. `resolution` is one of `retry_step`, `restart_from_step`, `restart_from_scratch`, `escalate`, `cancel`. Any other value refuses.

- `--step <station>`: station to rerun from. Required for `retry_step` and `restart_from_step` unless the incident already names one; refused otherwise. Must belong to the order's line.
- `--diagnosis <text>`: fed to the rerun station as feedback.

```sh
genba incident resolve <id> retry_step --step quality-gate
```

### watch

```
watch [--json]               stream daemon events
```

Streams daemon events until Ctrl+C. Default line: time, type, order, station, status, first line of detail. Needs a daemon.

- `--json`: one raw event JSON per line.

```sh
genba watch --json
```

### operator

```
operator <verb>              used by agents inside a station
```

Used by agents inside a station, not by people. Works only when the Cell sets its operator env vars; elsewhere it prints `genba operator only works inside a station run by a Cell` and exits `3`. Verbs are defined in [lines-and-roles.md](./lines-and-roles.md#operator-verbs).

## Order file format

Plain markdown. Frontmatter is optional.

```markdown
---
title: Add retry to upload
line: standard
priority: high
depends_on: add-upload-api
---

# Add retry to upload

Retry the upload three times with backoff. Keep the public API unchanged.
```

- **File name is the slug.** `add-retry.md` gives slug `add-retry`. Must match `^[a-z0-9][a-z0-9-]*$`. Other names refuse.
- `title`: default first `# heading` in body, else slug.
- `line`: line name from `.genba/lines/`. Default `defaults.line` in config (`standard`).
- `priority`: `low`, `medium`, `high`, `critical`. Default `medium`.
- `depends_on`: slug of parent order. Child waits for parent delivery, then stacks on the parent branch until merged.
- Body: what the agents build. Everything after the frontmatter.

Invalid frontmatter refuses the import and names the file.

## Incidents

An incident opens when an order cannot finish on its own. Reasons: `step_retries_exhausted`, `operator_blocked`, `quota_exhausted`, `stale_base`, `env_error`. The order then pushes a WIP draft PR and a `genba:andon` issue on the forge, and frees the cell.

Flow:

1. `genba incident` lists open incidents with ID, reason and owner.
2. Read the draft PR or issue for the diagnosis.
3. `genba incident resolve <id> <resolution>` applies one fix:
   - `retry_step`: one more attempt on `--step` (or the incident's station)
   - `restart_from_step`: rerun from `--step` (or the incident's station) with attempts reset
   - `restart_from_scratch`: rerun from the first station on a new branch from base
   - `escalate`: hand to supervisor triage
   - `cancel`: cancel the order

`restart_from_scratch` overwrites the remote branch only while it still holds what genba pushed.
