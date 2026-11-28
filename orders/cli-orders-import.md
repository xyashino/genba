---
title: Add `genba orders import` reading from orders/
line: standard
priority: medium
---

Replace `genba import <file|dir>...` with `genba orders import`, which reads the repo's `orders/` folder by default.

## Behavior

- `genba orders import`: queue every `*.md` in `<repo root>/orders/`
  - same result from any subfolder of the repo
  - subfolders of `orders/` ignored
- `genba orders import <file|dir>...`: queue only given paths, relative to current folder
- Remove `genba import`: exits with usage error
- Missing or empty `orders/`: refuse, error names the folder
- `genba orders` without or with unknown subcommand: usage error

## Unchanged

- Order file format
- Known slugs skipped, never updated
- Only `queued` status imported
- Summary line: `imported N, already known N, not queued N`
- Daemon auto-start; no Cells started
- `genba order <slug>`, `genba order cancel <slug>`, `genba queue`, `genba run`

## Done when

- Tests cover each Behavior item through the CLI
- `genba --help`, `README.md`, `docs/` show the new command only
- `bun run ci:verify` passes
- One entry in `decisions/`, breaking change noted
