export type ProcessResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type DetachedSpec = {
  command: string;
  args: readonly string[];
  env: Readonly<Record<string, string>>;
  logPath: string;
  cwd?: string;
};

export type ProcessPort = {
  run(
    command: string,
    args: readonly string[],
    cwd: string,
    env?: Readonly<Record<string, string>>,
  ): Promise<ProcessResult>;
  spawnDetached(spec: DetachedSpec): Promise<number>;
  isAlive(pid: number): boolean;
  parentPid(): number;
  terminate(pid: number): void;
  forceKill(pid: number): void;
  probeUrl(url: string): Promise<boolean>;
};
