import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EXIT } from '../domain/exit-codes.ts';
import { FORGE_STATE_ENV } from './support/forge-state.ts';
import type { FakeForgeState } from './support/forge-state.ts';
import { installStub, tempDir } from './support/stub-bin.ts';

const ENTRY = fileURLToPath(new URL('../bin.ts', import.meta.url));
const AGENT_LOG_ENV = 'FAKE_AGENT_LOG';
const AGENT_FIXED_ENV = 'FAKE_AGENT_FIXED';
const PATH_ENV = 'PATH';
const SETTLE_MS = 90_000;

const work = tempDir('e2e');
const binary = join(work, 'genba');
const repo = join(work, 'shop');
const origin = join(work, 'origin.git');
const forgeState = join(work, 'forge.json');
const agentLog = join(work, 'agent.log');
const agentFixed = join(work, 'agent.fixed');
const hookLog = join(work, 'hooks.log');
const herdrLog = join(work, 'herdr.log');
let env: Record<string, string | undefined> = {};

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, stdio: 'pipe' }).toString().trim();

const genbaIn = (cwd: string, ...args: string[]): string =>
  execFileSync(binary, args, { cwd, env, stdio: 'pipe' }).toString();

const genba = (...args: string[]): string => genbaIn(repo, ...args);

const refusedBy = (
  cwd: string,
  ...args: string[]
): { status: number; stderr: string } => {
  try {
    genbaIn(cwd, ...args);
  } catch (error) {
    const failure = error as { status: number; stderr: Buffer };
    return { status: failure.status, stderr: failure.stderr.toString() };
  }
  throw new Error(`genba ${args.join(' ')} should have been refused`);
};

const forge = (): FakeForgeState =>
  JSON.parse(readFileSync(forgeState, 'utf8')) as FakeForgeState;

const agentEvents = (): Record<string, unknown>[] =>
  readFileSync(agentLog, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>);

const orderOf = (slug: string) =>
  JSON.parse(genba('order', slug, '--json')) as {
    order: { status: string; prUrl: string | null };
    steps: { stationId: string; status: string; attemptsUsed: number }[];
    jobs: { stationId: string; status: string; tier: string | null }[];
  };

const settled = async (slug: string) => {
  const deadline = Date.now() + SETTLE_MS;
  for (;;) {
    const detail = orderOf(slug);
    if (['delivered', 'blocked', 'cancelled'].includes(detail.order.status)) {
      return detail;
    }
    if (Date.now() > deadline) {
      throw new Error(`order did not settle: ${JSON.stringify(detail)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
};

const eventually = async <T>(read: () => T | undefined): Promise<T> => {
  const deadline = Date.now() + SETTLE_MS;
  for (;;) {
    let value: T | undefined;
    try {
      value = read();
    } catch {
      value = undefined;
    }
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error('condition never held');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
};

const freePort = async (): Promise<number> => {
  const server = Bun.serve({ port: 0, fetch: () => new Response() });
  const { port } = server;
  await server.stop(true);
  return port!;
};

const addOrder = (slug: string, body: string, line = 'standard'): string => {
  const path = join(work, `${slug}.md`);
  writeFileSync(path, `---\ntitle: ${slug}\nline: ${line}\n---\n${body}\n`);
  return path;
};

describe('standalone genba on a fresh non-Bun repo', () => {
  beforeAll(async () => {
    execFileSync(process.execPath, [
      'build',
      '--compile',
      ENTRY,
      '--outfile',
      binary,
    ]);
    execFileSync('git', ['init', '--bare', '-b', 'main', origin]);
    mkdirSync(repo);
    git(repo, 'init', '-b', 'main');
    git(repo, 'config', 'user.name', 'genba test');
    git(repo, 'config', 'user.email', 'genba-test@example.invalid');
    writeFileSync(join(repo, 'Makefile'), 'test:\n\t@test ! -f broken.txt\n');
    writeFileSync(join(repo, 'AGENTS.md'), 'Keep it small.\n');
    git(repo, 'add', '--all');
    git(repo, 'commit', '-m', 'chore(repo): start');
    git(repo, 'remote', 'add', 'origin', origin);
    git(repo, 'push', '-u', 'origin', 'main');
    writeFileSync(
      forgeState,
      JSON.stringify({
        calls: [],
        failing: [],
        authenticated: true,
        labels: [],
        prs: [],
        issues: [],
      } satisfies FakeForgeState),
    );
    const stubs = [
      installStub('./fake-agent.ts', 'claude'),
      installStub('./fake-forge.ts', 'gh'),
      installStub('./fake-herdr.ts', 'herdr'),
    ];
    env = {
      ...process.env,
      PATH: [...stubs, process.env[PATH_ENV]].join(delimiter),
      GENBA_PORT: String(await freePort()),
      [FORGE_STATE_ENV]: forgeState,
      [AGENT_LOG_ENV]: agentLog,
      [AGENT_FIXED_ENV]: agentFixed,
      FAKE_HERDR_LOG: herdrLog,
    };
  }, SETTLE_MS);

  afterAll(() => {
    if (existsSync(binary)) genba('stop');
  }, SETTLE_MS);

  it('writes config and lines for the repo without copying built-in roles', () => {
    genba('init');

    const config = JSON.parse(
      readFileSync(join(repo, '.genba', 'config.json'), 'utf8'),
    );
    expect(existsSync(join(repo, '.genba', 'lines/standard.yml'))).toBe(true);
    expect(existsSync(join(repo, '.genba', 'roles/builder.md'))).toBe(false);
    expect(config).toMatchObject({
      rules: './.agents/rules',
      skills: './.agents/skills',
      project: 'shop',
      git: { provider: 'github', baseBranch: 'main' },
    });
    expect(git(repo, 'status', '--porcelain')).toBe('?? .genba/');
  });

  it(
    'delivers a verified pull request from an imported order',
    async () => {
      genba(
        'orders',
        'import',
        addOrder('add-greeting', 'Add a greeting file.'),
      );
      genba('start', '1');

      const { order, steps } = await settled('add-greeting');

      expect(order.status).toBe('delivered');
      expect(steps.map((step) => [step.stationId, step.status])).toEqual([
        ['build', 'passed'],
        ['quality-gate', 'passed'],
        ['audit', 'passed'],
        ['deliver', 'passed'],
      ]);
      const [pr] = forge().prs;
      expect(pr).toMatchObject({
        branch: 'genba/add-greeting',
        baseBranch: 'main',
        title: 'feat(app): add greeting',
        draft: false,
      });
      expect(pr!.body).toContain('`make test`');
      expect(order.prUrl).toBe(pr!.url);
      expect(forge().issues).toEqual([]);
      expect(git(origin, 'show', 'genba/add-greeting:greeting.txt')).toContain(
        'hello',
      );
      expect(
        git(origin, 'ls-tree', '-r', '--name-only', 'genba/add-greeting'),
      ).not.toContain('.cell');
      expect(existsSync(join(repo, '.worktrees', 'add-greeting'))).toBe(false);
      const runs = join(repo, '.genba-local', 'runs');
      const kept = readdirSync(runs, { recursive: true }).map(String);
      for (const file of ['prompt.md', 'report.md', 'gate.log', 'audit.md']) {
        expect(kept.some((path) => path.endsWith(`/${file}`))).toBe(true);
      }
      expect(kept.filter((path) => /\.sh(\.|$)/.test(path))).toEqual([]);
      const timeline = readFileSync(
        join(repo, '.genba-local', 'cells', 'cell-1', 'events.jsonl'),
        'utf8',
      );
      for (const action of [
        'claim',
        'worktree create',
        'agent start',
        'push',
      ]) {
        expect(timeline).toContain(`"action":"${action}"`);
      }
    },
    SETTLE_MS,
  );

  it('holds the live agent to its role and hides genba secrets from it', () => {
    const events = agentEvents();

    expect(events.find((e) => e['event'] === 'early-done')).toMatchObject({
      exitCode: 1,
      stderr: expect.stringContaining('requires repository changes'),
    });
    expect(events.find((e) => e['event'] === 'done')).toMatchObject({
      exitCode: 0,
    });
    expect(events.find((e) => e['event'] === 'start')!['genbaEnv']).toEqual([
      'GENBA_CYCLE_TOKEN',
      'GENBA_OPERATOR_URL',
    ]);
  });

  it(
    'opens a draft pull request and an andon issue when the checks keep failing',
    async () => {
      genba('orders', 'import', addOrder('break-build', 'FORCE_FAILURE'));

      const { order, steps, jobs } = await settled('break-build');

      expect(order.status).toBe('blocked');
      expect(jobs.filter((job) => job.stationId === 'build')).toHaveLength(3);
      expect(steps.find((s) => s.stationId === 'quality-gate')).toMatchObject({
        status: 'failed',
        attemptsUsed: 3,
      });
      expect(jobs.map((job) => job.stationId).slice(-2)).toEqual([
        'mechanic',
        'escalate',
      ]);
      const draft = forge().prs.find((pr) => pr.branch === 'genba/break-build');
      expect(draft).toMatchObject({ draft: true, baseBranch: 'main' });
      const [issue] = forge().issues;
      expect(issue).toMatchObject({ label: 'genba:andon' });
      expect(issue!.body).toContain('broken.txt breaks make test');
      expect(issue!.body).toContain(draft!.url);
      const [incident] = JSON.parse(genba('incident', '--json'));
      expect(incident).toMatchObject({
        reason: 'step_retries_exhausted',
        triageOwner: 'supervisor',
        issueUrl: issue!.url,
        draftPrUrl: draft!.url,
      });
    },
    SETTLE_MS,
  );

  it(
    'redoes an escalated order from scratch once a human resolves it',
    async () => {
      writeFileSync(agentFixed, '');
      const [incident] = JSON.parse(genba('incident', '--json'));

      genba('incident', 'resolve', incident.id, 'restart_from_scratch');
      const { order } = await settled('break-build');

      expect(order.status).toBe('delivered');
      expect(
        forge().prs.filter((pr) => pr.branch === 'genba/break-build'),
      ).toEqual([expect.objectContaining({ draft: false })]);
      expect(
        git(origin, 'ls-tree', '-r', '--name-only', 'genba/break-build'),
      ).not.toContain('broken.txt');
      expect(JSON.parse(genba('incident', '--json'))).toEqual([]);
    },
    SETTLE_MS,
  );

  it(
    'kills the runner of a crashed cell before another cell takes the job',
    async () => {
      genba('orders', 'import', addOrder('crash-recovery', 'HANG_ONCE'));
      const hang = await eventually(() =>
        agentEvents().find((event) => event['event'] === 'hang'),
      );
      const runnerPid = hang['pid'] as number;
      const [cell] = JSON.parse(genba('queue', '--json')).cells;

      process.kill(cell.pid, 'SIGKILL');
      const { order, jobs, steps } = await settled('crash-recovery');

      expect(order.status).toBe('delivered');
      expect(() => process.kill(runnerPid, 0)).toThrow();
      expect(
        readFileSync(
          join(repo, '.genba-local', 'cells', cell.cellId, 'crash.jsonl'),
          'utf8',
        ),
      ).toContain('cell crash');
      expect(
        jobs.slice(0, 2).map((job) => [job.stationId, job.status]),
      ).toEqual([
        ['build', 'cancelled'],
        ['build', 'completed'],
      ]);
      expect(steps[0]).toMatchObject({ attemptsUsed: 2 });
    },
    SETTLE_MS,
  );

  it(
    'requeues a running job without spending an attempt when cells are scaled down',
    async () => {
      writeFileSync(agentLog, '');
      genba('orders', 'import', addOrder('scale-down', 'HANG_ONCE'));
      const hang = await eventually(() =>
        agentEvents().find((event) => event['event'] === 'hang'),
      );

      genba('scale', '0');

      expect(() => process.kill(hang['pid'] as number, 0)).toThrow();
      expect(orderOf('scale-down').steps[0]).toMatchObject({
        status: 'pending',
        attemptsUsed: 0,
      });
      genba('scale', '1');
      expect((await settled('scale-down')).order.status).toBe('delivered');
    },
    SETTLE_MS,
  );

  it(
    'stacks a child on its parent branch and follows it with `genba run`',
    () => {
      const path = addOrder('run-once', 'Add a greeting.');
      writeFileSync(
        path,
        '---\ntitle: run-once\ndepends_on: add-greeting\n---\nAdd another.\n',
      );

      const output = genba('run', path);

      expect(output).toContain('run-once: delivered https://');
      expect(
        forge().prs.find((pr) => pr.branch === 'genba/run-once'),
      ).toMatchObject({ baseBranch: 'genba/add-greeting' });
    },
    SETTLE_MS,
  );

  it(
    'stops the agent before it cancels a running order',
    async () => {
      writeFileSync(agentLog, '');
      genba('orders', 'import', addOrder('cancel-me', 'HANG_ONCE'));
      const hang = await eventually(() =>
        agentEvents().find((event) => event['event'] === 'hang'),
      );

      genba('order', 'cancel', 'cancel-me');

      expect(() => process.kill(hang['pid'] as number, 0)).toThrow();
      expect(orderOf('cancel-me').order.status).toBe('cancelled');
    },
    SETTLE_MS,
  );

  it(
    'delivers independent orders on several cells at once',
    async () => {
      const slugs = ['one', 'two', 'three', 'four', 'five', 'six'].map(
        (name) => `parallel-${name}`,
      );
      genba('scale', '3');

      genba(
        'orders',
        'import',
        ...slugs.map((slug) => addOrder(slug, 'Add a file.')),
      );
      const results = await Promise.all(slugs.map(settled));

      expect(results.map((result) => result.order.status)).toEqual(
        slugs.map(() => 'delivered'),
      );
      expect(
        forge().prs.filter((pr) => pr.branch?.startsWith('genba/parallel-')),
      ).toHaveLength(slugs.length);
      expect(JSON.parse(genba('incident', '--json'))).toEqual([]);
    },
    SETTLE_MS,
  );

  it('refuses web pages and callers without the token', async () => {
    const url = `http://127.0.0.1:${env['GENBA_PORT']}/api/v1/health`;
    const token = readFileSync(join(repo, '.genba-local', 'cli-token'), 'utf8');
    const authorization = `Bearer ${token}`;

    const attempts: Record<string, string>[] = [
      { authorization },
      {},
      { authorization: 'Bearer wrong' },
      { authorization, origin: 'https://evil.example' },
      { authorization, host: 'evil.example' },
    ];

    const statuses = await Promise.all(
      attempts.map(async (headers) => (await fetch(url, { headers })).status),
    );

    expect(statuses).toEqual([200, 401, 401, 403, 403]);
  });

  it('stops cells and the daemon', () => {
    genba('stop');

    expect(existsSync(join(repo, '.genba-local', 'daemon.pid'))).toBe(false);
    expect(() => genba('queue')).toThrow();
  });

  it(
    'runs each changeover hook once for an order, in its own directory',
    () => {
      const path = join(repo, '.genba', 'lines', 'fast.yml');
      const original = readFileSync(path, 'utf8');
      const counted = original.replace(
        /changeover:[\s\S]*?(?=operators:)/,
        [
          'changeover:',
          '  root:',
          '    exec:',
          '      - git fetch origin',
          `      - basename "$PWD" >> ${hookLog}`,
          '  worktree:',
          '    exec:',
          `      - basename "$PWD" >> ${hookLog}`,
          '',
        ].join('\n'),
      );
      writeFileSync(path, counted);
      const order = join(work, 'changeover.md');
      writeFileSync(order, '---\ntitle: changeover\nline: fast\n---\nAdd.\n');

      const output = genba('run', order);

      expect(output).toContain('changeover: delivered');
      expect(readFileSync(hookLog, 'utf8').trim().split('\n')).toEqual([
        'shop',
        'changeover',
      ]);
      genba('stop');
      writeFileSync(path, original);
    },
    SETTLE_MS,
  );

  it(
    'creates no worktree when changeover.root fails, and refuses a missing ADR',
    async () => {
      const path = join(repo, '.genba', 'lines', 'fast.yml');
      const original = readFileSync(path, 'utf8');
      writeFileSync(path, original.replace('git fetch origin', 'exit 3'));
      genba('orders', 'import', addOrder('bad-root', 'Add.', 'fast'));
      genba('start', '1');

      const failed = await settled('bad-root');

      expect(failed.order.status).toBe('blocked');
      expect(failed.jobs[0]).toMatchObject({ stationId: 'build' });
      expect(JSON.parse(genba('incident', '--json'))[0]).toMatchObject({
        reason: 'env_error',
        summary: expect.stringContaining('changeover.root command `exit 3`'),
      });
      const [first] = JSON.parse(genba('incident', '--json'));
      genba('incident', 'resolve', first.id, 'cancel');

      writeFileSync(
        path,
        original.replace('requireAdr: false', 'requireAdr: true'),
      );
      genba('orders', 'import', addOrder('no-adr', 'Add.', 'fast'));
      const undocumented = await settled('no-adr');

      expect(undocumented.order.status).toBe('blocked');
      const [second] = JSON.parse(genba('incident', '--json'));
      expect(second.summary).toContain('requireAdr needs exactly one new');
      genba('incident', 'resolve', second.id, 'cancel');
      genba('stop');
      writeFileSync(path, original);
    },
    SETTLE_MS,
  );

  it(
    'runs agents in herdr panes when the config asks for it',
    async () => {
      const path = join(repo, '.genba', 'config.json');
      const original = readFileSync(path, 'utf8');
      writeFileSync(
        path,
        JSON.stringify({ ...JSON.parse(original), herdr: true }),
      );
      writeFileSync(agentLog, '');
      genba('orders', 'import', addOrder('in-a-pane', 'Add a greeting.'));
      genba('start', '1');

      const { order } = await settled('in-a-pane');

      expect(order.status).toBe('delivered');
      const calls = readFileSync(herdrLog, 'utf8');
      expect(calls).toContain('--label in-a-pane:build');
      expect(calls).toContain('--label in-a-pane:audit');
      // The last agent tab stays open, so only the first one was closed.
      expect(calls.match(/^tab close/gm)).toHaveLength(1);
      expect(calls).toMatch(
        /^workspace create --label genba:shop-\w{6}:cell-1 /m,
      );
      expect(calls).not.toContain('--label in-a-pane:quality-gate');
      const starts = agentEvents().filter((e) => e['event'] === 'start');
      expect(starts.map((e) => e['interactive'])).toEqual([true, true]);
      expect(starts[0]!['genbaEnv']).toEqual([
        'GENBA_CYCLE_TOKEN',
        'GENBA_OPERATOR_URL',
      ]);
      genba('stop');
      expect(readFileSync(herdrLog, 'utf8')).toMatch(/^workspace close /m);
      writeFileSync(path, original);
    },
    SETTLE_MS,
  );

  it(
    'runs one order without a daemon and closes its temporary workspace',
    () => {
      const config = join(repo, '.genba', 'config.json');
      const original = readFileSync(config, 'utf8');
      writeFileSync(
        config,
        JSON.stringify({ ...JSON.parse(original), herdr: true }),
      );
      writeFileSync(herdrLog, '');
      const path = addOrder('solo', 'Add a greeting.');

      const output = genba('run', path, '--once');

      expect(output).toContain('solo: delivered https://');
      expect(output).toContain('agent start');
      expect(existsSync(join(repo, '.genba-local', 'daemon.pid'))).toBe(false);
      expect(() => genba('queue')).toThrow();
      const calls = readFileSync(herdrLog, 'utf8');
      expect(calls).toMatch(
        /^workspace create --label genba:shop-\w{6}:once-[0-9a-f]{8} /m,
      );
      expect(calls).toMatch(/^workspace close /m);
      expect(readdirSync(join(repo, '.genba-local', 'cells'))).toEqual([]);
      expect(() => genba('run', path, '--once')).toThrow(/earlier run/);
      writeFileSync(config, original);
    },
    SETTLE_MS,
  );

  it(
    'keeps the temporary workspace when a one-off order is blocked',
    () => {
      const config = join(repo, '.genba', 'config.json');
      const original = readFileSync(config, 'utf8');
      writeFileSync(
        config,
        JSON.stringify({ ...JSON.parse(original), herdr: true }),
      );
      const roleDir = join(repo, '.genba', 'roles');
      const role = join(roleDir, 'builder.md');
      mkdirSync(roleDir, { recursive: true });
      writeFileSync(
        role,
        '---\nid: builder\nstage: runtime\nextends: builtin:builder\nrules: [ghost]\n---\n',
      );
      writeFileSync(herdrLog, '');

      expect(() =>
        genba('run', addOrder('stuck-solo', 'Add.', 'fast'), '--once'),
      ).toThrow(/is kept so you can look/);

      expect(readFileSync(herdrLog, 'utf8')).not.toMatch(/^workspace close /m);
      rmSync(role);
      writeFileSync(config, original);
    },
    SETTLE_MS,
  );

  it(
    'names cells by slot and removes what a stopped cell left',
    () => {
      const cellsDir = join(repo, '.genba-local', 'cells');
      const names = (): string[] =>
        (JSON.parse(genba('queue', '--json')).cells as { cellId: string }[])
          .map((cell) => cell.cellId)
          .sort();

      // A blocked one-off order keeps its Cell folder; the daemon leaves it alone.
      for (const name of readdirSync(cellsDir)) {
        rmSync(join(cellsDir, name), { recursive: true });
      }
      genba('start', '2');
      expect(names()).toEqual(['cell-1', 'cell-2']);
      expect(readdirSync(cellsDir).sort()).toEqual(['cell-1', 'cell-2']);

      genba('scale', '1');
      expect(names()).toEqual(['cell-1']);
      expect(readdirSync(cellsDir)).toEqual(['cell-1']);

      genba('scale', '0');
      expect(readdirSync(cellsDir)).toEqual([]);
      expect(
        readdirSync(join(repo, '.genba-local', 'logs')).filter((name) =>
          name.startsWith('cell-'),
        ),
      ).toEqual([]);
      genba('stop');
    },
    SETTLE_MS,
  );

  it(
    'tells the agent what to read, and stops when a listed rule is missing',
    async () => {
      const prompt = agentEvents().find((e) => e['event'] === 'start');
      expect(prompt!['rules']).toEqual(['AGENTS.md']);
      const roleDir = join(repo, '.genba', 'roles');
      const path = join(roleDir, 'builder.md');
      mkdirSync(roleDir, { recursive: true });
      writeFileSync(
        path,
        '---\nid: builder\nstage: runtime\nextends: builtin:builder\nrules: [ghost]\n---\n',
      );
      genba('orders', 'import', addOrder('no-rule', 'Add.', 'fast'));
      genba('start', '1');

      const { order } = await settled('no-rule');

      expect(order.status).toBe('blocked');
      const [incident] = JSON.parse(genba('incident', '--json'));
      expect(incident.summary).toContain('.agents/rules/ghost.md');
      genba('incident', 'resolve', incident.id, 'cancel');
      genba('stop');
      rmSync(path);
    },
    SETTLE_MS,
  );

  it('removes the `import` command', () => {
    const refusal = refusedBy(repo, 'import', addOrder('gone', 'Add.'));

    expect(refusal.status).toBe(EXIT.argument);
    expect(refusal.stderr).toContain('usage: genba');
  });

  it('lists orders import in help and no bare import', () => {
    const help = genba('--help');

    expect(help).toContain('orders import');
    expect(help).not.toMatch(/^\s+import /m);
  });

  it('refuses orders without a known subcommand', () => {
    for (const args of [['orders'], ['orders', 'export']]) {
      const refusal = refusedBy(repo, ...args);

      expect(refusal.status).toBe(EXIT.argument);
      expect(refusal.stderr).toContain('usage: genba');
    }
  });

  it('refuses to import when the orders folder is missing', () => {
    const refusal = refusedBy(repo, 'orders', 'import');

    expect(refusal.status).toBe(EXIT.refused);
    expect(refusal.stderr).toContain(join(repo, 'orders'));
  });

  it('refuses to import when orders/ holds no order files', () => {
    mkdirSync(join(repo, 'orders', 'nested'), { recursive: true });
    writeFileSync(join(repo, 'orders', 'notes.txt'), 'not an order\n');
    writeFileSync(
      join(repo, 'orders', 'nested', 'deep-order.md'),
      '---\ntitle: deep\n---\nAdd.\n',
    );

    const refusal = refusedBy(repo, 'orders', 'import');

    expect(refusal.status).toBe(EXIT.refused);
    expect(refusal.stderr).toContain(join(repo, 'orders'));
  });

  it('queues the queued orders in orders/ from any folder of the repo', () => {
    const orders = join(repo, 'orders');
    writeFileSync(
      join(orders, 'import-alpha.md'),
      '---\ntitle: alpha\n---\nAdd.\n',
    );
    writeFileSync(
      join(orders, 'import-beta.md'),
      '---\ntitle: beta\n---\nAdd.\n',
    );
    writeFileSync(
      join(orders, 'import-done.md'),
      '---\ntitle: done\nstatus: done\n---\nAdd.\n',
    );
    const deeper = join(repo, 'sub', 'deeper');
    mkdirSync(deeper, { recursive: true });

    expect(genbaIn(deeper, 'orders', 'import').trim()).toBe(
      'imported 2, already known 0, not queued 1',
    );
    const slugs = (
      JSON.parse(genba('queue', '--json')).orders as { slug: string }[]
    ).map((order) => order.slug);
    expect(slugs).toEqual(
      expect.arrayContaining(['import-alpha', 'import-beta']),
    );
    expect(slugs).not.toContain('import-done');
    expect(slugs).not.toContain('deep-order');
  });

  it('skips slugs already queued when importing again', () => {
    expect(genba('orders', 'import').trim()).toBe(
      'imported 0, already known 2, not queued 1',
    );
  });

  it('queues only the given files and folders, relative to the current folder', () => {
    writeFileSync(
      join(repo, 'import-extra.md'),
      '---\ntitle: extra\n---\nAdd.\n',
    );
    mkdirSync(join(repo, 'batch'));
    writeFileSync(
      join(repo, 'batch', 'import-batch.md'),
      '---\ntitle: batch\n---\nAdd.\n',
    );
    const deeper = join(repo, 'sub', 'deeper');

    expect(
      genbaIn(
        deeper,
        'orders',
        'import',
        '../../import-extra.md',
        '../../batch',
      ).trim(),
    ).toBe('imported 2, already known 0, not queued 0');
  });
});
