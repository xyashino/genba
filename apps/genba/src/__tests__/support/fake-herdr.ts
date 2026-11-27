// Stands in for the `herdr` CLI: a "pane" is a detached shell with its own process group.
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const LOG_ENV = 'FAKE_HERDR_LOG';

const [group, verb, ...rest] = process.argv.slice(3);
const log = process.env[LOG_ENV];
if (log) appendFileSync(log, `${[group, verb, ...rest].join(' ')}\n`);

const reply = (result: object): void => {
  console.log(JSON.stringify({ result }));
};

if (group === 'status') console.log('status: running');
else if (group === 'workspace' && verb === 'list') reply({ workspaces: [] });
else if (group === 'workspace') reply({ workspace: { workspace_id: 'w1' } });
else if (group === 'tab' && verb === 'create') {
  reply({ tab: { tab_id: 't1' }, root_pane: { pane_id: 'p1' } });
} else if (group === 'pane' && verb === 'run') {
  spawn('sh', ['-c', rest[1]!], { detached: true, stdio: 'ignore' }).unref();
} else if (group === 'pane' && verb === 'read') console.log('pane screen');
