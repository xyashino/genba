---
id: rich-commit-fix
stage: sync
input:
  types: string
---
Rewrite the commit message as "type(scope): title" (allowed types: {{types}}), a blank line, then a "- " change list (nested "  - " items allowed). Nothing may follow the list except an optional final "Claude-Session: https://claude.ai/code/session_<id>" line (after a blank line); no other footer, trailer, reference or credit. Example:
fix(repo): prevent racing of requests

- Introduce a request id and a reference to latest request
  - Nested detail
