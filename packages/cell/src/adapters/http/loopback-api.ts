import { z } from 'zod';
import {
  ApiError,
  ApiUnreachableError,
} from '../../ports/loopback-api.port.ts';
import type { LoopbackApiPort } from '../../ports/loopback-api.port.ts';

const PREFIX = '/api/v1';
// Scaling down waits for Cells and their runners to stop.
const REQUEST_TIMEOUT_MS = 120_000;
const DATA_LINE = 'data: ';

const errorSchema = z.object({ type: z.string(), message: z.string() });

export type LoopbackApiOptions = {
  url: string;
  token: string;
  /** replaces the network, for a factory in this process */
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
};

async function* dataLinesOf(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<string> {
  const decoder = new TextDecoder();
  let buffered = '';
  for await (const chunk of body) {
    buffered += decoder.decode(chunk, { stream: true });
    const lines = buffered.split('\n');
    buffered = lines.pop() ?? '';
    for (const line of lines) {
      if (line.startsWith(DATA_LINE)) yield line.slice(DATA_LINE.length);
    }
  }
}

export const createLoopbackApi = ({
  url,
  token,
  fetch: transport = fetch,
}: LoopbackApiOptions): LoopbackApiPort => {
  const send = async (
    method: string,
    path: string,
    signal: AbortSignal,
    body?: unknown,
  ): Promise<Response> => {
    let response: Response;
    try {
      response = await transport(`${url}${PREFIX}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
      });
    } catch {
      throw new ApiUnreachableError(`cannot reach the genba daemon at ${url}`);
    }
    if (response.ok) return response;
    const error = errorSchema.safeParse(
      await response.json().catch(() => null),
    );
    throw new ApiError(
      response.status,
      error.data?.type ?? 'unknown',
      error.data?.message ?? `daemon replied ${response.status}`,
    );
  };
  return {
    request: async (method, path, body) =>
      (
        await send(method, path, AbortSignal.timeout(REQUEST_TIMEOUT_MS), body)
      ).json(),
    events: async function* (signal) {
      const response = await send('GET', '/events', signal);
      try {
        for await (const line of dataLinesOf(response.body!)) {
          yield JSON.parse(line) as unknown;
        }
      } catch (error) {
        if (!signal.aborted) throw error;
      }
    },
  };
};
