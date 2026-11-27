import type { Job, JobOutcome } from '@repo/contracts/jobs.contract';
import {
  MECHANIC_STATION,
  decideAfterJob,
  isSideStation,
} from '../../../domain/schedule.ts';
import type { StoredJob } from '../../../ports/store.port.ts';
import type { DaemonContext } from '../core/context.ts';
import { lineOf, nowOf } from '../core/context.ts';
import { DaemonError } from '../core/errors.ts';
import { applyDecision } from './apply-decision.ts';

export type Completion = {
  cellId: string;
  durationMs: number;
  runner?: string;
  model?: string;
  tier?: Job['tier'];
  outcome: JobOutcome;
};

const detailOf = (outcome: JobOutcome): string | undefined => {
  switch (outcome.kind) {
    case 'passed':
      return outcome.summary;
    case 'failed':
      return outcome.feedback;
    case 'blocked':
      return outcome.reason;
    case 'env_error':
      return outcome.detail;
    case 'resolved':
      return `${outcome.resolution}: ${outcome.diagnosis}`;
    case 'escalated':
      return outcome.warning ?? outcome.draftPrUrl ?? undefined;
  }
};

const statusOf = (outcome: JobOutcome): 'completed' | 'failed' =>
  outcome.kind === 'failed' || outcome.kind === 'env_error'
    ? 'failed'
    : 'completed';

/** Records a finished job and moves its order; call inside a transaction. */
export const settleJob = (
  context: DaemonContext,
  job: StoredJob,
  completion: Omit<Completion, 'cellId'>,
): StoredJob => {
  const at = nowOf(context);
  const { outcome, durationMs, runner, model, tier } = completion;
  const detail = detailOf(outcome) ?? null;
  context.store.updateJob(job.id, {
    status: statusOf(outcome),
    durationMs,
    runner: runner ?? null,
    model: model ?? null,
    tier: tier ?? null,
    summary: detail,
    finishedAt: at,
  });
  context.store.updateStep(job.stepId, { finishedAt: at });
  // Cleared only now: a requeued job must still recreate the worktree.
  if (!isSideStation(job.stationId)) {
    context.store.updateOrder(job.orderId, { resetWorktree: false });
  }
  const order = context.store.findOrder(job.orderId)!;
  context.publish({
    type: 'job_finished',
    at,
    order: order.slug,
    station: job.stationId,
    status: outcome.kind,
    detail: detail ?? undefined,
  });
  const steps = context.store.stepsOf(order.id);
  const open = context.store.openIncidentOf(order.id);
  applyDecision(
    context,
    order,
    decideAfterJob({
      line: lineOf(order.line),
      steps,
      stationId: job.stationId,
      outcome,
      incidentStationId:
        steps.find((step) => step.id === open?.stepId)?.stationId ?? null,
      mechanicRuns: context.store
        .jobsOf(order.id)
        .filter(
          (entry) =>
            entry.stationId === MECHANIC_STATION && entry.id !== job.id,
        ).length,
    }),
  );
  return context.store.findJob(job.id)!;
};

export const completeJob = (
  context: DaemonContext,
  jobId: string,
  completion: Completion,
): StoredJob =>
  context.store.transaction(() => {
    const job = context.store.findJob(jobId);
    if (job === undefined) {
      throw new DaemonError(404, 'not_found', `job ${jobId} missing`);
    }
    if (job.status !== 'running' || job.cellId !== completion.cellId) {
      throw new DaemonError(
        409,
        'invalid_state',
        `job ${jobId} is not running on ${completion.cellId}`,
      );
    }
    return settleJob(context, job, completion);
  });
