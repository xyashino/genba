---
scope: docs
summary: Document every genba CLI command in docs/cli.md
why: Users must run genba without reading the source
date: 2026-11-27
---

- `docs/cli.md`: usage line, purpose, flags and one example per command in `genba --help`
- Solo flow (`init`, `doctor`, `run`) and queue flow (`import`, `start`, `scale`, `queue`, `order`, `watch`, `stop`)
- Order file format: markdown, optional frontmatter (`title`, `line`, `priority`, `depends_on`), slug from file name
- Incidents: `incident`, `incident resolve` with each resolution's effect
- `operator` marked as agent-only, verbs left to `lines-and-roles.md`
- Linked from the Docs list in `docs/README.md`
