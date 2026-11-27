import { claimJobContract } from '@repo/contracts/jobs.contract';
import type { JobAssignment } from '@repo/contracts/jobs.contract';
import {
  DELIVER_STATION,
  ESCALATE_STATION,
  MECHANIC_STATION,
} from '../../domain/schedule.ts';
import type { ClockPort } from '../../ports/clock.port.ts';
import {
  ApiError,
  ApiUnreachableError,
} from '../../ports/loopback-api.port.ts';
import type { LoopbackApiPort } from '../../ports/loopback-api.port.ts';
import type { CellDeps, JobContext } from './context.ts';
import { CellStopped, lineOf, loadManifest } from './context.ts';
import { runDeliverStation, runEscalation } from './station-deliver.ts';
import { runInspectionStation } from './station-inspection.ts';
import { runMechanicStation } from './station-mechanic.ts';
import { runOperatorStation } from './station-operator.ts';
import type { StationRun } from './station-operator.ts';
import { ensureWorktree, runSetup } from './worktree.ts';

const IDLE_MS = 500;
const MAX_UNREACHABLE = 10;
const REPORT_TRIES = 5;

export type LoopDeps = CellDeps & {
  cellId: string;
  api: LoopbackApiPort;
  clock: ClockPort;
  log: (line: string) => void;
};

// A Cell that cannot report would leave its job running forever; exiting makes the daemon requeue it.
class ReportLost extends Error {}

const runStation = async (job: JobContext): Promise<StationRun> => {
  const { stationId } = job.assignment.job;
  if (stationId === ESCALATE_STATION) return runEscalation(job);
  const workspace = await ensureWorktree(job);
  if (stationId === MECHANIC_STATION) {
    return runMechanicStation(job, workspace);
  }
  const failure = await runSetup(
    job,
    workspace,
    job.manifest.defaults.stationTimeoutMinutes * 60_000,
  );
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
  let run: StationRun;
  try {
    run = await runStation({
      ...deps,
      assignment,
      manifest: await loadManifest(deps.fs, deps.repoRoot),
      line: lineOf(order.line),
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
  await report(deps, job.id, {
    cellId: deps.cellId,
    durationMs: Math.max(deps.clock.now() - started, 0),
    runner: run.model?.runner,
    model: run.model?.model,
    tier: run.model?.tier,
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
