import type { CommandOptions, RunnerReport } from '../../ports/runner.port.ts';

export type CommandSpec = CommandOptions & {
  /** the prompt file the agent is told to read, relative to the worktree */
  promptFile: string;
  permission: NonNullable<CommandOptions['permission']>;
};

/** One agent CLI. Runner-specific flags and quirks live only in its own file. */
export type RunnerAdapter = {
  name: string;
  binary: string;
  /** false when `read` builds the same argv as `write` */
  restrictsReadMode: boolean;
  /** argv, binary first */
  buildCommand(spec: CommandSpec): string[];
  /** argv for a headless run; the same as buildCommand for most CLIs */
  buildHeadlessCommand(spec: CommandSpec): string[];
  /** absent when the CLI's output has no parser */
  parseOutput?(log: string): RunnerReport;
};

export const promptFor = (promptFile: string): string =>
  `Read ${promptFile} and follow the instructions in it.`;
