import { idParams } from '@repo/contract-kit/fields';
import { errorResponse } from '@repo/contract-kit/reply';
import type { ZodContract } from '@repo/contract-kit/types';
import { z } from 'zod';
import {
  incidentReasonSchema,
  incidentResolutionSchema,
  jobStatusSchema,
  modelTierSchema,
} from './enums.ts';
import { orderStepSchema, workOrderSchema } from './orders.contract.ts';

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

/** Everything a Cell needs to run one job without reading the database. */
export const jobAssignmentSchema = z.object({
  job: jobSchema,
  order: workOrderSchema,
  steps: z.array(orderStepSchema),
  /** parent order branch to stack on; null means the repo base branch */
  parentBranch: z.string().min(1).nullable(),
  /** drop the existing worktree and branch before starting */
  freshWorktree: z.boolean(),
  /** why the previous attempt failed */
  feedback: z.string().nullable(),
  incident: z
    .object({
      id: z.string().min(1),
      reason: incidentReasonSchema,
      stationId: z.string().nullable(),
      summary: z.string(),
      diagnosis: z.string().nullable(),
    })
    .nullable(),
});

export const jobOutcomeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('passed'),
    summary: z.string().optional(),
    prUrl: z.url().optional(),
    prNumber: z.number().int().positive().optional(),
  }),
  z.object({ kind: z.literal('failed'), feedback: z.string().min(1) }),
  z.object({ kind: z.literal('blocked'), reason: z.string().min(1) }),
  z.object({ kind: z.literal('env_error'), detail: z.string().min(1) }),
  z.object({
    kind: z.literal('resolved'),
    resolution: incidentResolutionSchema,
    diagnosis: z.string().min(1),
    stationId: z.string().min(1).optional(),
  }),
  z.object({
    kind: z.literal('escalated'),
    issueUrl: z.url().nullable(),
    draftPrUrl: z.url().nullable(),
    warning: z.string().nullable(),
  }),
]);

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
      assignment: jobAssignmentSchema.nullable(),
      blockedReason: z.enum(['insufficient_usage']).optional(),
    }),
  },
} satisfies ZodContract;

export const completeJobContract = {
  in: {
    params: idParams,
    body: z.object({
      cellId: z.string().min(1),
      durationMs: z.number().int().min(0),
      runner: z.string().min(1).optional(),
      model: z.string().min(1).optional(),
      tier: modelTierSchema.optional(),
      outcome: jobOutcomeSchema,
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

export type JobAssignment = z.infer<typeof jobAssignmentSchema>;
export type JobOutcome = z.infer<typeof jobOutcomeSchema>;
export type RunnerQuota = z.infer<typeof runnerQuotaSchema>;
export type Job = z.infer<typeof jobSchema>;
