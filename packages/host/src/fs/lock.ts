import { setTimeout as sleep } from 'node:timers/promises';
import type { LockPort } from '../ports/fs.port.ts';
import { createPidFile } from './pid-file.ts';

const POLL_MS = 200;

/** A lock between processes; one left by a dead process is taken over. */
export const createFileLock = (fileName: string): LockPort => {
  const pidFile = createPidFile(fileName);
  return {
    withLock: async (dataDir, signal, work) => {
      while (!(await pidFile.acquire(dataDir, process.pid))) {
        await sleep(POLL_MS, undefined, { signal });
      }
      try {
        return await work();
      } finally {
        await pidFile.remove(dataDir);
      }
    },
  };
};
