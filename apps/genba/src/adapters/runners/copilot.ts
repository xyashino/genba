import { promptFor } from './runner.ts';
import type { CommandSpec, RunnerAdapter } from './runner.ts';

const BINARY = 'copilot';
// Deny rule `write` blocks file edits (apply_patch) while shell stays allowed for `genba operator`.
// Variadic flag: must stay last in argv.
const READ_DENY_ARGS = ['--deny-tool', 'write'];

const permissionArgs = ({ permission }: CommandSpec): string[] =>
  permission === 'read' ? READ_DENY_ARGS : [];

const modelArgs = ({ model }: CommandSpec): string[] =>
  model === undefined ? [] : ['--model', model];

const buildArgv = (spec: CommandSpec): string[] => [
  BINARY,
  '-p',
  promptFor(spec.promptFile),
  '--allow-all-tools',
  '--no-ask-user',
  '--trust-folder',
  '--output-format',
  'json',
  ...modelArgs(spec),
  ...permissionArgs(spec),
];

export const copilotRunner: RunnerAdapter = {
  name: BINARY,
  binary: BINARY,
  buildCommand: buildArgv,
  buildHeadlessCommand: buildArgv,
};
