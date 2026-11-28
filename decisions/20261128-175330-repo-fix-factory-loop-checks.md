---
scope: repo
summary: Fix stacked decision-log check, turbo race, and timeline clipping
why: Unblock stacked genba orders in audit and prevent cold-cache check-types races
date: 2026-11-28
---

- Fix `packages/nitpick/src/rules/decision-log.ts` for stacked branches
  - Check only `stagedAddedFiles` when staging a commit so parent ADRs do not collide
  - Allow up to `Math.max(1, commitMessages.length)` ADRs when checking a multi-commit range
  - Add multi-commit branch-range test in `packages/nitpick/src/__tests__/decision-log.test.ts`
- Add `^build` to `check-types.dependsOn` in `turbo.json` so downstream packages wait for `@repo/prompt` dist
- Raise `DETAIL_CHARS` in `packages/line/src/timeline.ts` from 200 to 400 with word-boundary ellipsis clipping
- Note full `.cell/<gate-station>/gate.log` path in `apps/genba/src/builtin/roles/doctor/ROLE.md`
