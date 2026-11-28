---
title: Add repo PR templates and a better blocked-work handoff
line: feature
priority: medium
depends_on: cli-pr-description
---

## Objective

Each repo controls its PR/MR layout, and a person picking up blocked work knows what happened and how to resume.

## Blocked handoff

Draft PR/MR and `genba:andon` issue show:

- order goal
- completed stations and their changes
- failed station, reason, failure, diagnosis
- incident id
- exact resume command, and valid resolutions from `genba --help`
- machine to run it on: the repo's genba host, without host name, user name or local paths
- draft PR/MR link in the issue, when one exists

## Templates

- `.genba/templates/pr.md`: one file for GitHub PR and GitLab MR
- `genba init` writes it; keeps existing file unless `--force`
- Missing file: built-in default, so existing repos keep working
  - exception to "no built-in fallback" for lines and roles: document it
- Read from repo root, like lines and roles
- Placeholders for each section from the parent order; list them in docs
- `genba doctor` fails on unknown or malformed placeholders, naming each
- Empty value leaves no empty heading

## Keep from parent order

- Markers: genba adds them even when the template has none
- Human edits kept
- Size limits
- Secret check, including template text
- Verification shows only recorded runs; a template cannot add a passed check

## Out of scope

- Blocked handoff template
- Labels, reviewers, issue linking

## Done when

- Tests cover Blocked handoff for GitHub and GitLab with fake CLIs
- Tests cover custom, missing, invalid templates through `init`, `doctor`, delivery
- `docs/lines-and-roles.md` updated
- `bun run ci:verify` passes
- One entry in `decisions/`
