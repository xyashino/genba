import { join } from 'node:path';
import type { InspectionStation } from '@repo/line/line';
import type { JobContext, Workspace } from './context.ts';
import { readIfPresent, runTracked, stationDirOf, tailOf } from './context.ts';
import type { StationRun } from './station-operator.ts';

const LOG_FILE = 'gate.log';
const WIP_MESSAGE = 'chore(genba): work in progress';

export const runInspectionStation = async (
  job: JobContext,
  workspace: Workspace,
  station: InspectionStation,
): Promise<StationRun> => {
  const logPath = join(stationDirOf(workspace, station.id), LOG_FILE);
  const readLog = async (): Promise<string> =>
    (await readIfPresent(job.fs, logPath)) ?? '';
  await job.fs.remove(logPath);
  // The cleanup below must never discard work, so commit any first.
  if (!(await job.git.isClean(workspace.path))) {
    await job.git.commitAll(workspace.path, WIP_MESSAGE);
  }
  const commands = station.exec;
  try {
    for (const command of commands) {
      await job.fs.appendText(logPath, `$ ${command}\n`);
      await job.note('gate start', command);
      const end = await runTracked(
        job,
        {
          command: 'sh',
          args: ['-c', command],
          cwd: workspace.path,
          env: {},
          logPath,
        },
        station.timeoutMs,
      );
      if (end.kind !== 'exited' || end.exitCode !== 0) {
        const cause =
          end.kind === 'exited' ? `exited ${end.exitCode}` : 'timed out';
        return {
          outcome: {
            kind: 'failed',
            feedback: `check \`${command}\` ${cause}\n${tailOf(await readLog())}`,
          },
        };
      }
    }
    return {
      outcome: {
        kind: 'passed',
        summary:
          commands.length === 0
            ? 'no checks configured'
            : `${commands.length} check(s) passed`,
      },
    };
  } finally {
    // Checks may leave files behind; the next station starts from the committed tree.
    if (!job.signal.aborted) await job.git.discardChanges(workspace.path);
  }
};
