import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import { dirname } from 'node:path';
import { childEnvOf } from '../process/child-env.ts';
import type {
  RunHandle,
  RunnerPort,
  RunOutcome,
  RunSpec,
} from '../../ports/runner.port.ts';

const KILL_AFTER_MS = 5_000;
const SPAWN_FAILED_EXIT = 127;
const IS_WINDOWS = process.platform === 'win32';

interface HeadlessRun {
  exit: Promise<number>;
  stop: () => Promise<boolean>;
  pid: number | undefined;
}

const spawnHeadless = (spec: RunSpec): HeadlessRun => {
  mkdirSync(dirname(spec.logPath), { recursive: true });
  const log = openSync(spec.logPath, 'a');
  // Own process group, so the signal reaches the agent's children too.
  const child = spawn(spec.command, spec.args, {
    cwd: spec.cwd,
    env: childEnvOf(spec.env),
    stdio: ['ignore', log, log],
    detached: !IS_WINDOWS,
  });
  closeSync(log);
  let exited = false;
  const exit = new Promise<number>((resolve) => {
    const settle = (code: number): void => {
      exited = true;
      resolve(code);
    };
    child.once('error', () => settle(SPAWN_FAILED_EXIT));
    child.once('close', (code) => settle(code ?? -1));
  });
  const { pid } = child;
  const signalTree = (signal: NodeJS.Signals): void => {
    if (pid === undefined) return;
    try {
      process.kill(IS_WINDOWS ? pid : -pid, signal);
    } catch {
      child.kill(signal);
    }
  };
  const exitWithin = (ms: number): Promise<boolean> =>
    new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), ms);
      void exit.then(() => {
        clearTimeout(timer);
        resolve(true);
      });
    });
  return {
    exit,
    stop: async () => {
      if (exited) {
        // The leader is gone, but a process it left in the background could still edit files.
        if (!IS_WINDOWS) signalTree('SIGKILL');
        return true;
      }
      signalTree('SIGTERM');
      if (await exitWithin(KILL_AFTER_MS)) return true;
      signalTree('SIGKILL');
      return exitWithin(KILL_AFTER_MS);
    },
    pid,
  };
};

export const createHeadlessRunner = (): RunnerPort => {
  const runs = new Map<string, HeadlessRun>();
  let started = 0;
  return {
    start: async (spec: RunSpec): Promise<RunHandle> => {
      started += 1;
      const id = `headless-${started}`;
      const run = spawnHeadless(spec);
      runs.set(id, run);
      return { id, pid: run.pid };
    },
    // `abort` releases the run, so call it after `wait` too: it sweeps leftover processes.
    abort: async (handle) => {
      const run = runs.get(handle.id);
      if (run === undefined) return true;
      const stopped = await run.stop();
      if (stopped) runs.delete(handle.id);
      return stopped;
    },
    wait: async (handle): Promise<RunOutcome> => {
      const run = runs.get(handle.id);
      if (run === undefined) throw new Error(`unknown run ${handle.id}`);
      return { exitCode: await run.exit };
    },
  };
};
