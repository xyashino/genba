# Genba

Injectable software factory for any repo.

## Workspace

- `apps/`: applications
- `packages/prompt`: prompt template & frontmatter utilities
- `packages/nitpick`: AI rules/skills/docs generator & checker
- `packages/eslint-config`: shared ESLint configs
- `packages/typescript-config`: shared TypeScript configs

## Commands

- `bun install`: install dependencies, set up husky, build & sync nitpick
- `bun run ci:verify`: format check, lint, type-check, test, and build via Turborepo
- `bun run nitpick:sync`: regenerate AI docs from `.nitpick/`
- `bun run nitpick:check`: verify generated docs and commit/decision rules
