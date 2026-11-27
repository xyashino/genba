import { getOrderContract } from '@repo/contracts/jobs.contract';
import { NotFound } from '../../core/error-handling.ts';
import { cliProcedure } from '../../core/procedure.ts';

export const getOrderProcedure = cliProcedure(getOrderContract)((
  { params },
  ctx,
) => {
  const order = ctx.store.findOrder(params.id);
  if (order === undefined) throw new NotFound(`order ${params.id} missing`);
  return {
    code: 200 as const,
    order,
    steps: ctx.store.stepsOf(order.id),
    jobs: ctx.store.jobsOf(order.id),
  };
});
