import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createNodeFs } from '../fs/node-fs.ts';
import { createPidFile } from '../fs/pid-file.ts';
import { createProcessAdapter } from '../process/spawn.ts';
import { createSystemClock } from '../process/system-clock.ts';
import { tempDir } from './support/temp-dir.ts';

const port = createProcessAdapter();
const onlyAlive =
  (...alive: number[]) =>
  (pid: number): boolean =>
    alive.includes(pid);

describe('process adapter', () => {
  it('collects output, exit code, and extra env', async () => {
    const script =
      "process.stdout.write(process.env.GREETING); process.stderr.write('warn'); process.exit(3)";

    const result = await port.run(process.execPath, ['-e', script], '.', {
      GREETING: 'hello',
    });

    expect(result).toEqual({ exitCode: 3, stdout: 'hello', stderr: 'warn' });
  });

  it('reports a missing binary as exit 127', async () => {
    const result = await port.run('genba-no-such-binary', [], '.');

    expect(result.exitCode).toBe(127);
  });

  it('gives a prompting command end of input', async () => {
    const script = 'await Bun.stdin.text(); process.exit(0)';

    const result = await port.run(process.execPath, ['-e', script], '.');

    expect(result.exitCode).toBe(0);
  });

  it('runs a detached process that can be terminated', async () => {
    const logPath = join(tempDir('detached'), 'logs', 'daemon.log');
    const pid = await port.spawnDetached({
      command: process.execPath,
      args: ['-e', "console.log('up'); setInterval(() => {}, 1000)"],
      env: {},
      logPath,
    });
    await vi.waitFor(() =>
      expect(readFileSync(logPath, 'utf8')).toContain('up'),
    );
    const aliveBefore = port.isAlive(pid);

    port.terminate(pid);

    expect(aliveBefore).toBe(true);
    await vi.waitFor(() => expect(port.isAlive(pid)).toBe(false));
  });

  it('tells the time and waits', async () => {
    const clock = createSystemClock();
    const start = clock.now();

    await clock.sleep(20);

    expect(clock.now() - start).toBeGreaterThanOrEqual(15);
  });
});

describe('pid file', () => {
  it('refuses a slot held by a live process', async () => {
    const dir = tempDir('pid');
    const pidFile = createPidFile('cell.pid', onlyAlive(111));
    await pidFile.acquire(dir, 111);

    const claimed = await pidFile.acquire(dir, 222);

    expect(claimed).toBe(false);
    expect(await pidFile.read(dir)).toBe(111);
  });

  it('takes over a slot whose holder is gone', async () => {
    const dir = tempDir('pid');
    const pidFile = createPidFile('cell.pid', onlyAlive());
    await pidFile.write(dir, 333);

    const claimed = await pidFile.acquire(dir, 444);

    expect(claimed).toBe(true);
    expect(await pidFile.read(dir)).toBe(444);
  });

  it('frees the slot once removed', async () => {
    const dir = tempDir('pid');
    const pidFile = createPidFile('cell.pid', onlyAlive(111));
    await pidFile.acquire(dir, 111);

    await pidFile.remove(dir);

    expect(await pidFile.read(dir)).toBeNull();
    expect(await pidFile.acquire(dir, 222)).toBe(true);
  });
});

describe('fs adapter', () => {
  it('writes into new folders with the requested mode', async () => {
    const fs = createNodeFs();
    const path = join(tempDir('fs'), 'a', 'secret.txt');

    await fs.writeText(path, 'one\n', 0o600);
    await fs.appendText(path, 'two\n');

    expect(await fs.readText(path)).toBe('one\ntwo\n');
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it('lists sorted names and treats missing paths as empty', async () => {
    const fs = createNodeFs();
    const dir = tempDir('fs');
    await fs.writeText(join(dir, 'b.md'), 'b');
    await fs.writeText(join(dir, 'a.md'), 'a');
    const listed = await fs.list(dir);

    await fs.remove(join(dir, 'a.md'));

    expect(listed).toEqual(['a.md', 'b.md']);
    expect(await fs.exists(join(dir, 'a.md'))).toBe(false);
    expect(await fs.list(join(dir, 'missing'))).toEqual([]);
  });
});
