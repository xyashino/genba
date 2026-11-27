import type { BuiltinLineName } from '../../../builtin/registry.ts';
import { BUILTIN_LINES } from '../../../builtin/registry.ts';
import { parseLine } from '../../../domain/line.ts';
import type { LineDefinition } from '../../../domain/line.ts';
import type { ClockPort } from '../../../ports/clock.port.ts';
import type { StorePort } from '../../../ports/store.port.ts';
import { DaemonError } from './errors.ts';

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
};

export const nowOf = (context: DaemonContext): string =>
  new Date(context.clock.now()).toISOString();

export const lineOf = (name: string): LineDefinition => {
  if (!Object.hasOwn(BUILTIN_LINES, name)) {
    throw new DaemonError(
      422,
      'invalid_order_graph',
      `unknown line "${name}", expected one of ${Object.keys(BUILTIN_LINES).join(', ')}`,
    );
  }
  return parseLine(BUILTIN_LINES[name as BuiltinLineName]);
};
