import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
let env: Record<string, string | undefined> = {};

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, stdio: 'pipe' }).toString().trim();

const genba = (...args: string[]): string =>
  execFileSync(binary, args, { cwd: repo, env, stdio: 'pipe' }).toString();

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

const addOrder = (slug: string, body: string): string => {
  const path = join(work, `${slug}.md`);
  writeFileSync(path, `---\ntitle: ${slug}\n---\n${body}\n`);
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
    ];
    env = {
      ...process.env,
      PATH: [...stubs, process.env[PATH_ENV]].join(delimiter),
      GENBA_PORT: String(await freePort()),
      [FORGE_STATE_ENV]: forgeState,
      [AGENT_LOG_ENV]: agentLog,
      [AGENT_FIXED_ENV]: agentFixed,
    };
  }, SETTLE_MS);

  afterAll(() => {
    if (existsSync(binary)) genba('stop');
  }, SETTLE_MS);

  it('writes one config file from what the repo contains', () => {
    genba('init');

    const config = JSON.parse(
      readFileSync(join(repo, '.genba', 'config.json'), 'utf8'),
    );
    expect(config).toMatchObject({
      project: 'shop',
      git: { provider: 'github', baseBranch: 'main' },
      checks: { verify: ['make test'] },
      context: { rules: ['AGENTS.md'] },
      tiers: { fast: { runner: 'claude', model: 'haiku' } },
    });
    expect(git(repo, 'status', '--porcelain')).toBe('?? .genba/');
  });

  it(
    'delivers a verified pull request from an imported order',
    async () => {
      genba('import', addOrder('add-greeting', 'Add a greeting file.'));
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
      genba('import', addOrder('break-build', 'FORCE_FAILURE'));

      const { order, steps, jobs } = await settled('break-build');

      expect(order.status).toBe('blocked');
      expect(
        jobs.filter((job) => job.stationId === 'build').map((job) => job.tier),
      ).toEqual(['fast', 'strong', 'top']);
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
      genba('import', addOrder('crash-recovery', 'HANG_ONCE'));
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
      genba('import', addOrder('scale-down', 'HANG_ONCE'));
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
      genba('import', addOrder('cancel-me', 'HANG_ONCE'));
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

      genba('import', ...slugs.map((slug) => addOrder(slug, 'Add a file.')));
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
});
