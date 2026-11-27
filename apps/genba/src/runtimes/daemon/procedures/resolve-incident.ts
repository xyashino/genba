import type { IncidentResolution } from '@repo/contracts/enums';
import type { Incident } from '@repo/contracts/incidents.contract';
import { applyResolution } from '../../../domain/schedule.ts';
import type { DaemonContext } from '../core/context.ts';
import { lineOf } from '../core/context.ts';
import { DaemonError } from '../core/errors.ts';
import { applyDecision } from './apply-decision.ts';

export type Resolution = {
  resolution: IncidentResolution;
  /** station id */
  stepId?: string;
  diagnosis?: string;
};

export const resolveIncident = (
  context: DaemonContext,
  incidentId: string,
  { resolution, stepId, diagnosis }: Resolution,
): Incident =>
  context.store.transaction(() => {
    const incident = context.store.findIncident(incidentId);
    if (incident === undefined) {
      throw new DaemonError(404, 'not_found', `incident ${incidentId} missing`);
    }
    if (incident.resolvedAt !== null) {
      throw new DaemonError(409, 'already_resolved', 'incident is resolved');
    }
    const order = context.store.findOrder(incident.orderId)!;
    if (order.status !== 'blocked') {
      throw new DaemonError(
        409,
        'invalid_state',
        `order ${order.slug} is ${order.status}: genba is still working on it`,
      );
    }
    const steps = context.store.stepsOf(order.id);
    const decision = applyResolution(
      lineOf(order.line),
      steps,
      resolution,
      stepId ??
        steps.find((step) => step.id === incident.stepId)?.stationId ??
        null,
      diagnosis ?? incident.diagnosis,
    );
    if ('error' in decision) {
      throw new DaemonError(409, 'invalid_state', decision.error);
    }
    applyDecision(context, order, decision);
    if (diagnosis !== undefined) {
      context.store.updateIncident(incidentId, { diagnosis });
    }
    return context.store.findIncident(incidentId)!;
  });
