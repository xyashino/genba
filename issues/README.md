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
| [Agents can read daemon and forge credentials](./agents-can-reach-daemon-token.md) | decision | high | confirmed |
| [Agents inherit most of parent environment](./agents-inherit-full-environment.md) | bug | high | confirmed |
| [Guard misses ignored files and `.git/` writes](./changed-paths-guard-blind-spots.md) | bug | high | confirmed |
| [Codex read mode blocks operator calls](./codex-read-only-blocks-operator.md) | bug | high | likely |
| [Read roles must write output files](./read-roles-cannot-write-outputs.md) | decision | high | confirmed |
| [Never ran against real tools](./real-cli-behaviour-unverified.md) | verify | high | untested |
| [`antigravity` and `opencode` have no read mode](./antigravity-opencode-ignore-read-mode.md) | bug | medium | confirmed |
| [Quota gate is not wired](./quota-gate-has-no-source.md) | question | medium | confirmed |
| [Same `read` permission, different guarantees](./read-mode-guarantee-differs-per-runner.md) | decision | medium | confirmed |
| [No release publishes binaries](./release-binaries-not-published.md) | task | medium | confirmed |
| [New worktree can start from stale base](./worktree-base-can-be-stale.md) | decision | medium | confirmed |
| [Child waits forever on cancelled or blocked parent](./child-order-waits-on-dead-parent.md) | decision | low | confirmed |
| [Do we need interactive runs?](./interactive-mode-has-no-runner.md) | question | low | confirmed |
| [Runner can escape if Cell dies right after start](./runner-pid-tracking-window.md) | bug | low | likely |
| [Station logs vanish after delivery](./station-logs-lost-after-delivery.md) | task | low | confirmed |
| [`.ts` import rule not enforced](./ts-import-paths-not-linted.md) | task | low | confirmed |
| [Usage storage and cost deferred](./usage-storage-and-cost-deferred.md) | question | low | confirmed |
