import type { StoredOrder } from '../../../ports/store.port.ts';
import type { DaemonContext } from '../core/context.ts';
import { DaemonError } from '../core/errors.ts';
import { applyDecision } from './apply-decision.ts';

const FINISHED = ['delivered', 'merged', 'closed', 'cancelled'];

/** The caller must first confirm that no Cell still runs this order. */
export const cancelOrder = (context: DaemonContext, key: string): StoredOrder =>
  context.store.transaction(() => {
    const order = context.store.findOrder(key);
    if (order === undefined) {
      throw new DaemonError(404, 'not_found', `order ${key} missing`);
    }
    if (FINISHED.includes(order.status)) {
      throw new DaemonError(409, 'invalid_state', `order is ${order.status}`);
    }
    applyDecision(context, order, {
      steps: [],
      orderStatus: 'cancelled',
      incident: { resolution: 'cancel', resolved: true },
    });
    return context.store.findOrder(order.id)!;
  });
