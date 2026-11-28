import { cancelOrderContract } from '@repo/contracts/orders.contract';
import type { StoredOrder } from '../../ports/store.port.ts';
import type { FactoryContext } from '../../core/context.ts';
import { InvalidState, NotFound } from '../../core/error-handling.ts';
import { cliProcedure } from '../../core/procedure.ts';
import { applyDecision } from '../../orders/apply-decision.ts';

const FINISHED = ['delivered', 'merged', 'closed', 'cancelled'];

const cancelOrder = (context: FactoryContext, key: string): StoredOrder =>
  context.store.transaction(() => {
    const order = context.store.findOrder(key);
    if (order === undefined) {
      throw new NotFound(`order ${key} missing`);
    }
    if (FINISHED.includes(order.status)) {
      throw new InvalidState(`order is ${order.status}`);
    }
    applyDecision(context, order, {
      steps: [],
      orderStatus: 'cancelled',
      incident: { resolution: 'cancel', resolved: true },
    });
    return context.store.findOrder(order.id)!;
  });

export const cancelOrderProcedure = cliProcedure(cancelOrderContract)(async (
  { params: { id } },
  ctx,
) => {
  const target = ctx.store.findOrder(id);
  const job = ctx.store
    .activeJobs()
    .find((entry) => entry.orderId === target?.id);
  // No Cell may still run the order once it is cancelled.
  if (job !== undefined) await ctx.supervisor.stopCellOfJob(job.id);
  const order = cancelOrder(ctx, id);
  void ctx.supervisor.reconcile();
  return { code: 200 as const, order };
});
