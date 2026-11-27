import { idParams } from '@repo/contract-kit/fields';
import { errorResponse } from '@repo/contract-kit/reply';
import type { ZodContract } from '@repo/contract-kit/types';
import { z } from 'zod';
import { jobStatusSchema, modelTierSchema } from './enums.ts';

export const jobSchema = z.object({
  id: z.string().min(1),
  orderId: z.string().min(1),
  stepId: z.string().min(1),
  cellId: z.string().min(1),
  stationId: z.string().min(1),
  attempt: z.number().int().min(1),
  status: jobStatusSchema,
  runner: z.string().min(1).nullable(),
  model: z.string().min(1).nullable(),
  tier: modelTierSchema.nullable(),
  durationMs: z.number().int().min(0).nullable(),
  startedAt: z.string().min(1),
  finishedAt: z.string().nullable(),
});

export const runnerQuotaSchema = z.object({
  runner: z.string().min(1),
  remainingPct: z.number().min(0).max(100),
  resetsAt: z.string().nullable().default(null),
});

export const claimJobContract = {
  in: {
    body: z.object({
      cellId: z.string().min(1),
      quotas: z.array(runnerQuotaSchema).default([]),
    }),
  },
  out: {
    200: z.object({
      code: z.literal(200),
      job: jobSchema.nullable(),
      blockedReason: z.enum(['insufficient_usage']).optional(),
    }),
  },
} satisfies ZodContract;

export const completeJobContract = {
  in: {
    params: idParams,
    body: z.object({
      status: z.enum(['completed', 'failed', 'cancelled']),
      durationMs: z.number().int().min(0),
      summary: z.string().optional(),
    }),
  },
  out: {
    200: z.object({
      code: z.literal(200),
      job: jobSchema,
    }),
    404: errorResponse(404, 'not_found'),
    409: errorResponse(409, 'invalid_state'),
  },
} satisfies ZodContract;

export type RunnerQuota = z.infer<typeof runnerQuotaSchema>;
export type Job = z.infer<typeof jobSchema>;
