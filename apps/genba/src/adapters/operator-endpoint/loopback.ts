import { randomBytes, timingSafeEqual } from 'node:crypto';
import { operatorRequestSchema } from '@repo/contracts/operator.contract';
import {
  CYCLE_TOKEN_ENV,
  OPERATOR_URL_ENV,
} from '../../ports/operator.port.ts';
import type {
  OperatorEndpointPort,
  OperatorHandler,
  OperatorResponse,
} from '../../ports/operator.port.ts';

const HOST = '127.0.0.1';
const TOKEN_BYTES = 16;
const MAX_BODY_BYTES = 1024 * 1024;

type Server = ReturnType<typeof Bun.serve>;

const reply = (body: OperatorResponse): Response =>
  Response.json(body, { status: body.code });

const isAuthorized = (request: Request, token: string): boolean => {
  const given = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${token}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
};

const readJson = async (request: Request): Promise<unknown> => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

const serve = async (
  request: Request,
  token: string,
  handler: OperatorHandler,
): Promise<Response> => {
  if (!isAuthorized(request, token)) {
    return reply({
      code: 401,
      type: 'unauthorized',
      message: 'bad cycle token',
    });
  }
  const parsed = operatorRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return reply({
      code: 400,
      type: 'invalid',
      message: 'body is not an operator request',
    });
  }
  try {
    return reply(await handler(parsed.data));
  } catch {
    return reply({
      code: 500,
      type: 'internal',
      message: 'the Cell failed to handle the request',
    });
  }
};

export const createLoopbackEndpoint = (): OperatorEndpointPort => {
  let server: Server | undefined;
  const close = async (): Promise<void> => {
    await server?.stop(true);
    server = undefined;
  };
  return {
    open: async (handler) => {
      await close();
      const token = randomBytes(TOKEN_BYTES).toString('hex');
      server = Bun.serve({
        hostname: HOST,
        port: 0,
        maxRequestBodySize: MAX_BODY_BYTES,
        fetch: (request) => serve(request, token, handler),
      });
      const url = `http://${HOST}:${server.port}/`;
      return {
        url,
        token,
        env: { [OPERATOR_URL_ENV]: url, [CYCLE_TOKEN_ENV]: token },
      };
    },
    close,
  };
};
