export type FsPort = {
  readText(path: string): Promise<string>;
  writeText(path: string, text: string, mode?: number): Promise<void>;
  appendText(path: string, text: string): Promise<void>;
  remove(path: string): Promise<void>;
  removeDir(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  list(dir: string): Promise<string[]>;
  /** a file gives itself, a folder every file under it (sorted, no dotfiles), a missing path nothing */
  filesAt(path: string): Promise<string[]>;
  readStdin(): Promise<string>;
};

export type LockPort = {
  /** runs `work` while no other process holds the lock; `signal` stops the wait */
  withLock<T>(
    dataDir: string,
    signal: AbortSignal,
    work: () => Promise<T>,
  ): Promise<T>;
};

export type PidFilePort = {
  read(dataDir: string): Promise<number | null>;
  write(dataDir: string, pid: number): Promise<void>;
  acquire(dataDir: string, pid: number): Promise<boolean>;
  remove(dataDir: string): Promise<void>;
};
