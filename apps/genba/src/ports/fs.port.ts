export type FsPort = {
  readText(path: string): Promise<string>;
  writeText(path: string, text: string, mode?: number): Promise<void>;
  appendText(path: string, text: string): Promise<void>;
  remove(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  list(dir: string): Promise<string[]>;
  readStdin(): Promise<string>;
};

export type PidFilePort = {
  read(dataDir: string): Promise<number | null>;
  write(dataDir: string, pid: number): Promise<void>;
  acquire(dataDir: string, pid: number): Promise<boolean>;
  remove(dataDir: string): Promise<void>;
};
