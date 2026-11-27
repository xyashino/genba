import { promptFor } from './runner.ts';
import type { CommandSpec, RunnerAdapter } from './runner.ts';

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
    ...modelArgs(spec),
    '-i',
    promptFor(spec.promptFile),
  ],
  buildHeadlessCommand: (spec) => [
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
