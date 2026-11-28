import type {
  ContractInput,
  ProcedureResponse,
  RawInput,
  ZodContract,
} from '@repo/contract-kit/types';
import type { Supervisor } from '../cells/supervisor.ts';
import type { AuthPort, Principal } from '../ports/auth.port.ts';
import type { EventBus } from '../ports/event-bus.port.ts';
import type { FactoryContext } from './context.ts';
import { Forbidden, Unauthorized } from './error-handling.ts';
import { withZodSchema } from './schema/zod.ts';

export type TransportContext = FactoryContext & {
  auth: AuthPort;
  supervisor: Supervisor;
  events: EventBus;
  repoRoot: string;
  shutdown: () => void;
  bearer: string | null;
  signal: AbortSignal;
};

export type Access = Principal['kind'];

export type AuthenticatedContext<A extends Access> = TransportContext & {
  principal: Extract<Principal, { kind: A }>;
};

export type Procedure = {
  readonly access: Access;
  readonly contract: ZodContract;
  execute(raw: RawInput, ctx: TransportContext): Promise<ProcedureResponse>;
};

export const authenticate = (ctx: TransportContext): Principal => {
  const principal = ctx.bearer === null ? null : ctx.auth.verify(ctx.bearer);
  if (principal === null) throw new Unauthorized('bad bearer token');
  return principal;
};

export const authorize = <A extends Access>(
  access: A,
  ctx: TransportContext,
): AuthenticatedContext<A> => {
  const principal = authenticate(ctx);
  if (principal.kind !== access) {
    throw new Forbidden(`route is for the ${access}`);
  }
  return {
    ...ctx,
    principal: principal as Extract<Principal, { kind: A }>,
  };
};

const define =
  <A extends Access>(access: A) =>
  <C extends ZodContract>(contract: C) =>
  <R extends ProcedureResponse>(
    handler: (
      input: ContractInput<C>,
      ctx: AuthenticatedContext<A>,
    ) => R | Promise<R>,
  ): Procedure => {
    const run = withZodSchema(contract)(handler);
    return {
      access,
      contract,
      execute: async (raw, ctx) => run(raw, authorize(access, ctx)),
    };
  };

export const cliProcedure = define('cli');

export const cellProcedure = define('cell');
