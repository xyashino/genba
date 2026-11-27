import { Hono } from 'hono';
import { honoAdapter } from '../adapter.ts';
import type { AppEnv } from '../types.ts';
import { listIncidentsProcedure } from '../../../application/procedures/incidents/list-incidents.procedure.ts';
import { resolveIncidentProcedure } from '../../../application/procedures/incidents/resolve-incident.procedure.ts';

export const incidentsRoute = new Hono<AppEnv>()
  .get('/', honoAdapter(listIncidentsProcedure))
  .post('/:id/resolve', honoAdapter(resolveIncidentProcedure));
