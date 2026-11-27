---
kind: question
priority: low
evidence: confirmed
status: open
---

# Do we need interactive runs?

## Problem

- `buildCommand` exists, but only headless `RunnerPort` is built
- `headless: false` gives real interactive argv only for `claude` and `antigravity`; other four return headless argv

## Next

- Either add interactive runner (`sf` used `herdr`) or drop `headless: false`
