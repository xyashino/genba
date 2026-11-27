import { errorResponse } from '@repo/contract-kit/reply';
import type { ZodContract } from '@repo/contract-kit/types';
import { z } from 'zod';
import { incidentResolutionSchema } from './enums.js';

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
      feedback: z.string().min(1),
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
      diagnosis: z.string().min(1),
      stepId: z.string().min(1).optional(),
    }),
  },
  out: {
    200: z.object({ code: z.literal(200), accepted: z.literal(true) }),
  },
} satisfies ZodContract;

export type OperatorVerdict = z.infer<typeof operatorVerdictSchema>;
