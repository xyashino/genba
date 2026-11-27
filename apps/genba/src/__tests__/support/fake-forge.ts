// Stands in for `gh` and `glab`. Unknown subcommands and flags fail, as in the real CLIs.
import {
  closeSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { FORGE_STATE_ENV } from './forge-state.ts';
import type { FakeForgeState, FakeItem } from './forge-state.ts';

const [CLI, ...args] = process.argv.slice(2) as ['gh' | 'glab', ...string[]];
const command = args.slice(0, 2).join(' ');
const statePath = process.env[FORGE_STATE_ENV]!;
// Parallel Cells call the stub at once: one process owns the state file until it exits.
const lockPath = `${statePath}.lock`;
for (;;) {
  try {
    closeSync(openSync(lockPath, 'wx'));
    break;
  } catch {
    Bun.sleepSync(5);
  }
}
process.on('exit', () => unlinkSync(lockPath));
const state = JSON.parse(readFileSync(statePath, 'utf8')) as FakeForgeState;

const SPECS: Record<'gh' | 'glab', Record<string, string[]>> = {
  gh: {
    'pr list': ['--head=', '--state=', '--json=', '--limit='],
    'pr create': ['--base=', '--head=', '--title=', '--body=', '--draft'],
    'pr edit': ['--base=', '--title=', '--body='],
    'pr ready': ['--undo'],
    'pr view': ['--json='],
    'issue list': ['--label=', '--state=', '--json=', '--limit='],
    'issue create': ['--label=', '--title=', '--body='],
    'issue edit': ['--title=', '--body='],
    'label create': ['--color=', '--description='],
    'auth status': ['--hostname='],
  },
  glab: {
    'mr list': ['--source-branch=', '--output='],
    'mr create': [
      '--source-branch=',
      '--target-branch=',
      '--title=',
      '--description=',
      '--draft',
      '--yes',
    ],
    'mr update': [
      '--target-branch=',
      '--title=',
      '--description=',
      '--draft',
      '--ready',
      '--yes',
    ],
    'mr view': ['--output='],
    'issue list': ['--label=', '--output=', '--page=', '--per-page='],
    'issue create': ['--label=', '--title=', '--description=', '--yes'],
    'issue update': ['--title=', '--description='],
    'label create': ['--name=', '--color=', '--description='],
    'auth status': ['--hostname='],
  },
};

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const allowed = SPECS[CLI][command] ?? fail(`unknown command ${command}`);
const values: Record<string, string> = {};
const switches = new Set<string>();
const positional: string[] = [];
for (let i = 2; i < args.length; i += 1) {
  const arg = args[i]!;
  if (!arg.startsWith('--')) positional.push(arg);
  else if (allowed.includes(`${arg}=`)) values[arg.slice(2)] = args[(i += 1)]!;
  else if (allowed.includes(arg)) switches.add(arg.slice(2));
  else fail(`unknown flag ${arg}`);
}

state.calls.push(command);
const save = () => writeFileSync(statePath, JSON.stringify(state));
save();
if (state.failing.includes(command)) fail(`${CLI}: HTTP 502`);

const print = (value: unknown) => process.stdout.write(JSON.stringify(value));
const github = CLI === 'gh';
const base = github
  ? 'https://github.com/acme/app'
  : 'https://gitlab.com/acme/app';
const byNumber = (list: FakeItem[]): FakeItem =>
  list.find((item) => String(item.number) === positional[0]) ??
  fail('not found');

const prView = (pr: FakeItem) =>
  github
    ? { number: pr.number, url: pr.url, isDraft: pr.draft }
    : { iid: pr.number, web_url: pr.url, draft: pr.draft };
const issueView = (issue: FakeItem) =>
  github
    ? { number: issue.number, url: issue.url, body: issue.body }
    : { iid: issue.number, web_url: issue.url, description: issue.body };

const create = (
  list: FakeItem[],
  path: string,
  fields: Omit<FakeItem, 'number' | 'url' | 'state'>,
) => {
  const number = state.prs.length + state.issues.length + 1;
  const url = `${base}/${path}/${number}`;
  list.push({ number, url, state: 'open', ...fields });
  save();
  process.stdout.write(`Creating...\n${url}\n`);
};

const change = (item: FakeItem, patch: Partial<FakeItem>) => {
  Object.assign(
    item,
    Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    ),
  );
  save();
};

const body = values['body'] ?? values['description'];

switch (command) {
  case 'pr list':
  case 'mr list': {
    const branch = values['head'] ?? values['source-branch'];
    print(
      state.prs
        .filter((pr) => pr.branch === branch && pr.state === 'open')
        .map(prView),
    );
    break;
  }
  case 'pr create':
  case 'mr create':
    create(state.prs, github ? 'pull' : '-/merge_requests', {
      branch: values['head'] ?? values['source-branch'],
      baseBranch: values['base'] ?? values['target-branch'],
      title: values['title']!,
      body: body!,
      draft: switches.has('draft'),
    });
    break;
  case 'pr edit':
    change(byNumber(state.prs), {
      baseBranch: values['base'],
      title: values['title'],
      body,
    });
    break;
  case 'pr ready':
    change(byNumber(state.prs), { draft: switches.has('undo') });
    break;
  case 'mr update':
    change(byNumber(state.prs), {
      baseBranch: values['target-branch'],
      title: values['title'],
      body,
      draft: switches.has('draft')
        ? true
        : switches.has('ready')
          ? false
          : undefined,
    });
    break;
  case 'pr view':
    print({ state: byNumber(state.prs).state.toUpperCase() });
    break;
  case 'mr view': {
    const { state: status } = byNumber(state.prs);
    print({ state: status === 'open' ? 'opened' : status });
    break;
  }
  case 'issue list': {
    const size = Number(values['per-page'] ?? values['limit']);
    const start = (Number(values['page'] ?? 1) - 1) * size;
    print(
      state.issues
        .filter((i) => i.label === values['label'] && i.state === 'open')
        .slice(start, start + size)
        .map(issueView),
    );
    break;
  }
  case 'issue create':
    if (!state.labels.includes(values['label']!)) fail('label not found');
    create(state.issues, github ? 'issues' : '-/issues', {
      label: values['label'],
      title: values['title']!,
      body: body!,
    });
    break;
  case 'issue edit':
  case 'issue update':
    change(byNumber(state.issues), { title: values['title'], body });
    break;
  case 'label create': {
    const name = values['name'] ?? positional[0]!;
    if (state.labels.includes(name)) fail('label already exists');
    state.labels.push(name);
    save();
    break;
  }
  case 'auth status':
    if (!state.authenticated) fail('not logged in');
    break;
}
