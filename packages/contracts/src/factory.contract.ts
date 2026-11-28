import { errorResponse } from '@repo/contract-kit/reply';
import type { ZodContract } from '@repo/contract-kit/types';
import { z } from 'zod';

const cellViewSchema = z.object({
  cellId: z.string().min(1),
  pid: z.number().int().positive(),
  state: z.enum(['idle', 'running']),
  jobId: z.string().nullable(),
  startedAt: z.string().min(1),
});

const fleetShape = {
  desired: z.number().int().min(0),
  crashLoop: z.boolean(),
  cells: z.array(cellViewSchema),
};

export const healthContract = {
  out: {
    200: z.object({
      code: z.literal(200),
      repoRoot: z.string().min(1),
      pid: z.number().int().positive(),
      ...fleetShape,
    }),
  },
} satisfies ZodContract;

export const scaleCellsContract = {
  in: { body: z.object({ count: z.number().int().min(0).max(32) }) },
  out: {
    200: z.object({ code: z.literal(200), ...fleetShape }),
    409: errorResponse(409, 'invalid_state'),
  },
} satisfies ZodContract;

export const trackRunnerContract = {
  in: {
    body: z.object({
      runner: z
        .object({
          pid: z.number().int().positive(),
          command: z.string().min(1),
        })
        .nullable(),
    }),
  },
  out: { 200: z.object({ code: z.literal(200) }) },
} satisfies ZodContract;

export const shutdownContract = {
  out: { 200: z.object({ code: z.literal(200) }) },
} satisfies ZodContract;
