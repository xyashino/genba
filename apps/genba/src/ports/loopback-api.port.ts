export type LoopbackApiPort = {
  /** resolves with the parsed JSON body of a 200 reply */
  request(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<unknown>;
  /** server-sent event payloads until the signal aborts or the server closes */
  events(signal: AbortSignal): AsyncIterable<unknown>;
};

export class ApiError extends Error {
  readonly status: number;
  readonly type: string;

  constructor(status: number, type: string, message: string) {
    super(message);
    this.status = status;
    this.type = type;
  }
}

export class ApiUnreachableError extends Error {}
