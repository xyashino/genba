import { describe, expect, it } from 'vitest';
import { detectForgeRemote } from '../adapters/forge/detect.ts';
import { createGhForge } from '../adapters/forge/gh.ts';
import { createGlabForge } from '../adapters/forge/glab.ts';
import { createForgeRouter } from '../adapters/forge/router.ts';
import { ForgeError } from '../ports/forge.port.ts';
import { createFakeForge } from './support/forge-fixture.ts';

const FORGES = [
  { binary: 'gh', create: createGhForge, mr: 'pull', prCommand: 'pr' },
  {
    binary: 'glab',
    create: createGlabForge,
    mr: '-/merge_requests',
    prCommand: 'mr',
  },
] as const;

const setup = (forge: (typeof FORGES)[number]) => {
  const fake = createFakeForge(forge.binary);
  const port = forge.create(fake.process);
  const pr = {
    cwd: fake.cwd,
    branch: 'genba/add-login',
    baseBranch: 'main',
    title: 'feat(auth): add login',
    body: '## Changes\n- "quoted" $HOME `ticks`',
    draft: false,
  };
  const andon = {
    cwd: fake.cwd,
    orderSlug: 'add-login',
    title: 'Andon: add-login',
    body: 'quality gate failed',
  };
  return { fake, port, pr, andon };
};

describe.each(FORGES)('$binary forge', (forge) => {
  it('opens a ready PR and returns its URL and number', async () => {
    const { fake, port, pr } = setup(forge);

    const ref = await port.publishPr(pr);

    expect(ref).toEqual({
      url: expect.stringContaining(`/${forge.mr}/1`),
      number: 1,
    });
    expect(fake.read().prs).toMatchObject([
      { draft: false, baseBranch: 'main', title: pr.title, body: pr.body },
    ]);
  });

  it('opens a draft PR for unfinished work', async () => {
    const { fake, port, pr } = setup(forge);

    await port.publishPr({ ...pr, draft: true });

    expect(fake.read().prs).toMatchObject([{ draft: true }]);
  });

  it('updates the open PR, retargets it, and marks it ready', async () => {
    const { fake, port, pr } = setup(forge);
    const draft = await port.publishPr({ ...pr, draft: true });

    const ready = await port.publishPr({
      ...pr,
      baseBranch: 'genba/parent',
      title: 'feat(auth): finish login',
    });

    expect(ready).toEqual(draft);
    expect(fake.read().prs).toMatchObject([
      {
        draft: false,
        baseBranch: 'genba/parent',
        title: 'feat(auth): finish login',
      },
    ]);
  });

  it('turns a ready PR back into a draft on escalation', async () => {
    const { fake, port, pr } = setup(forge);
    await port.publishPr(pr);

    await port.publishPr({ ...pr, draft: true });

    expect(fake.read().prs).toMatchObject([{ draft: true }]);
  });

  it('opens a new PR when the old one for the branch is merged', async () => {
    const { fake, port, pr } = setup(forge);
    await port.publishPr(pr);
    fake.update((state) => {
      state.prs[0]!.state = 'merged';
    });

    const ref = await port.publishPr(pr);

    expect(ref.number).toBe(2);
  });

  it.each(['open', 'merged', 'closed'] as const)(
    'reports a %s PR',
    async (status) => {
      const { fake, port, pr } = setup(forge);
      const { number } = await port.publishPr(pr);
      fake.update((state) => {
        state.prs[0]!.state = status;
      });

      const result = await port.getPrStatus(fake.cwd, number);

      expect(result).toBe(status);
    },
  );

  it('opens one andon issue per order and updates it on repeat', async () => {
    const { fake, port, andon } = setup(forge);
    const first = await port.upsertAndonIssue(andon);

    const again = await port.upsertAndonIssue({ ...andon, body: 'still red' });

    expect(again).toEqual(first);
    expect(fake.read().issues).toMatchObject([{ label: 'genba:andon' }]);
    expect(fake.read().issues[0]?.body).toContain('still red');
  });

  it('keeps orders with similar slugs in separate issues', async () => {
    const { fake, port, andon } = setup(forge);
    await port.upsertAndonIssue({ ...andon, orderSlug: 'add-login-form' });

    await port.upsertAndonIssue(andon);

    expect(fake.read().issues).toHaveLength(2);
    expect(fake.read().labels).toEqual(['genba:andon']);
  });

  it('finds an andon issue beyond the first hundred', async () => {
    const { fake, port, andon } = setup(forge);
    const first = await port.upsertAndonIssue(andon);
    fake.update((state) => {
      const filler = Array.from({ length: 100 }, (_, index) => ({
        ...state.issues[0]!,
        number: index + 100,
        body: 'other order',
      }));
      state.issues.unshift(...filler);
    });

    const again = await port.upsertAndonIssue(andon);

    expect(again).toEqual(first);
  });

  it('raises a forge error without leaking the PR body', async () => {
    const { fake, port, pr } = setup(forge);
    fake.update((state) => {
      state.failing.push(`${forge.prCommand} create`);
    });

    const attempt = port.publishPr(pr);

    await expect(attempt).rejects.toThrow(ForgeError);
    await expect(attempt).rejects.toThrow(
      `${forge.binary} ${forge.prCommand} create failed: ${forge.binary}: HTTP 502`,
    );
  });

  it('reports whether the CLI is signed in', async () => {
    const { fake, port } = setup(forge);
    const signedIn = await port.checkAuth(fake.cwd);
    fake.update((state) => {
      state.authenticated = false;
    });

    const signedOut = await port.checkAuth(fake.cwd);

    expect([signedIn, signedOut]).toEqual([true, false]);
  });
});

describe('forge remote detection', () => {
  it.each([
    ['git@github.com:acme/app.git', 'github.com', 'github'],
    ['https://github.com/acme/app', 'github.com', 'github'],
    ['ssh://git@gitlab.com:22/acme/app.git', 'gitlab.com', 'gitlab'],
    ['https://token@gitlab.acme.io/a/b.git', 'gitlab.acme.io', 'gitlab'],
    ['git@code.acme.io:acme/app.git', 'code.acme.io', null],
  ])('reads %s', (url, host, provider) => {
    expect(detectForgeRemote(url)).toEqual({ host, provider });
  });

  it.each(['/srv/git/app.git', '../app', 'file:///srv/app.git', 'C:\\app'])(
    'finds no forge in the local remote %s',
    (url) => {
      expect(detectForgeRemote(url)).toBeNull();
    },
  );
});

describe('forge router', () => {
  const spec = (cwd: string) => ({
    cwd,
    branch: 'genba/a',
    baseBranch: 'main',
    title: 'a',
    body: 'a',
    draft: false,
  });

  it('picks the forge from the origin remote', async () => {
    const fake = createFakeForge('glab');
    const router = createForgeRouter({
      process: fake.process,
      git: { remoteUrl: async () => 'git@gitlab.com:acme/app.git' },
    });

    const ref = await router.publishPr(spec(fake.cwd));

    expect(ref.url).toContain('/-/merge_requests/');
  });

  it('prefers the configured provider for a self-hosted remote', async () => {
    const fake = createFakeForge('gh');
    const router = createForgeRouter({
      process: fake.process,
      git: { remoteUrl: async () => 'git@code.acme.io:acme/app.git' },
      config: { provider: 'github' },
    });

    const ref = await router.publishPr(spec(fake.cwd));

    expect(ref.number).toBe(1);
  });

  it('asks for git.provider when nothing names the forge', async () => {
    const fake = createFakeForge('gh');
    const router = createForgeRouter({
      process: fake.process,
      git: { remoteUrl: async () => null },
    });

    const attempt = router.publishPr(spec(fake.cwd));

    await expect(attempt).rejects.toThrow('set git.provider');
  });
});
