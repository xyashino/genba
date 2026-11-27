import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFileLock } from '../adapters/fs/lock.ts';
import { tempDir } from './support/stub-bin.ts';

const FILE = 'changeover.lock';
const never = new AbortController().signal;

describe('lock between Cells', () => {
  it('runs one holder at a time', async () => {
    const dir = tempDir('lock');
    const events: string[] = [];
    const hold = (name: string) =>
      createFileLock(FILE).withLock(dir, never, async () => {
        events.push(`${name} in`);
        await Bun.sleep(300);
        events.push(`${name} out`);
      });

    await Promise.all([hold('a'), hold('b')]);

    expect(events).toEqual(['a in', 'a out', 'b in', 'b out']);
  });

  it('takes over a lock left by a dead process', async () => {
    const dir = tempDir('lock-stale');
    writeFileSync(join(dir, FILE), '999999999\n');

    await expect(
      createFileLock(FILE).withLock(dir, never, async () => 'ran'),
    ).resolves.toBe('ran');
  });
});
