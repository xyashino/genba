# Genba

Injectable autonomous software factory for any git repo. Wraps existing AI CLIs (`claude`, `codex`, `gemini`, `opencode`, `cursor`) into repeatable production lines delivering verified Pull/Merge Requests — zero server required on day 1.

## Docs

- [docs/README.md](docs/README.md) — Overview, core value, glossary
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
