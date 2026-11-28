import type {
  ContractIn,
  ContractInput,
  ProcedureResponse,
  RawInput,
  ZodContract,
} from '@repo/contract-kit/types';
import { z } from 'zod';
import { BadRequest, InternalServer } from '../error-handling.ts';

const parseSection = (
  contract: ZodContract,
  section: keyof ContractIn,
  value: unknown,
): unknown => {
  const schema = contract.in?.[section];
  if (schema === undefined) return undefined;
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new BadRequest(
    `invalid request ${section}:\n${z.prettifyError(result.error)}`,
  );
};

const checkOutput = <R extends ProcedureResponse>(
  contract: ZodContract,
  output: R,
): R => {
  const schema = contract.out[output.code];
  if (schema === undefined) {
    throw new InternalServer(`undeclared response code ${output.code}`);
  }
  const result = schema.safeParse(output);
  if (!result.success) {
    throw new InternalServer(
      `response does not match contract ${output.code}:\n${z.prettifyError(result.error)}`,
    );
  }
  return output;
};

export const withZodSchema =
  <C extends ZodContract>(contract: C) =>
  <Ctx, R extends ProcedureResponse>(
    handler: (input: ContractInput<C>, ctx: Ctx) => R | Promise<R>,
  ) =>
  async (raw: RawInput, ctx: Ctx): Promise<R> => {
    const input = {
      params: parseSection(contract, 'params', raw.params),
      query: parseSection(contract, 'query', raw.query),
      body: parseSection(contract, 'body', raw.body),
    } as ContractInput<C>;
    return checkOutput(contract, await handler(input, ctx));
  };
