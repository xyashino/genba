# Genba

Injectable autonomous software factory for any git repo. Wraps existing AI CLIs (`claude`, `codex`, `copilot`, `cursor`, `opencode`, `antigravity`) into repeatable production lines delivering verified Pull/Merge Requests — zero server required on day 1.

## Quick start

Needs `git` with an `origin` remote, a logged-in `gh` or `glab`, and `claude` (other runners are unverified, see [issues/](issues/README.md)).

```sh
bun install && bun run build   # compiles apps/genba/dist/genba
node scripts/install.mjs       # copies it to ~/.local/bin

cd your-repo
genba init                     # writes .genba/ config, lines and roles
genba doctor
genba run order.md             # one order, to a pull request
genba run order.md --once      # same, without daemon or queue
```

Order file: markdown, optional frontmatter (`title`, `line`, `priority`, `depends_on`). File name is the slug.

Queue mode: `genba orders import` (queues `orders/*.md`, or `genba orders import <path>...`), `genba start 3`, `genba watch` (`--full` for detailed Cell history), `genba queue`, `genba incident`, `genba stop`. `genba --help` lists all commands.

> Agents run with your user rights and without permission prompts. Use genba only on repos and orders you trust.

## Docs

- [docs/README.md](docs/README.md) — Overview, core value, glossary
- [docs/architecture.md](docs/architecture.md) — Monorepo layout, runtime boundaries, import rules
- [docs/boundaries.md](docs/boundaries.md) — Runtime ownership matrix, topology, invariants
- [docs/lines-and-roles.md](docs/lines-and-roles.md) — Repo-agnostic Lines, `ROLE.md` guards, Forge Andon
- [docs/migration.md](docs/migration.md) — Phased migration plan from `software-factory`

## Workspace

- `apps/`: applications
- `packages/contract-kit`: shared Zod contract field/reply helpers
- `packages/sqlite-kit`: Bun SQLite + Drizzle DB & migration helpers
- `packages/prompt`: typed frontmatter + Handlebars template renderer (`stage: sync` and `stage: runtime`)
- `packages/nitpick`: AI rules/skills/docs generator & checker
- `packages/eslint-config`: shared ESLint configs
- `packages/typescript-config`: shared TypeScript configs

## Commands

- `bun install`: install dependencies, set up husky, build & sync nitpick
- `bun run ci:verify`: format check, lint, type-check, test, and build via Turborepo
- `bun run nitpick:sync`: regenerate AI docs from `.nitpick/`
- `bun run nitpick:check`: verify generated docs and commit/decision rules
