import { readFileSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { createProcessAdapter } from '../../adapters/process/spawn.js';
import type { ProcessPort } from '../../ports/process.port.js';
import { FORGE_STATE_ENV } from './forge-state.js';
import type { FakeForgeState } from './forge-state.js';
import { installStub, tempDir } from './stub-bin.js';

export const createFakeForge = (binary: 'gh' | 'glab') => {
  const cwd = tempDir('forge');
  const statePath = join(cwd, 'state.json');
  const bin = installStub('./fake-forge.ts', binary);
  const real = createProcessAdapter();
  const write = (state: FakeForgeState): void =>
    writeFileSync(statePath, JSON.stringify(state));
  const read = (): FakeForgeState =>
    JSON.parse(readFileSync(statePath, 'utf8')) as FakeForgeState;
  write({
    calls: [],
    failing: [],
    authenticated: true,
    labels: [],
    prs: [],
    issues: [],
  });
  const process: ProcessPort = {
    ...real,
    run: (command, args, dir, env) =>
      real.run(command, args, dir, {
        ...env,
        PATH: `${bin}${delimiter}${globalThis.process.env['PATH'] ?? ''}`,
        [FORGE_STATE_ENV]: statePath,
      }),
  };
  return {
    cwd,
    process,
    read,
    update: (change: (state: FakeForgeState) => void): void => {
      const state = read();
      change(state);
      write(state);
    },
  };
};
