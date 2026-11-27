---
id: decision-log-fix
stage: sync
input:
  dir: string
  scopes: string
  slugMin: number
  slugMax: number
  summaryMin: number
  summaryMax: number
  whyMin: number
  whyMax: number
  bulletsMin: number
  bulletsMax: number
  lineMax: number
---
Add exactly one new file to the commit and stage it (a commit that only moves or edits files in {{dir}} needs none). Template:
{{dir}}20261011-120000-repo-add-example-entry.md
---
scope: repo
summary: Short summary of the decision
why: Clear reason why this decision was made
date: 2026-10-11
supersedes: 20261009-093000-repo-add-older-entry
---

- Key change or fact
  - Nested detail
- Additional context
Summary {{summaryMin}}-{{summaryMax}} chars, why {{whyMin}}-{{whyMax}} chars, slug {{slugMin}}-{{slugMax}} chars, {{bulletsMin}}-{{bulletsMax}} bullets of max {{lineMax}} chars. Allowed scopes: {{scopes}}
