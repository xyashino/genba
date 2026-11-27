import type { TokenUsage } from '@repo/contracts/jobs.contract';

export type RunSpec = {
  command: string;
  args: readonly string[];
  cwd: string;
  env: Readonly<Record<string, string>>;
  logPath: string;
};

export type RunHandle = {
  id: string;
  pid?: number;
};

export type RunOutcome = {
  exitCode: number;
};

export type RunnerPort = {
  start(spec: RunSpec): Promise<RunHandle>;
  /** Resolves once the run's processes are gone; false when they outlive the adapter's limit. */
  abort(handle: RunHandle): Promise<boolean>;
  wait(handle: RunHandle): Promise<RunOutcome>;
};

export type CommandLine = {
  command: string;
  args: string[];
};

export type CommandOptions = {
  model?: string;
  permission?: 'read' | 'write';
};

export type RunnerUsage = {
  usage: TokenUsage;
  /** null when the CLI reports tokens but no price */
  costUsd: number | null;
};

export type RunnerCatalogPort = {
  names(): readonly string[];
  isInstalled(name: string): Promise<boolean>;
  commandLine(
    name: string,
    promptFile: string,
    options?: CommandOptions,
  ): CommandLine | undefined;
  /** null when the runner reports no usage or the log holds none */
  parseUsage(name: string, log: string): RunnerUsage | null;
};
