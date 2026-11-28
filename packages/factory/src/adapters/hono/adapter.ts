import type { ContractIn } from '@repo/contract-kit/types';
import type { Context } from 'hono';
import { BadRequest } from '../../application/core/error-handling.ts';
import type { Procedure } from '../../application/core/procedure.ts';
import type { AppEnv } from './types.ts';

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    throw new BadRequest('malformed JSON body');
  }
};

const readJson = async (request: Request): Promise<unknown> => {
  const text = await request.text();
  if (text.length === 0) return undefined;
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    throw new BadRequest('unsupported Content-Type, expected application/json');
  }
  return parseJson(text);
};

export const honoAdapter = (procedure: Procedure) => {
  const declared: ContractIn = procedure.contract.in ?? {};
  return async (c: Context<AppEnv>) => {
    const response = await procedure.execute(
      {
        params: declared.params ? c.req.param() : {},
        query: declared.query ? c.req.query() : {},
        body: declared.body ? await readJson(c.req.raw) : undefined,
      },
      c.get('transport'),
    );
    return c.json(response, response.code);
  };
};
