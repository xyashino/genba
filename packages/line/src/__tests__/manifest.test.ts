import { describe, expect, expectTypeOf, it } from 'vitest';
import { parseRepoManifest } from '../manifest.ts';
import type { RepoManifest } from '../manifest.ts';

describe('Repo manifest parser', () => {
  it('fills sensible defaults when only project name is supplied', () => {
    const manifest = parseRepoManifest({ project: 'payments-api' });

    expect(manifest.project).toBe('payments-api');
    expect(manifest.git).toEqual({ provider: 'github', baseBranch: 'main' });
    expect(manifest.defaults).toEqual({
      line: 'standard',
      cells: 1,
      minRemainingUsagePct: 10,
    });
    expectTypeOf(manifest).toEqualTypeOf<RepoManifest>();
  });

  it('parses custom gitlab host, and defaults', () => {
    const manifest = parseRepoManifest({
      project: 'core-service',
      git: { provider: 'gitlab', host: 'gitlab.company.com' },
      defaults: { line: 'feature', cells: 3 },
    });

    expect(manifest.git).toEqual({
      provider: 'gitlab',
      host: 'gitlab.company.com',
      baseBranch: 'main',
    });
    expect(manifest.defaults.cells).toBe(3);
  });

  it('reads rule and skill folders from inside the repo only', () => {
    expect(parseRepoManifest({ project: 'demo' })).toMatchObject({
      rules: '.agents/rules',
      skills: '.agents/skills',
    });
    expect(
      parseRepoManifest({ project: 'demo', rules: './docs/rules/' }).rules,
    ).toBe('docs/rules');
    for (const rules of ['/etc', '../shared', './']) {
      expect(() => parseRepoManifest({ project: 'demo', rules })).toThrow();
    }
  });

  it('rejects empty project names and invalid cell counts', () => {
    expect(() => parseRepoManifest({ project: '   ' })).toThrow();
    expect(() =>
      parseRepoManifest({ project: 'demo', defaults: { cells: 0 } }),
    ).toThrow();
  });
});
