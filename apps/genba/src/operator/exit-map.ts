import { z } from 'zod';
import { EXIT } from '../domain/exit-codes.ts';
import type { ExitCode } from '../domain/exit-codes.ts';
import type { OperatorReply } from '@repo/cell/ports/operator.port';

const errorBodySchema = z.object({
  code: z.number(),
  type: z.string(),
  message: z.string().optional(),
  violations: z.array(z.string()).optional(),
});

export const exitCodeFor = (status: number): ExitCode => {
  switch (status) {
    case 200:
      return EXIT.ok;
    case 400:
    case 401:
    case 409:
    case 422:
    case 500:
      return EXIT.refused;
    default:
      return EXIT.unreachable;
  }
};

// Guard violations are printed one per line so the live agent can fix each in-session.
export const errorLineFor = (reply: OperatorReply): string | undefined => {
  const parsed = errorBodySchema.safeParse(reply.body);
  if (!parsed.success) return undefined;
  const { code, type, message, violations = [] } = parsed.data;
  return [
    `${code} ${type}${message === undefined ? '' : `: ${message}`}`,
    ...violations.map((violation) => `- ${violation}`),
  ].join('\n');
};
