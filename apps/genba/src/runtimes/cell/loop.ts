import { claimJobContract } from '@repo/contracts/jobs.contract';
import type { JobAssignment } from '@repo/contracts/jobs.contract';
import {
  DELIVER_STATION,
  ESCALATE_STATION,
  MECHANIC_STATION,
} from '../../domain/schedule.ts';
import { basename, join } from 'node:path';
import { runDirOf, timelinePathOf } from '../../domain/cells.ts';
import { CELL_DIR } from '../../domain/runtime-paths.ts';
import { timelineLineOf } from '../../domain/timeline.ts';
import type { ClockPort } from '../../ports/clock.port.ts';
import {
  ApiError,
  ApiUnreachableError,
} from '../../ports/loopback-api.port.ts';
import type { LoopbackApiPort } from '../../ports/loopback-api.port.ts';
import type { CellDeps, JobContext } from './context.ts';
import { CellStopped, loadLine, loadManifest } from './context.ts';
import { runDeliverStation, runEscalation } from './station-deliver.ts';
import { runInspectionStation } from './station-inspection.ts';
import { runMechanicStation } from './station-mechanic.ts';
import { runOperatorStation } from './station-operator.ts';
import type { StationRun } from './station-operator.ts';
import {
  WORKTREE_LOG,
  ensureWorktree,
  runWorktreeHook,
  worktreePathOf,
} from './worktree.ts';

const IDLE_MS = 500;
const MAX_UNREACHABLE = 10;
const REPORT_TRIES = 5;

export type LoopDeps = Omit<CellDeps, 'note'> & {
  cellId: string;
  api: LoopbackApiPort;
  clock: ClockPort;
  log: (line: string) => void;
};

// A Cell that cannot report would leave its job running forever; exiting makes the daemon requeue it.
class ReportLost extends Error {}

const reasonOf = (outcome: StationRun['outcome']): string => {
  switch (outcome.kind) {
    case 'failed':
      return outcome.feedback;
    case 'blocked':
      return outcome.reason;
    case 'env_error':
      return outcome.detail;
    case 'resolved':
      return outcome.resolution;
    case 'passed':
      return outcome.prUrl ?? outcome.summary ?? '';
    case 'escalated':
      return outcome.issueUrl ?? outcome.warning ?? '';
  }
};

// A timeline that cannot be written must not stop the job.
const noteFor =
  (deps: LoopDeps, { job, order }: JobAssignment): CellDeps['note'] =>
  async (action, detail) => {
    try {
      await deps.fs.appendText(
        join(deps.repoRoot, timelinePathOf(deps.cellId)),
        timelineLineOf({
          at: new Date(deps.clock.now()).toISOString(),
          cell: deps.cellId,
          order: order.slug,
          station: job.stationId,
          job: job.id,
          action,
          detail,
        }),
      );
    } catch (error) {
      deps.log(`timeline not written: ${String(error)}`);
    }
  };

// Copies what the station wrote out of the worktree, which delivery removes.
const archive = async (
  deps: LoopDeps,
  { job, order }: JobAssignment,
): Promise<void> => {
  const cellDir = join(worktreePathOf(deps.repoRoot, order.slug), CELL_DIR);
  const target = join(deps.repoRoot, runDirOf(order.id, job.stationId, job.id));
  const stationDir = join(cellDir, job.stationId);
  const files = [
    ...(await deps.fs.filesAt(stationDir)),
    ...(await deps.fs.filesAt(join(cellDir, WORKTREE_LOG))),
  ];
  for (const file of files) {
    // Pane launchers hold the operator token.
    if (/\.sh(\.|$)/.test(file)) continue;
    await deps.fs.writeText(
      join(target, basename(file)),
      await deps.fs.readText(file),
      0o600,
    );
  }
};

const runStation = async (job: JobContext): Promise<StationRun> => {
  const { stationId } = job.assignment.job;
  if (stationId === ESCALATE_STATION) return runEscalation(job);
  if (stationId === MECHANIC_STATION) {
    return runMechanicStation(job, await ensureWorktree(job));
  }
  const workspace = await ensureWorktree(job, { changeover: true });
  const failure = await runWorktreeHook(job, workspace);
  if (failure !== null) {
    return { outcome: { kind: 'env_error', detail: failure } };
  }
  if (stationId === DELIVER_STATION) return runDeliverStation(job, workspace);
  const station = job.line.stations.find((entry) => entry.id === stationId);
  if (station === undefined) {
    throw new Error(`line ${job.line.name} has no station ${stationId}`);
  }
  return station.kind === 'operator'
    ? runOperatorStation(job, workspace, station)
    : runInspectionStation(job, workspace, station);
};

const report = async (
  deps: LoopDeps,
  jobId: string,
  body: object,
): Promise<void> => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await deps.api.request('POST', `/jobs/${jobId}/complete`, body);
      return;
    } catch (error) {
      // 409: the daemon already took the job back.
      if (error instanceof ApiError && error.status === 409) return;
      const reason = error instanceof Error ? error.message : String(error);
      deps.log(`report failed: ${reason}`);
      if (attempt >= REPORT_TRIES) throw new ReportLost(reason);
      await deps.clock.sleep(IDLE_MS * attempt);
    }
  }
};

const runJob = async (
  deps: LoopDeps,
  assignment: JobAssignment,
): Promise<void> => {
  const started = deps.clock.now();
  const { job, order } = assignment;
  deps.log(`${order.slug} ${job.stationId} attempt ${job.attempt}`);
  const note = noteFor(deps, assignment);
  await note('claim', `attempt ${job.attempt}`);
  let run: StationRun;
  try {
    run = await runStation({
      ...deps,
      note,
      assignment,
      manifest: await loadManifest(deps.fs, deps.repoRoot),
      line: await loadLine(deps.fs, deps.repoRoot, order.line),
    });
  } catch (error) {
    // A stopping Cell reports nothing: the daemon requeues the job once this process is gone.
    if (error instanceof CellStopped || deps.signal.aborted) return;
    run = {
      outcome: {
        kind: 'env_error',
        detail: error instanceof Error ? error.message : String(error),
      },
    };
  }
  deps.log(`${order.slug} ${job.stationId} -> ${run.outcome.kind}`);
  const seconds = Math.round(Math.max(deps.clock.now() - started, 0) / 1000);
  await note(run.outcome.kind, `${seconds}s ${reasonOf(run.outcome)}`.trim());
  await archive(deps, assignment).catch((error: unknown) =>
    note('archive failed', String(error)),
  );
  await report(deps, job.id, {
    cellId: deps.cellId,
    durationMs: Math.max(deps.clock.now() - started, 0),
    runner: run.agent?.runner,
    model: run.agent?.model,
    outcome: run.outcome,
  });
};

/** Claim, run, report, repeat, until stopped or the daemon is gone. */
export const runCellLoop = async (deps: LoopDeps): Promise<void> => {
  let unreachable = 0;
  while (!deps.signal.aborted) {
    try {
      const reply = claimJobContract.out[200].parse(
        await deps.api.request('POST', '/cells/claims', {
          cellId: deps.cellId,
        }),
      );
      unreachable = 0;
      if (reply.assignment === null) {
        await deps.clock.sleep(IDLE_MS);
      } else {
        await runJob(deps, reply.assignment);
      }
    } catch (error) {
      if (error instanceof ReportLost) return;
      if (error instanceof ApiUnreachableError) {
        unreachable += 1;
        if (unreachable >= MAX_UNREACHABLE) return;
      } else if (error instanceof ApiError && error.status === 401) {
        return;
      } else {
        deps.log(error instanceof Error ? error.message : String(error));
      }
      await deps.clock.sleep(IDLE_MS);
    }
  }
};
