---
scope: genba
summary: Refuse orders when it is a file, not a folder
why: A stray file named orders must get a clear refusal naming the folder, not a raw fs error
date: 2026-11-28
---

- `genba orders import` refuses when `<repo root>/orders` is a file, the error names the folder
- Fix is in `6174826`, which has no decision entry of its own; this entry covers it
- Branch holds two entries: `20261128-131717-genba-add-orders-import` and this one
