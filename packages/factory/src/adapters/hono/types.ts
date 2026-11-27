import type { TransportContext } from '../../application/core/procedure.ts';

export type TransportRequest = {
  bearer: string | null;
  signal: AbortSignal;
};

export type CreateTransport = (request: TransportRequest) => TransportContext;

export type AppEnv = {
  Variables: {
    transport: TransportContext;
  };
};
