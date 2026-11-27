import { healthContract } from '@repo/contracts/factory.contract';
import { cliProcedure } from '../../core/procedure.ts';

export const healthProcedure = cliProcedure(healthContract)((_input, ctx) => ({
  code: 200 as const,
  repoRoot: ctx.repoRoot,
  pid: process.pid,
  ...ctx.supervisor.status(),
}));
