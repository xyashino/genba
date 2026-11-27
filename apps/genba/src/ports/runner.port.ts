export type RunSpec = {
  command: string;
  args: readonly string[];
  cwd: string;
  env: Readonly<Record<string, string>>;
  logPath: string;
  /** set for an interactive run the user can watch */
  pane?: { workspace: string; tab: string; logsCommand: string };
};

export type RunHandle = {
  id: string;
  pid?: number;
  /** text in the pid's command line, when it is not the spec's command */
  marker?: string;
};

export type RunOutcome = {
  exitCode: number;
};

export type RunnerPort = {
  start(spec: RunSpec): Promise<RunHandle>;
  /** Resolves once the run's processes are gone, including ones left behind after exit; false when they outlive the adapter's limit. */
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
  /** defaults to true */
  headless?: boolean;
};

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

/** What a run's log says, in one shape for every runner. */
export type RunnerReport = {
  /** omitted when the runner does not support it or the log holds none */
  usage?: TokenUsage;
};

export type RunnerCatalogPort = {
  names(): readonly string[];
  isInstalled(name: string): Promise<boolean>;
  /** false when `read` permission adds no restriction for this CLI */
  restrictsReadMode(name: string): boolean;
  commandLine(
    name: string,
    promptFile: string,
    options?: CommandOptions,
  ): CommandLine | undefined;
  parseOutput(name: string, log: string): RunnerReport | undefined;
};
