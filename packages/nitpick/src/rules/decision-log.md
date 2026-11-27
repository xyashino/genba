---
id: decision-log
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
Each session ends with one decision entry in root `{{dir}}`.

Commit adds (stages) exactly one new file in `{{dir}}`, never more. Pure renames git detects do not count. Commit touching only `{{dir}}` files (move, edit) needs no new entry. `__log__/` dirs are gone: new file there = error.

Path `{{dir}}YYYYMMDD-HHmmss-[<TICKET>-]<scope-prefix>-<verb>-<object>.md`:

- `YYYYMMDD-HHmmss`: real local datetime when the entry is written. No `NNNN` numbers: parallel PRs never clash on a number, so rebasing never renames entries.
- `<TICKET>`: optional tracker id (`[A-Z][A-Z0-9]*-\d+`, uppercase only). Present iff frontmatter `ticket` is present; `none` is rejected.
- slug: kebab-case `[a-z0-9-]`, {{slugMin}}-{{slugMax}} chars. Starts with first `scope` segment (`app/dashboard` -> `app-`), then imperative verb from allow-list, then object.
- no two entries share the same ticket (or empty) and slug, whatever the datetime.

Content: YAML frontmatter, blank line, nested `- ` list. Nothing else (no heading, prose, code fence, blank line).

Frontmatter, flat `key: value`. Plain scalar must not contain `: ` or ` #`, else use `"double quotes"`:

- optional `ticket`: id like `ABC-123`, equal to the file name segment if present; drop key and segment if untracked (`none` is rejected).
- required `scope`: lowercase kebab segments joined by `/`, must match allowed patterns: `{{scopes}}`.
- required `summary`: one line, {{summaryMin}}-{{summaryMax}} chars.
- required `why`: one line, {{whyMin}}-{{whyMax}} chars.
- optional `date`: `YYYY-MM-DD`.
- optional `supersedes`: full name of existing older entry without `{{dir}}` and `.md`, e.g. `20261009-093000-app-order-tiles`.
- optional `tags`: kebab-case list, `[a, b]` or `- a` lines.
- optional metrics, only if known: `models` (list), `inputTokens`, `outTokens`, `cost`, `workTimeInMinutes`.

Body: {{bulletsMin}}-{{bulletsMax}} bullet lines, max {{lineMax}} chars each. Nest with 2 spaces, one level deeper at most. Facts only, drop test-count noise.
