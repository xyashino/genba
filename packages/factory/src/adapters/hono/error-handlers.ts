import type { ErrorHandler, NotFoundHandler } from 'hono';
import { BaseError } from '../../application/core/error-handling.ts';

export const errorHandler: ErrorHandler = (error, c) => {
  if (error instanceof BaseError) {
    if (error.status === 500) console.error(error);
    return c.json(
      { code: error.status, type: error.type, message: error.message },
      error.status,
    );
  }
  console.error(error);
  return c.json(
    {
      code: 500,
      type: 'internal',
      message: 'the daemon failed to handle the request',
    },
    500,
  );
};

export const notFoundHandler: NotFoundHandler = (c) =>
  c.json(
    {
      code: 404,
      type: 'not_found',
      message: `no route ${c.req.method} ${c.req.path}`,
    },
    404,
  );
