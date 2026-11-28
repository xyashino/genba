import { listIncidentsContract } from '@repo/contracts/incidents.contract';
import { pageOf } from '../../core/paginate.ts';
import { cliProcedure } from '../../core/procedure.ts';

export const listIncidentsProcedure = cliProcedure(listIncidentsContract)((
  { query },
  ctx,
) => {
  const matching = ctx.store
    .listIncidents()
    .filter(
      (incident) =>
        (query.openOnly !== true || incident.resolvedAt === null) &&
        (query.triageOwner === undefined ||
          incident.triageOwner === query.triageOwner),
    );
  return { code: 200 as const, ...pageOf(matching, query) };
});
