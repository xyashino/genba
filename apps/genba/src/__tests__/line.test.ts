import { describe, expect, it } from 'vitest';
import { BUILTIN_LINES } from '../builtin/registry.js';
import { bindLine, parseLine, resolveAttemptModel } from '../domain/line.js';
import { parseRepoManifest } from '../domain/manifest.js';

describe('Built-in lines and retry escalation', () => {
  const manifest = parseRepoManifest({
    project: 'payments-api',
    workspace: { setup: ['bun install --frozen-lockfile'] },
    checks: { quick: ['bun run lint'], verify: ['bun run ci:verify'] },
  });

  it('parses every built-in YAML line and binds repo setup and verify hooks', () => {
    for (const [name, source] of Object.entries(BUILTIN_LINES)) {
      const line = parseLine(source);
      const bound = bindLine(line, manifest);
      const gate = bound.stations.find(
        (station) => station.kind === 'inspection',
      );

      expect(bound.name).toBe(name);
      expect(bound.setup).toEqual(['bun install --frozen-lockfile']);
      expect(gate?.commands).toEqual(['bun run ci:verify']);
    }
  });

  it('escalates model tiers across retry attempts and clamps at the top tier', () => {
    const standard = parseLine(BUILTIN_LINES.standard);
    const build = standard.stations.find(
      (station) => station.kind === 'operator' && station.id === 'build',
    );
    if (build?.kind !== 'operator') throw new Error('expected build station');

    expect(resolveAttemptModel(build, 1, manifest)).toEqual({
      tier: 'fast',
      runner: 'claude',
      model: 'haiku',
    });
    expect(resolveAttemptModel(build, 2, manifest)).toEqual({
      tier: 'strong',
      runner: 'claude',
      model: 'sonnet',
    });
    expect(resolveAttemptModel(build, 3, manifest)).toEqual({
      tier: 'top',
      runner: 'claude',
      model: 'opus',
    });
    expect(resolveAttemptModel(build, 9, manifest)).toEqual({
      tier: 'top',
      runner: 'claude',
      model: 'opus',
    });
  });
});
