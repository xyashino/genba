import { resolveIncidentContract } from '@repo/contracts/incidents.contract';
import type { IncidentResolution } from '@repo/contracts/enums';
import type { Incident } from '@repo/contracts/incidents.contract';
import { applyResolution } from '../../../domain/schedule.ts';
import type { FactoryContext } from '../../core/context.ts';
import {
  AlreadyResolved,
  InvalidState,
  NotFound,
} from '../../core/error-handling.ts';
import { cliProcedure } from '../../core/procedure.ts';
import { applyDecision } from '../../orders/apply-decision.ts';

export type Resolution = {
  resolution: IncidentResolution;
  /** station id */
  stepId?: string;
  diagnosis?: string;
};

const resolveIncident = (
  context: FactoryContext,
  incidentId: string,
  { resolution, stepId, diagnosis }: Resolution,
): Incident =>
  context.store.transaction(() => {
    const incident = context.store.findIncident(incidentId);
    if (incident === undefined) {
      throw new NotFound(`incident ${incidentId} missing`);
    }
    if (incident.resolvedAt !== null) {
      throw new AlreadyResolved('incident is resolved');
    }
    const order = context.store.findOrder(incident.orderId)!;
    if (order.status !== 'blocked') {
      throw new InvalidState(
        `order ${order.slug} is ${order.status}: genba is still working on it`,
      );
    }
    const steps = context.store.stepsOf(order.id);
    const decision = applyResolution(
      context.lineOf(order.line),
      steps,
      resolution,
      stepId ??
        steps.find((step) => step.id === incident.stepId)?.stationId ??
        null,
      diagnosis ?? incident.diagnosis,
    );
    if ('error' in decision) {
      throw new InvalidState(decision.error);
    }
    applyDecision(context, order, decision);
    if (diagnosis !== undefined) {
      context.store.updateIncident(incidentId, { diagnosis });
    }
    return context.store.findIncident(incidentId)!;
  });

export const resolveIncidentProcedure = cliProcedure(resolveIncidentContract)(
  ({ params, body }, ctx) => ({
    code: 200 as const,
    incident: resolveIncident(ctx, params.id, body),
  }),
);
