import { createMiddleware } from 'hono/factory';
import {
  Forbidden,
  PayloadTooLarge,
} from '../../application/core/error-handling.ts';
import { authenticate } from '../../application/core/procedure.ts';
import type { AppEnv, CreateTransport } from './types.ts';

const bearerOf = (header: string | undefined): string | null =>
  /^Bearer (.+)$/.exec(header ?? '')?.[1] ?? null;

// Rejects browsers: a web page sends `Origin`, and DNS rebinding arrives under a foreign `Host`.
export const localOnly = (port: number) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    if (
      c.req.header('origin') !== undefined ||
      !hosts.includes(c.req.header('host') ?? '')
    ) {
      throw new Forbidden('only local clients are served');
    }
    await next();
  });

export const noCache = createMiddleware<AppEnv>(async (c, next) => {
  c.header('cache-control', 'no-store');
  await next();
});

export const payloadLimit = (maxBytes: number) =>
  createMiddleware<AppEnv>(async (c, next) => {
    if (Number(c.req.header('content-length') ?? 0) > maxBytes) {
      throw new PayloadTooLarge(`body exceeds ${maxBytes} bytes`);
    }
    await next();
  });

export const transportMiddleware = (createTransport: CreateTransport) =>
  createMiddleware<AppEnv>(async (c, next) => {
    c.set(
      'transport',
      createTransport({
        bearer: bearerOf(c.req.header('authorization')),
        signal: c.req.raw.signal,
      }),
    );
    await next();
  });

/** Runs before routing, so a stranger learns nothing about which routes exist. */
export const requireToken = createMiddleware<AppEnv>(async (c, next) => {
  authenticate(c.get('transport'));
  await next();
});
