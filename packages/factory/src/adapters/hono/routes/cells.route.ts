import { Hono } from 'hono';
import { honoAdapter } from '../adapter.ts';
import type { AppEnv } from '../types.ts';
import { scaleCellsProcedure } from '../../../application/procedures/cells/scale-cells.procedure.ts';
import { claimJobProcedure } from '../../../application/procedures/cells/claim-job.procedure.ts';
import { trackRunnerProcedure } from '../../../application/procedures/cells/track-runner.procedure.ts';

export const cellsRoute = new Hono<AppEnv>()
  .post('/scale', honoAdapter(scaleCellsProcedure))
  .post('/claims', honoAdapter(claimJobProcedure))
  .post('/runner', honoAdapter(trackRunnerProcedure));
