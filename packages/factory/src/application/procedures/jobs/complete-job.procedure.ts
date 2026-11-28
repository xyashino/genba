import { completeJobContract } from '@repo/contracts/jobs.contract';
import {
  Forbidden,
  InvalidState,
  NotFound,
} from '../../core/error-handling.ts';
import { cellProcedure } from '../../core/procedure.ts';
import { settleJob } from '../../orders/settle-job.ts';

export const completeJobProcedure = cellProcedure(completeJobContract)((
  { params: { id }, body },
  ctx,
) => {
  if (ctx.principal.cellId !== body.cellId) {
    throw new Forbidden('token of another Cell');
  }
  const job = ctx.store.transaction(() => {
    const running = ctx.store.findJob(id);
    if (running === undefined) throw new NotFound(`job ${id} missing`);
    if (running.status !== 'running' || running.cellId !== body.cellId) {
      throw new InvalidState(`job ${id} is not running on ${body.cellId}`);
    }
    return settleJob(ctx, running, body);
  });
  return { code: 200 as const, job };
});
