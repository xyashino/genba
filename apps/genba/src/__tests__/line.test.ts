import { describe, expect, it } from 'vitest';
import { templateAssets } from '../builtin/assets.ts';
import { BUILTIN_LINES } from '../builtin/registry.ts';
import { checksOfLine, parseLine } from '../domain/line.ts';

const LINE_PREFIX = '.genba/lines/';

const written = (values: { runner: string; hasOrigin: boolean }) =>
  templateAssets({
    project: { setup: ['npm ci'], verify: ['npm test'] },
    has: () => false,
    ...values,
  })
    .filter((asset) => asset.path.startsWith(LINE_PREFIX))
    .map((asset) => parseLine(asset.text));

const edited = (from: string, to: string): string =>
  BUILTIN_LINES.standard.replace(from, to);

describe('Line files', () => {
  it('writes the detected commands into every line', () => {
    const lines = written({ runner: 'claude', hasOrigin: true });

    expect(lines.map((line) => line.name).sort()).toEqual([
      'fast',
      'feature',
      'standard',
    ]);
    for (const line of lines) {
      expect(line.changeover.root?.exec).toEqual(['git fetch origin']);
      expect(line.changeover.worktree?.exec).toEqual(['npm ci']);
      expect(checksOfLine(line)).toEqual(['npm test']);
      expect(line.mechanic.model).toBe('sonnet');
    }
  });

  it('drops claude models for another runner and the fetch without an origin', () => {
    const [line] = written({ runner: 'codex', hasOrigin: false });

    expect(line?.changeover.root).toBeUndefined();
    expect(line?.operators['builder']).toMatchObject({ runner: 'codex' });
    expect(line?.operators['builder']?.model).toBeUndefined();
  });

  it('reads durations and defaults them to 30 minutes', () => {
    const line = parseLine(edited('timeout: 60m', 'timeout: 90s'));

    expect(line.operators['builder']?.timeoutMs).toBe(90_000);
    expect(
      parseLine(edited('    timeout: 60m\n', '')).operators['builder']
        ?.timeoutMs,
    ).toBe(1_800_000);
  });

  it.each([
    ['permission: write', 'headless: false', 'headless'],
    ['operator: builder', 'operator: ghost', 'unknown operator'],
    ['retry: build', 'retry: audit', 'earlier station'],
    ['id: quality-gate', 'id: deliver', 'reserved'],
    ['stations:', 'workspace: {}\nstations:', 'workspace'],
    ['timeout: 60m', 'timeout: soon', 'duration'],
  ])('rejects %s changed to %s', (from, to, reason) => {
    expect(() => parseLine(edited(from, to))).toThrow(reason);
  });
});
