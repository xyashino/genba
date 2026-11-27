import type { HttpStatus } from '@repo/contract-kit/http-status';

export class DaemonError extends Error {
  readonly code: HttpStatus;
  readonly type: string;

  constructor(code: HttpStatus, type: string, message: string) {
    super(message);
    this.code = code;
    this.type = type;
  }
}
