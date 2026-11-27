import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import type { FsPort } from '../../ports/fs.port.ts';
import { appendTextFile, removeFile, writeTextFile } from './write-text.ts';

const filesAt = (path: string): string[] => {
  if (!existsSync(path)) return [];
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path)
    .filter((name) => !name.startsWith('.'))
    .sort()
    .flatMap((name) => filesAt(join(path, name)));
};

export const createNodeFs = (): FsPort => ({
  readText: async (path) => readFileSync(path, 'utf8'),
  writeText: writeTextFile,
  appendText: appendTextFile,
  remove: removeFile,
  removeDir: async (path) => rmSync(path, { recursive: true, force: true }),
  exists: async (path) => existsSync(path),
  list: async (dir) => (existsSync(dir) ? readdirSync(dir).sort() : []),
  filesAt: async (path) => filesAt(path),
  readStdin: async () => readFileSync(0, 'utf8'),
});
