import { promptFor } from './runner.ts';
import type { CommandSpec, RunnerAdapter } from './runner.ts';

const BINARY = 'opencode';

const modelArgs = ({ model }: CommandSpec): string[] =>
  model === undefined ? [] : ['-m', model];

const buildArgv = (spec: CommandSpec): string[] => [
  BINARY,
  'run',
  ...modelArgs(spec),
  promptFor(spec.promptFile),
];

export const opencodeRunner: RunnerAdapter = {
  name: BINARY,
  binary: BINARY,
  restrictsReadMode: false,
  buildCommand: buildArgv,
  buildHeadlessCommand: buildArgv,
};
