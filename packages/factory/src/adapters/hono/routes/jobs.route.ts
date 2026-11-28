import { Hono } from 'hono';
import { honoAdapter } from '../adapter.ts';
import type { AppEnv } from '../types.ts';
import { completeJobProcedure } from '../../../application/procedures/jobs/complete-job.procedure.ts';

export const jobsRoute = new Hono<AppEnv>().post(
  '/:id/complete',
  honoAdapter(completeJobProcedure),
);
