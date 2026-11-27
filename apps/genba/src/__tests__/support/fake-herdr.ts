// Stands in for the `herdr` CLI: a "pane" is a detached shell with its own process group.
import { spawn } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';

const LOG_ENV = 'FAKE_HERDR_LOG';

const [group, verb, ...rest] = process.argv.slice(3);
const log = process.env[LOG_ENV]!;
const statePath = `${log}.workspaces`;
appendFileSync(log, `${[group, verb, ...rest].join(' ')}\n`);

type Workspace = { workspace_id: string; label: string };

const workspaces: Workspace[] = existsSync(statePath)
  ? (JSON.parse(readFileSync(statePath, 'utf8')) as Workspace[])
  : [];
const save = (next: Workspace[]): void =>
  writeFileSync(statePath, JSON.stringify(next));
const reply = (result: object): void => {
  console.log(JSON.stringify({ result }));
};

if (group === 'status') console.log('status: running');
else if (group === 'workspace' && verb === 'list') reply({ workspaces });
else if (group === 'workspace' && verb === 'create') {
  const workspace = {
    workspace_id: `w${process.pid}`,
    label: rest[rest.indexOf('--label') + 1]!,
  };
  save([...workspaces, workspace]);
  // No root pane in the reply: the logs tab never ends, so the fake does not start it.
  reply({ workspace });
} else if (group === 'workspace' && verb === 'close') {
  save(workspaces.filter((entry) => entry.workspace_id !== rest[0]));
} else if (group === 'tab' && verb === 'create') {
  reply({ tab: { tab_id: `t${process.pid}` }, root_pane: { pane_id: 'p1' } });
} else if (group === 'pane' && verb === 'run') {
  spawn('sh', ['-c', rest[1]!], { detached: true, stdio: 'ignore' }).unref();
} else if (group === 'pane' && verb === 'read') console.log('pane screen');
