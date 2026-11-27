import type { LineDefinition } from '@repo/line/line';
import type { ClockPort } from '@repo/host/ports/clock.port';
import type { StorePort } from '../ports/store.port.ts';

export type FactoryEvent = {
  type:
    | 'order'
    | 'job_started'
    | 'job_finished'
    | 'job_requeued'
    | 'incident'
    | 'cells';
  at: string;
  order?: string;
  station?: string;
  status?: string;
  detail?: string;
};

export type FactoryContext = {
  store: StorePort;
  clock: ClockPort;
  newId: (prefix: string) => string;
  publish: (event: FactoryEvent) => void;
  lineOf: (name: string) => LineDefinition;
};

export const nowOf = (context: FactoryContext): string =>
  new Date(context.clock.now()).toISOString();
