import { trackRunnerContract } from '@repo/contracts/factory.contract';
import { cellProcedure } from '../../core/procedure.ts';

export const trackRunnerProcedure = cellProcedure(trackRunnerContract)((
  { body },
  ctx,
) => {
  ctx.supervisor.setRunner(ctx.principal.cellId, body.runner);
  return { code: 200 as const };
});
