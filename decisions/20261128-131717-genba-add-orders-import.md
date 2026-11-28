---
scope: genba
summary: Add orders import reading orders/ and drop import
why: Orders live in the repo's orders/ folder, so one command queues them from any folder
date: 2026-11-28
---

- Breaking: `genba import` removed, now a usage error; use `genba orders import`
- `genba orders import` queues `*.md` directly in `<repo root>/orders/`, same from any folder of the repo
- `genba orders import <file|dir>...` queues only the given paths, relative to the current folder
- Missing or empty `orders/` is refused, the error names the folder
- Subfolders of `orders/` ignored; only `queued` orders are imported, known slugs skipped
- `genba orders` without a known subcommand is a usage error
