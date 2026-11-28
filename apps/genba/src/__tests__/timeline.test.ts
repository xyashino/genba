import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createNodeFs } from '@repo/host/fs/node-fs';
import { crashPathOf, timelinePathOf } from '@repo/line/cells';
import { renderEntry, timelineLineOf } from '@repo/line/timeline';
import { timelineReader } from '../runtimes/cli/commands/watch-full.ts';
import { tempDir } from './support/stub-bin.ts';

const entry = (second: number, cell: string, order: string) => ({
  at: `2026-01-01T12:00:0${second}.000Z`,
  cell,
  order,
  action: `step-${second}`,
});

const write = (root: string, path: string, text: string): void => {
  mkdirSync(join(root, path, '..'), { recursive: true });
  appendFileSync(join(root, path), text);
};

const actions = async (read: ReturnType<typeof timelineReader>) =>
  (await read()).map((item) => item.action);

describe('full watch', () => {
  it('replays history oldest first, crash log included, then only new entries', async () => {
    const root = tempDir('timeline');
    write(root, crashPathOf('cell-1'), timelineLineOf(entry(1, 'cell-1', 'a')));
    write(
      root,
      timelinePathOf('cell-2'),
      timelineLineOf(entry(2, 'cell-2', 'a')),
    );
    write(
      root,
      timelinePathOf('cell-1'),
      timelineLineOf(entry(3, 'cell-1', 'b')),
    );
    const read = timelineReader(createNodeFs(), root, {});

    expect(await actions(read)).toEqual(['step-1', 'step-2', 'step-3']);
    expect(await actions(read)).toEqual([]);

    const next = timelineLineOf(entry(4, 'cell-2', 'a'));
    write(root, timelinePathOf('cell-2'), next.slice(0, 20));
    expect(await actions(read)).toEqual([]);
    write(root, timelinePathOf('cell-2'), next.slice(20));
    expect(await actions(read)).toEqual(['step-4']);
  });

  it('filters by cell and by order', async () => {
    const root = tempDir('timeline-filter');
    write(
      root,
      timelinePathOf('cell-1'),
      timelineLineOf(entry(1, 'cell-1', 'a')),
    );
    write(
      root,
      timelinePathOf('cell-2'),
      timelineLineOf(entry(2, 'cell-2', 'b')),
    );
    const fs = createNodeFs();

    expect(await actions(timelineReader(fs, root, { cell: 'cell-2' }))).toEqual(
      ['step-2'],
    );
    expect(await actions(timelineReader(fs, root, { order: 'a' }))).toEqual([
      'step-1',
    ]);
  });

  it('keeps command output from driving the terminal', () => {
    const line = renderEntry(
      {
        ...entry(1, 'cell-1', 'a'),
        detail: '\u001b[2Jwiped\u0007\r\u001b]0;x',
      },
      false,
    );

    expect(line).toContain('wiped');
    expect(line).not.toMatch(/\p{Cc}/u);
  });

  it('shows nothing when no Cell has a log', async () => {
    const root = tempDir('timeline-empty');
    writeFileSync(join(root, 'unrelated'), '');

    expect(await actions(timelineReader(createNodeFs(), root, {}))).toEqual([]);
  });
});
