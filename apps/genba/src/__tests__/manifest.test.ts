import { describe, expect, expectTypeOf, it } from 'vitest';
import { parseRepoManifest } from '../domain/manifest.ts';
import type { RepoManifest } from '../domain/manifest.ts';

describe('Repo manifest parser', () => {
  it('fills sensible defaults when only project name is supplied', () => {
    const manifest = parseRepoManifest({ project: 'payments-api' });

    expect(manifest.project).toBe('payments-api');
    expect(manifest.git).toEqual({ provider: 'github' });
    expect(manifest.defaults).toEqual({
      line: 'standard',
      cells: 1,
      minRemainingUsagePct: 10,
    });
    expect(manifest.tiers.fast).toEqual({ runner: 'claude', model: 'haiku' });
    expectTypeOf(manifest).toEqualTypeOf<RepoManifest>();
  });

  it('parses custom gitlab host, verify checks, and tiers', () => {
    const manifest = parseRepoManifest({
      project: 'core-service',
      git: { provider: 'gitlab', host: 'gitlab.company.com' },
      workspace: { setup: ['uv sync --frozen'] },
      checks: { quick: ['ruff check .'], verify: ['pytest'] },
      context: { rules: ['AGENTS.md'], conventions: ['Add OpenAPI diff'] },
      defaults: { line: 'feature', cells: 3 },
      tiers: {
        fast: { runner: 'antigravity', model: 'gemini-3.8-flash-medium' },
        strong: { runner: 'claude', model: 'sonnet' },
        top: { runner: 'claude', model: 'opus' },
      },
    });

    expect(manifest.git).toEqual({
      provider: 'gitlab',
      host: 'gitlab.company.com',
    });
    expect(manifest.checks.verify).toEqual(['pytest']);
    expect(manifest.defaults.cells).toBe(3);
  });

  it('rejects empty project names and invalid cell counts', () => {
    expect(() => parseRepoManifest({ project: '   ' })).toThrow();
    expect(() =>
      parseRepoManifest({ project: 'demo', defaults: { cells: 0 } }),
    ).toThrow();
  });
});
