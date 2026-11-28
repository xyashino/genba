import {
  listIncidentsContract,
  resolveIncidentContract,
} from '@repo/contracts/incidents.contract';
import type { CliDeps } from '../context.ts';
import { CliError } from '../context.ts';
import { requireDaemon } from '../daemon-link.ts';
import { table } from '../output.ts';
import { allOrders } from './orders.ts';

export const runIncidentList = async (
  deps: CliDeps,
  { all, json }: { all: boolean; json: boolean },
): Promise<number> => {
  const { api } = await requireDaemon(deps);
  const { items } = listIncidentsContract.out[200].parse(
    await api.request('GET', `/incidents?limit=100&openOnly=${!all}`),
  );
  if (json) {
    deps.out(JSON.stringify(items, null, 2));
    return 0;
  }
  const slugs = new Map(
    (await allOrders(api)).map((order) => [order.id, order.slug]),
  );
  deps.out(
    items.length === 0
      ? 'no incidents'
      : table(
          ['ID', 'ORDER', 'REASON', 'OWNER', 'ISSUE', 'DRAFT PR'],
          items.map((incident) => [
            incident.id,
            slugs.get(incident.orderId) ?? incident.orderId,
            incident.reason,
            incident.resolvedAt === null ? incident.triageOwner : 'resolved',
            incident.issueUrl ?? '',
            incident.draftPrUrl ?? '',
          ]),
        ),
  );
  return 0;
};

export const runIncidentResolve = async (
  deps: CliDeps,
  id: string,
  resolution: string,
  { step, diagnosis }: { step?: string; diagnosis?: string },
): Promise<number> => {
  const input = resolveIncidentContract.in.body.safeParse({
    resolution,
    stepId: step,
    diagnosis,
  });
  if (!input.success) {
    throw new CliError(`unknown resolution "${resolution}"`);
  }
  const { api } = await requireDaemon(deps);
  await api.request(
    'POST',
    `/incidents/${encodeURIComponent(id)}/resolve`,
    input.data,
  );
  deps.out(`resolved ${id}: ${resolution}`);
  return 0;
};
