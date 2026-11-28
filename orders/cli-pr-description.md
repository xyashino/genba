---
title: Make delivered PR and MR descriptions readable and safe
line: feature
priority: high
---

## Objective

Reviewer sees what changed and what was verified first, on GitHub and GitLab. Publishing never destroys human edits or posts likely secrets.

## Problem

- Commit change list never reaches the description
- Whole order and report pasted raw; their headings mix with PR sections
- `audit.md` never shown
- Checks listed from Line config, not from what ran
- Republish overwrites title and description
- No size limit, no secret check

## Layout

Order: `Summary`, `Changes`, `Decision`, `Verification`, then collapsed `Work order`, `Builder report`, `Stations`.

- `Summary`: order `## Objective` section, else first paragraph, else title
- `Changes`: commit message body
- `Decision`: path, summary, why of each new `decisions/` entry
- `Verification`
  - each gate command that ran and passed, with tested commit
  - audit verdict and `audit.md` (collapsed), when Line has audit
  - nothing ran: say so
  - never show a check as passed without a recorded run
  - save more per station if needed
- Empty section: omitted, except `Verification`
- Headings inside inserted text never break the layout
- Builder report: no `.cell/` internal paths

## Human edits

- Genba text sits between `<!-- genba:start -->` and `<!-- genba:end -->`
- Republish replaces only text between markers
- Markers missing or broken: keep description, warn
- Title changed by hand: keep it
- Genba `WIP` title still replaced on delivery
- Warning visible to the person running genba; delivery still passes

## Size

- Title, description, issue body fit each forge limit (GitHub body: 65536 characters) and OS argument limit
- Shorten collapsed sections first, say that text was shortened
- Markers, `Summary`, `Verification` result survive shortening

## Secrets

- Check before any push or publish: pushed file changes, commit messages, titles, PR/MR bodies, issue bodies
- Cover at least: private key blocks, GitHub, GitLab, AWS, Anthropic, OpenAI token formats
- Found: stop push and publish, raise incident
- Error names kind and location, never the value
- Value never appears in logs, events, timeline, database, incident
- Escalation with a finding: no WIP push; incident still recorded locally
- Document: filter cannot catch every secret
- Test values are fake and do not trip repo checks

## Unchanged

- Only open PR/MR is reused
- GitHub and GitLab both supported
- Draft and ready switching
- Andon issue reused per order

## Out of scope

- Repo PR templates and richer blocked handoff: next order

## Done when

- Tests with fake `gh` and `glab` cover Layout, Human edits, Size, Secrets
- `docs/lines-and-roles.md` describes the behaviour
- `bun run ci:verify` passes
- One entry in `decisions/`
