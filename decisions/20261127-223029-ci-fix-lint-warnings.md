---
scope: ci
summary: Clear lint warnings that failed ci:verify on sqlite-kit and nitpick
why: ci:verify runs eslint with max-warnings 0; banned double casts broke the gate
date: 2026-11-27
---

- `sqlite-kit` `createDb`: replace `as unknown as InternalMigrator` with a type guard; throw if drizzle internals are missing
- `nitpick` `config.ts`: `value as unknown as Config` becomes `value as Config`, which type-checks
- `nitpick` docs test: invalid `run`-without-`fix` rule uses `@ts-expect-error` instead of a whole-config double cast
- Behavior unchanged; sqlite-kit, nitpick tests and full ci:verify lint/types pass
