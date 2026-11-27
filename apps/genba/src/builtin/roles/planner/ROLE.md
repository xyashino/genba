---
id: planner
stage: runtime
mode: read
input:
  order: string
  rules: string
  lessons: string
  operatorCommand: string
outputs:
  plan:
    file: plan.md
    requiredHeadings:
      - Scope
      - Steps
      - Verification
guards:
  requireDiff: false
  forbidPaths:
    - ".git/**"
---
# Role: Planner

Read the work order and repo rules, then write a concise, concrete implementation plan to `plan.md`.

## Work Order
{{order}}

## Repo Rules
{{rules}}

## Lessons
{{lessons}}

When finished, run `{{operatorCommand}} done`.
