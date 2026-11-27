import { promptFor } from './runner.js';
import type { CommandSpec, RunnerAdapter } from './runner.js';

const BINARY = 'opencode';

const modelArgs = ({ model }: CommandSpec): string[] =>
  model === undefined ? [] : ['-m', model];

export const opencodeRunner: RunnerAdapter = {
  name: BINARY,
  binary: BINARY,
  buildCommand: (spec) => [
    BINARY,
    'run',
    ...modelArgs(spec),
    promptFor(spec.promptFile),
  ],
};
