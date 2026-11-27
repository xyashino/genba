import { parseArgs } from 'node:util';
import { operatorRequestSchema } from '@repo/contracts/operator.contract';
import type { OperatorRequest } from '@repo/contracts/operator.contract';
import { EXIT } from '../../domain/exit-codes.ts';
import type { ExitCode } from '../../domain/exit-codes.ts';
import { OperatorUnreachableError } from '../../ports/operator.port.ts';
import type {
  OperatorClientPort,
  OperatorReply,
} from '../../ports/operator.port.ts';

const USAGE = `usage: genba operator <verb>
  done [--summary <text>]
  verdict pass|fail [--feedback <text>]
  block <reason>
  incident <resolution> [--diagnosis <text>] [--step <station>]
  context
  read`;

export type OperatorDeps = {
  client: OperatorClientPort;
  exitCodeFor: (status: number) => ExitCode;
  errorLineFor: (reply: OperatorReply) => string | undefined;
  out: (text: string) => void;
  err: (text: string) => void;
};

const requestOf = (args: readonly string[]): OperatorRequest | null => {
  const { values, positionals } = parseArgs({
    args: [...args],
    allowPositionals: true,
    options: {
      summary: { type: 'string' },
      feedback: { type: 'string' },
      diagnosis: { type: 'string' },
      step: { type: 'string' },
    },
  });
  const [verb, ...rest] = positionals;
  const [first] = rest;
  const fields: Record<string, unknown> = {
    done: { summary: values.summary },
    verdict: { verdict: first, feedback: values.feedback },
    block: { reason: rest.join(' ') },
    incident: {
      resolution: first,
      diagnosis: values.diagnosis,
      stepId: values.step,
    },
    context: {},
    read: {},
  };
  const parsed = operatorRequestSchema.safeParse({
    ...(fields[verb ?? ''] as object | undefined),
    verb,
  });
  return parsed.success ? parsed.data : null;
};

const textOf = (request: OperatorRequest, body: unknown): string => {
  const reply = body as { prompt?: string; outputs?: unknown };
  if (request.verb === 'context') return reply.prompt ?? '';
  return request.verb === 'read'
    ? JSON.stringify(reply.outputs, null, 2)
    : 'accepted';
};

/** One request to the Cell, no state: exit 0 accepted, 1 refused, 2 bad usage, 3 unreachable. */
export const runOperator = async (
  args: readonly string[],
  deps: OperatorDeps,
): Promise<ExitCode> => {
  let request: OperatorRequest | null = null;
  try {
    request = requestOf(args);
  } catch {
    request = null;
  }
  if (request === null) {
    deps.err(USAGE);
    return EXIT.argument;
  }
  try {
    const reply = await deps.client.send(request);
    if (reply.status === 200) {
      deps.out(textOf(request, reply.body));
    } else {
      deps.err(deps.errorLineFor(reply) ?? `refused with ${reply.status}`);
    }
    return deps.exitCodeFor(reply.status);
  } catch (error) {
    if (!(error instanceof OperatorUnreachableError)) throw error;
    deps.err(error.message);
    return EXIT.unreachable;
  }
};
