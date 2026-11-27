import type { LineDefinition } from '../../../domain/line.ts';
import type { ClockPort } from '../../../ports/clock.port.ts';
import type { StorePort } from '../../../ports/store.port.ts';

export type DaemonEvent = {
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

export type DaemonContext = {
  store: StorePort;
  clock: ClockPort;
  newId: (prefix: string) => string;
  publish: (event: DaemonEvent) => void;
  lineOf: (name: string) => LineDefinition;
};

export const nowOf = (context: DaemonContext): string =>
  new Date(context.clock.now()).toISOString();
