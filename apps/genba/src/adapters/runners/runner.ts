import type { CommandOptions, RunnerUsage } from '../../ports/runner.port.js';

export type CommandSpec = CommandOptions & {
  /** the prompt file the agent is told to read, relative to the worktree */
  promptFile: string;
  permission: NonNullable<CommandOptions['permission']>;
};

/** One agent CLI started headless. Runner-specific flags and quirks live only in its own file. */
export type RunnerAdapter = {
  name: string;
  binary: string;
  /** argv, binary first, for one non-interactive run */
  buildCommand(spec: CommandSpec): string[];
  /** absent when the CLI's usage output has no parser */
  parseUsage?(log: string): RunnerUsage | null;
};

export const promptFor = (promptFile: string): string =>
  `Read ${promptFile} and follow the instructions in it.`;
