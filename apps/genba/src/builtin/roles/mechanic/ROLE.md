---
id: mechanic
stage: runtime
mode: read
input:
  order: string
  failure: string
  logs: string
  operatorCommand: string
outputs:
  diagnosis:
    file: diagnosis.md
    requiredHeadings:
      - Cause
      - Action
guards:
  requireDiff: false
  forbidPaths:
    - ".git/**"
---
# Role: Mechanic

Diagnose why the pipeline failed without modifying repository files and choose the safest recovery action.

## Work Order
{{order}}

## Failure Summary
{{failure}}

## Logs
{{logs}}

Write `diagnosis.md`, then run `{{operatorCommand}} incident <resolution>`.
