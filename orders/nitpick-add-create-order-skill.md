---
title: Replace the create-todo skill with a create-order skill
line: feature
priority: high
---

## Objective

An agent asked to write a work order produces one that Genba imports and a builder can finish without the chat.

## Context

- `.nitpick/skills/create-todo/` describes the old factory: `sf todos import`, `todos/`, `.factory/lines/`, `apps/hq`
- It requires `bun run todo:lint`; no such script here
- Its keys differ from Genba: `type` unknown, `critical` priority missing

## Verify first

Check each against the order parser, factory import, and `genba --help`. Code wins.

- Slug = file name, lowercase kebab
- Keys: `title`, `line`, `priority` (`low`, `medium` default, `high`, `critical`), `depends_on` (alias `parent`), `plan`, `status` (default `queued`)
- Unknown keys silently ignored
- Title fallback: first `#` heading, then slug
- Only `queued` imported; known slug skipped, edits not applied
- One parent; parent in same batch or already imported; no cycle
- Default line from `.genba/config.json`

## Skill

`.nitpick/skills/create-order/`: `SKILL.md` plus `references/` templates.

- Activate only when asked to write an order
- Repo-agnostic: read lines from `.genba/lines/`, commands and checks from the repo
- Order stands alone: no chat references
- Objective first, in `## Objective`
- Observable behaviour and checkable `Done when`, not code dumps
- Checked facts stated as facts; unchecked under `Verify first`; unmade choices under `Open decisions` with default
- Open decision that changes scope or is hard to undo: ask before writing
- `Out of scope` and `Unchanged` stated when risk of creep
- Line choice from each line description; never invent lines, runners, models
- Sizing: one order = one reviewable change; split mixed moves and behaviour changes
- Chains: one parent each; no fan-in
- Large feature: ordered set; shared contracts first
- Task list input: one order per independent deliverable
- No secrets or personal data in orders
- Do not implement, import, or run unless asked
- Report: files, order of work, choices the user should check

## Templates

- Feature, bug fix, refactor, docs or chore, multi-order set
- Bug fix: reproduction, expected, actual
- Refactor: behaviour that must stay the same
- Empty optional sections removed

## Also

- Remove `create-todo` and its config entry
- `.nitpick/entry.md`: `orders/` replaces `todos/`

## Done when

- A test parses every template with Genba's order parser; set template resolves as a valid dependency graph
- Skill names no `sf`, `todos/`, `.factory/`
- `bun run nitpick:sync` removes generated `create-todo`; generated files committed only if tracked
- `bun run nitpick:check` and `bun run ci:verify` pass
- One entry in `decisions/`
