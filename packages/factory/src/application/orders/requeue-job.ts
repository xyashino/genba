import type { StoredJob } from '../ports/store.port.ts';
import type { FactoryContext } from '../core/context.ts';
import { nowOf } from '../core/context.ts';
import { settleJob } from './settle-job.ts';

const CRASH_DETAIL = 'the Cell exited before reporting a result';

/**
 * Frees a job whose Cell process is confirmed dead. A deliberate stop refunds the attempt;
 * a crash keeps it, so a job that always kills its Cell ends as an incident.
 */
export const requeueJob = (
  context: FactoryContext,
  job: StoredJob,
  refund: boolean,
): void => {
  context.store.transaction(() => {
    const current = context.store.findJob(job.id);
    if (current?.status !== 'running') return;
    const step = context.store
      .stepsOf(current.orderId)
      .find((entry) => entry.id === current.stepId)!;
    if (!refund && step.attemptsUsed >= step.maxAttempts) {
      settleJob(context, current, {
        durationMs: 0,
        outcome: { kind: 'env_error', detail: CRASH_DETAIL },
      });
      return;
    }
    const at = nowOf(context);
    context.store.updateJob(current.id, {
      status: 'cancelled',
      summary: CRASH_DETAIL,
      finishedAt: at,
    });
    context.store.updateStep(step.id, {
      status: 'pending',
      attemptsUsed: refund
        ? Math.max(step.attemptsUsed - 1, 0)
        : step.attemptsUsed,
      startedAt: null,
    });
    context.publish({
      type: 'job_requeued',
      at,
      order: context.store.findOrder(current.orderId)!.slug,
      station: current.stationId,
    });
  });
};
