import { shutdownContract } from '@repo/contracts/factory.contract';
import { SHUTDOWN_REPLY_MS } from '../../../config.ts';
import { cliProcedure } from '../../core/procedure.ts';

export const shutdownProcedure = cliProcedure(shutdownContract)(async (
  _input,
  ctx,
) => {
  await ctx.supervisor.stopAll();
  // Reply first, then close.
  setTimeout(ctx.shutdown, SHUTDOWN_REPLY_MS);
  return { code: 200 as const };
});
