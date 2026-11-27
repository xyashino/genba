import { promptFor } from './runner.ts';
import type { CommandSpec, RunnerAdapter } from './runner.ts';

const BINARY = 'cursor-agent';

// Every run approves tool calls unattended; read mode also plans without edits.
const modeArgs = ({ permission }: CommandSpec): string[] =>
  permission === 'read' ? ['--mode', 'plan', '--force'] : ['--force'];

const modelArgs = ({ model }: CommandSpec): string[] =>
  model === undefined ? [] : ['--model', model];

const buildArgv = (spec: CommandSpec): string[] => [
  BINARY,
  '-p',
  ...modeArgs(spec),
  '--trust',
  '--approve-mcps',
  '--output-format',
  'json',
  ...modelArgs(spec),
  promptFor(spec.promptFile),
];

export const cursorRunner: RunnerAdapter = {
  name: 'cursor',
  binary: BINARY,
  restrictsReadMode: true,
  buildCommand: buildArgv,
  buildHeadlessCommand: buildArgv,
};
