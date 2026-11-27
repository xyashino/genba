import { listOrdersContract } from '@repo/contracts/orders.contract';
import { pageOf } from '../../core/paginate.ts';
import { cliProcedure } from '../../core/procedure.ts';

export const listOrdersProcedure = cliProcedure(listOrdersContract)((
  { query },
  ctx,
) => {
  const matching = ctx.store
    .listOrders()
    .filter(
      (order) =>
        (query.status === undefined || order.status === query.status) &&
        (query.planId === undefined || order.planId === query.planId),
    );
  return { code: 200 as const, ...pageOf(matching, query) };
});
