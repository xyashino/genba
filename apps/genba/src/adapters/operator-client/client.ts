import { OperatorUnreachableError } from '../../ports/operator.port.ts';
import type { OperatorClientPort } from '../../ports/operator.port.ts';

const REQUEST_TIMEOUT_MS = 10_000;
const UNREADABLE_REPLY = 'the Cell sent a reply this CLI cannot read';

export type OperatorClientOptions = {
  url: string;
  token: string;
  fetchImpl?: typeof fetch;
};

const readReply = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    throw new OperatorUnreachableError(UNREADABLE_REPLY);
  }
};

// One request, no retry: the agent decides whether to send again.
export const createOperatorClient = ({
  url,
  token,
  fetchImpl = fetch,
}: OperatorClientOptions): OperatorClientPort => ({
  send: async (request) => {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new OperatorUnreachableError(`cannot reach the Cell at ${url}`);
    }
    return { status: response.status, body: await readReply(response) };
  },
});
