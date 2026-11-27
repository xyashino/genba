# Issues

Open bugs, decisions, questions. Task specs go to `todos/`; made choices go to `decisions/`.

## Format

- One file per issue, kebab-case name, no numbers
- `kind`: `bug` | `decision` | `question` | `verify` | `task`
- `priority`: `high` | `medium` | `low`
- `evidence`: `confirmed` (read in code or reproduced) | `likely` (partial probe or inference) | `untested`
- Sections: `Problem`, `Next`
- Resolved: delete file and index row in same change; record choice in `decisions/`

## Open

| Issue | Kind | Priority | Evidence |
| :--- | :--- | :--- | :--- |
| [Codex read mode blocks operator calls](./codex-read-only-blocks-operator.md) | bug | high | likely |
| [Read roles must write output files](./read-roles-cannot-write-outputs.md) | decision | high | confirmed |
| [`antigravity` and `opencode` ignore read mode](./antigravity-opencode-ignore-read-mode.md) | bug | high | confirmed |
| [Same `read` permission, different guarantees](./read-mode-guarantee-differs-per-runner.md) | decision | high | confirmed |
| [`git status` guard misses some writes](./changed-paths-guard-blind-spots.md) | bug | high | confirmed |
| [Agents inherit full parent environment](./agents-inherit-full-environment.md) | bug | high | confirmed |
| [Role commands do not satisfy operator contracts](./operator-verbs-miss-required-fields.md) | bug | high | confirmed |
| [Adapters never ran against real tools](./real-cli-behaviour-unverified.md) | verify | high | untested |
| [`forbidPaths` silently ignores most globs](./forbid-paths-ignores-glob-patterns.md) | bug | medium | confirmed |
| [Operator runtime cannot import its client](./operator-client-lint-boundary.md) | decision | medium | confirmed |
| [Push after rollback likely rejected](./push-after-rollback-rejected.md) | decision | medium | likely |
| [New worktree can start from stale base](./worktree-base-can-be-stale.md) | decision | medium | confirmed |
| [Checkpoint rules not ported](./checkpoint-policy-not-ported.md) | task | medium | confirmed |
| [Quota gate has no data source](./quota-gate-has-no-source.md) | question | medium | confirmed |
| [Do we need interactive runs?](./interactive-mode-has-no-runner.md) | question | low | confirmed |
| [Usage storage and cost deferred](./usage-storage-and-cost-deferred.md) | question | low | confirmed |
| [Docs list unsupported `gemini` runner](./readme-lists-unsupported-gemini.md) | bug | low | confirmed |
| [`.ts` import rule not enforced](./ts-import-paths-not-linted.md) | task | low | confirmed |
