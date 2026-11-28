import { Hono } from 'hono';
import { honoAdapter } from '../adapter.ts';
import type { AppEnv } from '../types.ts';
import { healthProcedure } from '../../../application/procedures/factory/health.procedure.ts';
import { shutdownProcedure } from '../../../application/procedures/factory/shutdown.procedure.ts';

export const factoryRoute = new Hono<AppEnv>()
  .get('/health', honoAdapter(healthProcedure))
  .post('/shutdown', honoAdapter(shutdownProcedure));
