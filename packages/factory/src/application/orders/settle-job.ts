import type { Job, JobOutcome } from '@repo/contracts/jobs.contract';
import { MECHANIC_STATION, isSideStation } from '@repo/line/stations';
import { decideAfterJob } from '../../domain/schedule.ts';
import type { StoredJob } from '../ports/store.port.ts';
import type { FactoryContext } from '../core/context.ts';
import { nowOf } from '../core/context.ts';
import { applyDecision } from './apply-decision.ts';

export type Completion = {
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
  context: FactoryContext,
  job: StoredJob,
  completion: Completion,
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
      line: context.lineOf(order.line),
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
