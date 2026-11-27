import type { Decision } from '../../../domain/schedule.ts';
import type { StoredOrder } from '../../../ports/store.port.ts';
import type { DaemonContext } from '../core/context.ts';
import { nowOf } from '../core/context.ts';

const applySteps = (
  context: DaemonContext,
  orderId: string,
  changes: Decision['steps'],
): void => {
  for (const { stationId, ...patch } of changes) {
    const step = context.store
      .stepsOf(orderId)
      .find((entry) => entry.stationId === stationId);
    if (step !== undefined) {
      context.store.updateStep(step.id, patch);
      continue;
    }
    context.store.insertStep({
      id: context.newId('step'),
      orderId,
      stationId,
      status: patch.status ?? 'pending',
      attemptsUsed: patch.attemptsUsed ?? 0,
      maxAttempts: patch.maxAttempts ?? 1,
      feedback: patch.feedback ?? null,
      startedAt: null,
      finishedAt: null,
    });
  }
};

const applyIncident = (
  context: DaemonContext,
  order: StoredOrder,
  decision: Decision,
): void => {
  const at = nowOf(context);
  const open = context.store.openIncidentOf(order.id);
  const draft = decision.openIncident;
  if (draft !== undefined) {
    const stepId =
      context.store
        .stepsOf(order.id)
        .find((step) => step.stationId === draft.stationId)?.id ?? null;
    // A newer failure supersedes whatever was still open.
    if (open !== undefined) {
      context.store.updateIncident(open.id, { resolvedAt: at });
    }
    context.store.insertIncident({
      id: context.newId('inc'),
      orderId: order.id,
      stepId,
      reason: draft.reason,
      triageOwner: draft.triageOwner,
      summary: draft.summary,
      diagnosis: null,
      issueUrl: null,
      draftPrUrl: null,
      resolution: null,
      createdAt: at,
      resolvedAt: null,
    });
    context.publish({
      type: 'incident',
      at,
      order: order.slug,
      station: draft.stationId,
      status: draft.reason,
      detail: draft.summary,
    });
    return;
  }
  const change = decision.incident;
  if (change === undefined || open === undefined) return;
  const { resolved, warning, ...patch } = change;
  context.store.updateIncident(open.id, {
    ...patch,
    ...(warning === undefined
      ? {}
      : { summary: `${open.summary}\n\nWarning: ${warning}` }),
    ...(resolved === true ? { resolvedAt: at } : {}),
  });
  context.publish({
    type: 'incident',
    at,
    order: order.slug,
    status: change.resolution ?? change.triageOwner,
    detail: warning ?? change.draftPrUrl ?? undefined,
  });
};

/** Writes one scheduler decision; call inside a transaction. */
export const applyDecision = (
  context: DaemonContext,
  order: StoredOrder,
  decision: Decision,
): void => {
  const at = nowOf(context);
  applySteps(context, order.id, decision.steps);
  applyIncident(context, order, decision);
  const status = decision.orderStatus ?? order.status;
  context.store.updateOrder(order.id, {
    status,
    updatedAt: at,
    ...(decision.resetWorktree === true ? { resetWorktree: true } : {}),
    ...(decision.delivered === undefined
      ? {}
      : {
          prUrl: decision.delivered.prUrl,
          prNumber: decision.delivered.prNumber,
          prOutcome: decision.delivered.prNumber === null ? null : 'open',
          deliveredAt: at,
        }),
  });
  if (status !== order.status) {
    context.publish({
      type: 'order',
      at,
      order: order.slug,
      status,
      detail: decision.delivered?.prUrl ?? undefined,
    });
  }
};
