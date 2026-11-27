import type { JobAssignment } from '@repo/contracts/jobs.contract';
import { orderBranchOf } from '../../../domain/branch.ts';
import {
  MECHANIC_STATION,
  isSideStation,
  nextStationId,
  rankCandidates,
} from '../../../domain/schedule.ts';
import type { StoredOrder } from '../../../ports/store.port.ts';
import type { DaemonContext } from '../core/context.ts';
import { nowOf } from '../core/context.ts';

const runnableOf = (
  context: DaemonContext,
): { order: StoredOrder; stationId: string } | undefined => {
  const orders = context.store.listOrders();
  const bySlug = new Map(orders.map((order) => [order.slug, order]));
  const busy = new Set(context.store.activeJobs().map((job) => job.orderId));
  const ranked = rankCandidates(
    orders
      .filter((order) => !busy.has(order.id))
      .map((order) => ({
        ...order,
        parentStatus:
          order.parentSlug === null
            ? null
            : (bySlug.get(order.parentSlug)?.status ?? null),
      })),
  );
  for (const candidate of ranked) {
    const stationId = nextStationId(
      context.lineOf(candidate.line),
      context.store.stepsOf(candidate.id),
    );
    if (stationId !== null) {
      return { order: bySlug.get(candidate.slug)!, stationId };
    }
  }
  return undefined;
};

// A child stacks on its parent's branch until the parent is merged.
const parentBranchOf = (
  context: DaemonContext,
  order: StoredOrder,
): string | null => {
  if (order.parentSlug === null) return null;
  const parent = context.store.findOrder(order.parentSlug);
  return parent?.status === 'delivered' ? orderBranchOf(parent.slug) : null;
};

const incidentOf = (
  context: DaemonContext,
  orderId: string,
): JobAssignment['incident'] => {
  const open = context.store.openIncidentOf(orderId);
  if (open === undefined) return null;
  const stationId =
    context.store.stepsOf(orderId).find((step) => step.id === open.stepId)
      ?.stationId ?? null;
  const { id, reason, summary, diagnosis } = open;
  return { id, reason, stationId, summary, diagnosis };
};

export const claimJob = (
  context: DaemonContext,
  cellId: string,
): JobAssignment | null =>
  context.store.transaction(() => {
    const runnable = runnableOf(context);
    if (runnable === undefined) return null;
    const { order, stationId } = runnable;
    const step = context.store
      .stepsOf(order.id)
      .find((entry) => entry.stationId === stationId)!;
    const at = nowOf(context);
    const attempt = step.attemptsUsed + 1;
    context.store.updateStep(step.id, {
      status: 'running',
      attemptsUsed: attempt,
      startedAt: at,
      finishedAt: null,
    });
    const job = {
      id: context.newId('job'),
      orderId: order.id,
      stepId: step.id,
      cellId,
      stationId,
      attempt,
      status: 'running' as const,
      runner: null,
      model: null,
      tier: null,
      durationMs: null,
      summary: null,
      startedAt: at,
      finishedAt: null,
    };
    context.store.insertJob(job);
    // Side jobs read the worktree of the failed attempt, so they never recreate it.
    const fresh = order.resetWorktree && !isSideStation(stationId);
    context.store.updateOrder(order.id, {
      status: 'running',
      updatedAt: at,
      startedAt: order.startedAt ?? at,
    });
    context.publish({
      type: 'job_started',
      at,
      order: order.slug,
      station: stationId,
      detail: `attempt ${attempt} on ${cellId}`,
    });
    const incident =
      stationId === MECHANIC_STATION || isSideStation(stationId)
        ? incidentOf(context, order.id)
        : null;
    return {
      job,
      order: context.store.findOrder(order.id)!,
      steps: context.store.stepsOf(order.id),
      parentBranch: parentBranchOf(context, order),
      freshWorktree: fresh,
      feedback: step.feedback,
      incident,
    };
  });
