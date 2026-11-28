---
title: Remove outdated skills and rebuild the useful ones for Genba
line: feature
priority: medium
depends_on: nitpick-add-create-order-skill
---

## Objective

Every skill in `.nitpick/skills/` works in this repo: no dead commands, paths, or tools.

## Replace

New skill first has its value, then old one goes. Check every command against `genba --help` and source.

| Old | Problem | New | Keep the value |
| --- | --- | --- | --- |
| `boss-factory` | `sf`, HQ | `supervise-orders` | queue, watch, incidents, resolutions, report; operator uses CLI only, never skips stations, escalates when human needed, never reads secrets |
| `factory-install` | builds `sf`, HQ, web | `setup-genba` | explicit activation; prerequisites; build, install, `init`, `doctor`; never log in or print tokens; ask before overwrite |
| `create-pr` | `omino` paths, `ask_question` tool | `create-pr` (rewrite) | check branch, push, `gh` or `glab`, no force push, report URL; follow repo commit and attribution rules |

- `setup-genba` also: headless server with `herdr: true` needs Claude folder trust and bypass-mode warning accepted by the user running genba; skill tells the user, never edits trust settings

## Remove without replacement

| Skill | Reason |
| --- | --- |
| `async-implement` | needs `best-of-n-runner`, `apps/romantic-app`; Genba Cells and orders cover it |
| `feature-workflow` | chains skills removed here; `feature` line and `create-order` cover planning and splitting |
| `run-workflow` | depends on `run_workflow` tool; no genba role uses it |
| `plan-domain` | built on missing `apps/romantic-app` |
| `plan-fe` | built on missing `apps/romantic-app` and `plan-ui` |

## Keep

- `caveman`, `evidence`: used by roles or rules
- `black-box-tester`, `clarify`, `witch-doctor`, `sloth`

## Open decisions

- `plan-be`, `plan-db`, `plan-requirements`, `clone`, `do-ui`: generic, no role uses them. Default: keep; remove only links to removed skills
- Kept skills checked only by pattern search and partial reading. Default: read each fully, fix dead references, make tool names such as `TodoWrite` in `sloth` agent-neutral

## Out of scope

- Rules, roles, lines
- `create-order` content
- Top-level `skills/` folder: untracked, not nitpick source

## Done when

- `.nitpick/config.ts` lists exactly the skills on disk
- No text in `.nitpick/` points to a removed skill, missing path, or missing script
- Roles in `.genba/roles/` and built-in roles list only existing skills; `genba doctor` shows no guidance error
- `bun run nitpick:sync` leaves no generated removed skill
- New skills name no `sf`, HQ, `.factory/`
- `bun run nitpick:check` and `bun run ci:verify` pass
- One entry in `decisions/`: removed, replaced, why
