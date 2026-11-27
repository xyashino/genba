import { existsSync, readFileSync, readdirSync } from 'node:fs';
import type { FsPort } from '../../ports/fs.port.js';
import { appendTextFile, removeFile, writeTextFile } from './write-text.js';

export const createNodeFs = (): FsPort => ({
  readText: async (path) => readFileSync(path, 'utf8'),
  writeText: writeTextFile,
  appendText: appendTextFile,
  remove: removeFile,
  exists: async (path) => existsSync(path),
  list: async (dir) => (existsSync(dir) ? readdirSync(dir).sort() : []),
  readStdin: async () => readFileSync(0, 'utf8'),
});
