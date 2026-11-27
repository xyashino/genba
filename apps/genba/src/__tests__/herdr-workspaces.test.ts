import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFileLock } from '../adapters/fs/lock.ts';
import { createNodeFs } from '../adapters/fs/node-fs.ts';
import { createHerdrWorkspaces } from '../adapters/runners/herdr-workspaces.ts';
import { createProcessAdapter } from '../adapters/process/spawn.ts';
import type { ProcessPort } from '../ports/process.port.ts';
import { tempDir } from './support/stub-bin.ts';

type Listed = { workspace_id: string; label: string };

const herdrWith = (workspaces: Listed[]) => {
  const calls: string[] = [];
  const processes: ProcessPort = {
    ...createProcessAdapter(),
    run: async (_command, args) => {
      calls.push(args.join(' '));
      const reply = (result: object) => ({
        exitCode: 0,
        stdout: JSON.stringify({ result }),
        stderr: '',
      });
      if (args[1] === 'list') return reply({ workspaces });
      if (args[1] === 'create') {
        const id = `w${workspaces.length + 1}`;
        workspaces.push({ workspace_id: id, label: args[3]! });
        return reply({ workspace: { workspace_id: id } });
      }
      if (args[1] === 'close') {
        workspaces.splice(
          workspaces.findIndex((entry) => entry.workspace_id === args[2]),
          1,
        );
      }
      return reply({});
    },
  };
  const port = createHerdrWorkspaces({
    process: processes,
    fs: createNodeFs(),
    lock: createFileLock('herdr.lock'),
    dataDir: join(tempDir('workspaces'), '.genba-local'),
  });
  return { port, calls, workspaces };
};

describe('herdr workspaces', () => {
  it('creates a workspace once and closes it again', async () => {
    const { port, calls, workspaces } = herdrWith([]);

    const first = await port.ensure('genba:x:cell-1', 'logs');

    await expect(port.ensure('genba:x:cell-1', 'logs')).resolves.toBe(first);
    expect(
      calls.filter((call) => call.startsWith('workspace create')),
    ).toHaveLength(1);
    await port.remove('genba:x:cell-1');
    expect(workspaces).toEqual([]);
  });

  it('never reuses or closes a same-named workspace it did not create', async () => {
    const { port, workspaces } = herdrWith([
      { workspace_id: 'mine', label: 'genba:x:cell-1' },
    ]);

    await expect(port.ensure('genba:x:cell-1', 'logs')).rejects.toThrow(
      'genba did not create it',
    );
    await port.remove('genba:x:cell-1');

    expect(workspaces).toEqual([
      { workspace_id: 'mine', label: 'genba:x:cell-1' },
    ]);
  });
});
