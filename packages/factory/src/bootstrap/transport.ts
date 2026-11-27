import type { TransportContext } from '../application/core/procedure.ts';
import type { CreateTransport } from '../adapters/hono/types.ts';

export type TransportDeps = Omit<TransportContext, 'bearer' | 'signal'>;

export const createTransport =
  (deps: TransportDeps): CreateTransport =>
  ({ bearer, signal }) => ({ ...deps, bearer, signal });
