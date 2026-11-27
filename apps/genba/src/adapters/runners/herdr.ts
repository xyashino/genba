import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import type { WorkspacePort } from '../../ports/workspace.port.ts';
import type { ProcessPort } from '../../ports/process.port.ts';
import type {
  RunHandle,
  RunnerPort,
  RunSpec,
} from '../../ports/runner.port.ts';

const HERDR = 'herdr';
const PATH_ENV = 'PATH';
const POLL_MS = 200;
const PID_WAIT_MS = 10_000;
const KILL_AFTER_MS = 5_000;
const LOG_LINES = '500';
const LOST_EXIT = -1;
const TAB_ID = /"tab_id"\s*:\s*"([^"]+)"/;
const PANE_ID = /"pane_id"\s*:\s*"([^"]+)"/;

export type HerdrDeps = {
  process: ProcessPort;
  workspaces: WorkspacePort;
  repoRoot: string;
};

type PaneRun = {
  cwd: string;
  tabId: string;
  paneId: string;
  logPath: string;
  launcher: string;
  exitFile: string;
  pid: number;
  aborted: boolean;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const shellQuote = (text: string): string =>
  `'${text.replaceAll("'", `'\\''`)}'`;

// The pane starts with the herdr server's environment, not the Cell's.
const launcherOf = (spec: RunSpec, exitFile: string, pidFile: string): string =>
  [
    '#!/bin/bash',
    `cd ${shellQuote(spec.cwd)} || exit 127`,
    `echo "$$" > ${shellQuote(pidFile)}`,
    'for name in $(compgen -e GENBA_); do unset "$name"; done',
    ...Object.entries({ PATH: process.env[PATH_ENV] ?? '', ...spec.env }).map(
      ([key, value]) => `export ${key}=${shellQuote(value)}`,
    ),
    [spec.command, ...spec.args].map(shellQuote).join(' '),
    `echo "$?" > ${shellQuote(exitFile)}`,
    '',
  ].join('\n');

const numberIn = (file: string): number | undefined => {
  if (!existsSync(file)) return undefined;
  const value = Number.parseInt(readFileSync(file, 'utf8'), 10);
  return Number.isNaN(value) ? undefined : value;
};

const within = async <T>(
  read: () => T | undefined,
  limitMs: number,
): Promise<T | undefined> => {
  for (let waited = 0; ; waited += POLL_MS) {
    const value = read();
    if (value !== undefined || waited >= limitMs) return value;
    await sleep(POLL_MS);
  }
};

/** Runs an interactive agent in a herdr tab, so it can be watched and answered. */
export const createHerdrRunner = (deps: HerdrDeps): RunnerPort => {
  const processes = deps.process;
  const runs = new Map<string, PaneRun>();
  let started = 0;
  // The last finished tab stays readable until the next agent starts.
  let finished: string | undefined;

  const herdr = async (args: string[]): Promise<string> => {
    const result = await processes.run(HERDR, args, deps.repoRoot);
    if (result.exitCode !== 0) {
      throw new Error(
        `herdr ${args.slice(0, 2).join(' ')} failed: ${result.stderr.trim()}`,
      );
    }
    return result.stdout;
  };

  const matched = (pattern: RegExp, output: string, what: string): string => {
    const id = pattern.exec(output)?.[1];
    if (id === undefined) throw new Error(`herdr returned no ${what}`);
    return id;
  };

  const openTab = async (
    { workspace, tab, logsCommand }: NonNullable<RunSpec['pane']>,
    cwd: string,
  ): Promise<{ tabId: string; paneId: string }> => {
    const workspaceId = await deps.workspaces.ensure(workspace, logsCommand);
    const created = await herdr([
      'tab',
      'create',
      '--workspace',
      workspaceId,
      '--cwd',
      cwd,
      '--label',
      tab,
      '--no-focus',
    ]);
    return {
      tabId: matched(TAB_ID, created, 'tab_id'),
      paneId: matched(PANE_ID, created, 'pane_id'),
    };
  };

  const closeTab = async (tabId: string): Promise<void> => {
    await processes.run(HERDR, ['tab', 'close', tabId], deps.repoRoot);
  };

  // The screen is the only record of an interactive run; keep it for retries and the mechanic.
  const saveScreen = async (run: PaneRun): Promise<void> => {
    const screen = await processes.run(
      HERDR,
      ['pane', 'read', run.paneId, '--lines', LOG_LINES, '--format', 'text'],
      deps.repoRoot,
    );
    if (screen.exitCode === 0) writeFileSync(run.logPath, screen.stdout);
  };

  const groupGone = async (pid: number): Promise<boolean> =>
    (await within(
      () => (processes.isGroupAlive(pid) ? undefined : true),
      KILL_AFTER_MS,
    )) ?? false;

  // Closing a tab does not promise the agent ends, so its process group is signalled.
  const stopGroup = async (pid: number): Promise<boolean> => {
    if (!processes.isGroupAlive(pid)) return true;
    processes.signalGroup(pid, 'SIGTERM');
    if (await groupGone(pid)) return true;
    processes.signalGroup(pid, 'SIGKILL');
    return groupGone(pid);
  };

  return {
    start: async (spec: RunSpec): Promise<RunHandle> => {
      if (spec.pane === undefined) throw new Error('a herdr run needs a pane');
      started += 1;
      const id = `herdr-${started}`;
      const stepDir = dirname(spec.logPath);
      mkdirSync(stepDir, { recursive: true });
      const launcher = join(stepDir, `${id}-${process.pid}.sh`);
      const exitFile = `${launcher}.exit`;
      const pidFile = `${launcher}.pid`;
      rmSync(exitFile, { force: true });
      rmSync(pidFile, { force: true });
      // Holds the operator token: private, and removed with the run.
      writeFileSync(launcher, launcherOf(spec, exitFile, pidFile));
      chmodSync(launcher, 0o700);
      const { tabId, paneId } = await openTab(spec.pane, spec.cwd);
      if (finished !== undefined) await closeTab(finished);
      finished = undefined;
      let pid: number | undefined;
      try {
        await herdr(['pane', 'run', paneId, `bash ${shellQuote(launcher)}`]);
        pid = await within(() => numberIn(pidFile), PID_WAIT_MS);
        if (pid === undefined) {
          throw new Error('the herdr pane did not start the agent');
        }
      } catch (error) {
        await closeTab(tabId);
        rmSync(launcher, { force: true });
        throw error;
      }
      runs.set(id, {
        cwd: spec.cwd,
        tabId,
        paneId,
        logPath: spec.logPath,
        launcher,
        exitFile,
        pid,
        aborted: false,
      });
      // The launcher path is what a restarted daemon finds in the process list.
      return { id, pid, marker: launcher };
    },
    abort: async (handle) => {
      const run = runs.get(handle.id);
      if (run === undefined) return true;
      run.aborted = true;
      await saveScreen(run);
      const stopped = await stopGroup(run.pid);
      if (stopped) {
        finished = run.tabId;
        rmSync(run.launcher, { force: true });
        runs.delete(handle.id);
      }
      return stopped;
    },
    wait: async (handle) => {
      const run = runs.get(handle.id);
      if (run === undefined) throw new Error(`unknown run ${handle.id}`);
      for (;;) {
        // A closed tab kills the launcher before it can write an exit code.
        const gone = !processes.isAlive(run.pid);
        const code = numberIn(run.exitFile);
        if (code !== undefined) return { exitCode: code };
        if (gone || run.aborted) return { exitCode: LOST_EXIT };
        await sleep(POLL_MS);
      }
    },
  };
};
