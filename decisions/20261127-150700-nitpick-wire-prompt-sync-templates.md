---
scope: nitpick
summary: "Render stage: sync rule docs and fixes via @repo/prompt"
why: Remove hardcoded TS template literals and keep rule docs in sync with config
date: 2026-11-27
---

- Add `dist/` build output and exports to `@repo/prompt` so `@repo/nitpick` consumes it via `workspace:*`
- Support optional `inputs` on `{ file }` docs in `nitpick`, rendering via `@repo/prompt` only when frontmatter declares `stage: sync`
  - Plain markdown rule files pass through untouched so literal `{{...}}` examples never break Handlebars
- Convert `decision-log` and `rich-commit` docs and fix hints to `stage: sync` `.md` templates parameterized with configured `scopes`, bounds, and `COMMIT_TYPES`
- Drop duplicated static `.nitpick/rules/` copies for `decision-log` and `rich-commit` in favor of the built-in templates
