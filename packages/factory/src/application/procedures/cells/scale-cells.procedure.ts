import { scaleCellsContract } from '@repo/contracts/factory.contract';
import { cliProcedure } from '../../core/procedure.ts';

export const scaleCellsProcedure = cliProcedure(scaleCellsContract)(async (
  { body },
  ctx,
) => {
  await ctx.supervisor.scale(body.count);
  return { code: 200 as const, ...ctx.supervisor.status() };
});
