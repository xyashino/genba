import { promptFor } from './runner.js';
import type { CommandSpec, RunnerAdapter } from './runner.js';

const BINARY = 'agy';

const modelArgs = ({ model }: CommandSpec): string[] =>
  model === undefined ? [] : ['--model', model];

export const antigravityRunner: RunnerAdapter = {
  name: 'antigravity',
  binary: BINARY,
  buildCommand: (spec) => [
    BINARY,
    '--mode',
    'auto',
    '--dangerously-skip-permissions',
    '--output-format',
    'json',
    ...modelArgs(spec),
    '-p',
    promptFor(spec.promptFile),
  ],
};
