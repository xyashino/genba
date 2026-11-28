import { errorResponse } from '@repo/contract-kit/reply';
import type { ZodContract } from '@repo/contract-kit/types';
import { z } from 'zod';
import { incidentResolutionSchema } from './enums.ts';

export const OPERATOR_URL_ENV = 'GENBA_OPERATOR_URL';
export const CYCLE_TOKEN_ENV = 'GENBA_CYCLE_TOKEN';

export const operatorVerdictSchema = z.enum(['pass', 'fail']);

export const operatorDoneContract = {
  in: {
    body: z.object({
      summary: z.string().min(1).optional(),
    }),
  },
  out: {
    200: z.object({ code: z.literal(200), accepted: z.literal(true) }),
    422: z.object({
      code: z.literal(422),
      type: z.literal('guard_failed'),
      violations: z.array(z.string().min(1)).min(1),
    }),
  },
} satisfies ZodContract;

export const operatorVerdictContract = {
  in: {
    body: z.object({
      verdict: operatorVerdictSchema,
      /** omitted: the Cell uses the audit output */
      feedback: z.string().min(1).optional(),
    }),
  },
  out: {
    200: z.object({ code: z.literal(200), accepted: z.literal(true) }),
    422: errorResponse(422, 'guard_failed'),
  },
} satisfies ZodContract;

export const operatorBlockContract = {
  in: {
    body: z.object({
      reason: z.string().min(1),
    }),
  },
  out: {
    200: z.object({ code: z.literal(200), accepted: z.literal(true) }),
  },
} satisfies ZodContract;

export const operatorIncidentContract = {
  in: {
    body: z.object({
      resolution: incidentResolutionSchema,
      /** omitted: the Cell uses the diagnosis output */
      diagnosis: z.string().min(1).optional(),
      stepId: z.string().min(1).optional(),
    }),
  },
  out: {
    200: z.object({ code: z.literal(200), accepted: z.literal(true) }),
  },
} satisfies ZodContract;

export type OperatorVerdict = z.infer<typeof operatorVerdictSchema>;

/** The one body `genba operator` posts to its Cell: a verb plus that verb's contract body. */
export const operatorRequestSchema = z.discriminatedUnion('verb', [
  operatorDoneContract.in.body.extend({ verb: z.literal('done') }),
  operatorVerdictContract.in.body.extend({ verb: z.literal('verdict') }),
  operatorBlockContract.in.body.extend({ verb: z.literal('block') }),
  operatorIncidentContract.in.body.extend({ verb: z.literal('incident') }),
  z.object({ verb: z.literal('context') }),
  z.object({ verb: z.literal('read') }),
]);

export type OperatorRequest = z.infer<typeof operatorRequestSchema>;
