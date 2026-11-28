import { Hono } from 'hono';
import {
  errorHandler,
  notFoundHandler,
} from './adapters/hono/error-handlers.ts';
import {
  localOnly,
  noCache,
  payloadLimit,
  requireToken,
  transportMiddleware,
} from './adapters/hono/middlewares.ts';
import { cellsRoute } from './adapters/hono/routes/cells.route.ts';
import { eventsRoute } from './adapters/hono/routes/events.route.ts';
import { factoryRoute } from './adapters/hono/routes/factory.route.ts';
import { incidentsRoute } from './adapters/hono/routes/incidents.route.ts';
import { jobsRoute } from './adapters/hono/routes/jobs.route.ts';
import { ordersRoute } from './adapters/hono/routes/orders.route.ts';
import type { AppEnv, CreateTransport } from './adapters/hono/types.ts';
import { MAX_BODY_BYTES } from './config.ts';

export const createApp = (
  createTransport: CreateTransport,
  { port }: { port: number },
) => {
  const app = new Hono<AppEnv>();
  app.use(
    '*',
    noCache,
    localOnly(port),
    payloadLimit(MAX_BODY_BYTES),
    transportMiddleware(createTransport),
    requireToken,
  );
  app.route('/api/v1', factoryRoute);
  app.route('/api/v1/orders', ordersRoute);
  app.route('/api/v1/incidents', incidentsRoute);
  app.route('/api/v1/cells', cellsRoute);
  app.route('/api/v1/jobs', jobsRoute);
  app.route('/api/v1/events', eventsRoute);
  app.onError(errorHandler);
  app.notFound(notFoundHandler);
  return app;
};
