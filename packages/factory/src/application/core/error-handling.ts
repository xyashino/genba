import type { HttpStatus } from '@repo/contract-kit/http-status';

export class BaseError extends Error {
  readonly status: HttpStatus;
  readonly type: string;

  constructor(status: HttpStatus, type: string, message: string) {
    super(message);
    this.status = status;
    this.type = type;
  }
}

export class BadRequest extends BaseError {
  constructor(message: string) {
    super(400, 'invalid', message);
  }
}

export class Unauthorized extends BaseError {
  constructor(message: string) {
    super(401, 'unauthorized', message);
  }
}

export class Forbidden extends BaseError {
  constructor(message: string) {
    super(403, 'forbidden', message);
  }
}

export class NotFound extends BaseError {
  constructor(message: string) {
    super(404, 'not_found', message);
  }
}

export class InvalidState extends BaseError {
  constructor(message: string) {
    super(409, 'invalid_state', message);
  }
}

export class AlreadyResolved extends BaseError {
  constructor(message: string) {
    super(409, 'already_resolved', message);
  }
}

export class PayloadTooLarge extends BaseError {
  constructor(message: string) {
    super(413, 'payload_too_large', message);
  }
}

export class InvalidOrderGraph extends BaseError {
  constructor(message: string) {
    super(422, 'invalid_order_graph', message);
  }
}

export class InternalServer extends BaseError {
  constructor(message: string) {
    super(500, 'internal', message);
  }
}
