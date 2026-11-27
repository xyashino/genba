import {
  idParams,
  pageOut,
  paginationIn,
  slugSchema,
  titleSchema,
} from '@repo/contract-kit/fields';
import { errorResponse } from '@repo/contract-kit/reply';
import type { ZodContract } from '@repo/contract-kit/types';
import { z } from 'zod';
import {
  orderPrioritySchema,
  orderStatusSchema,
  prOutcomeSchema,
  stepStatusSchema,
} from './enums.ts';

export const orderStepSchema = z.object({
  id: z.string().min(1),
  orderId: z.string().min(1),
  stationId: z.string().min(1),
  status: stepStatusSchema,
  attemptsUsed: z.number().int().min(0),
  maxAttempts: z.number().int().min(1),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});

export const workOrderSchema = z.object({
  id: z.string().min(1),
  slug: slugSchema,
  title: titleSchema,
  body: z.string(),
  line: z.string().min(1),
  priority: orderPrioritySchema,
  status: orderStatusSchema,
  parentSlug: slugSchema.nullable(),
  planId: z.string().min(1).nullable(),
  prUrl: z.url().nullable(),
  prNumber: z.number().int().positive().nullable(),
  prOutcome: prOutcomeSchema.nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  startedAt: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  mergedAt: z.string().nullable(),
});

export const listOrdersContract = {
  in: {
    query: paginationIn.extend({
      status: orderStatusSchema.optional(),
      planId: z.string().min(1).optional(),
    }),
  },
  out: {
    200: pageOut(workOrderSchema),
  },
} satisfies ZodContract;

export const cancelOrderContract = {
  in: { params: idParams },
  out: {
    200: z.object({ code: z.literal(200), order: workOrderSchema }),
    404: errorResponse(404, 'not_found'),
    409: errorResponse(409, 'invalid_state'),
  },
} satisfies ZodContract;

export const importOrdersContract = {
  in: {
    body: z.object({
      orders: z.array(
        z.object({
          slug: slugSchema,
          title: titleSchema,
          body: z.string(),
          line: z.string().min(1),
          priority: orderPrioritySchema.default('medium'),
          parentSlug: slugSchema.nullable().default(null),
          planId: z.string().min(1).nullable().default(null),
        }),
      ),
    }),
  },
  out: {
    200: z.object({
      code: z.literal(200),
      imported: z.number().int().min(0),
      skipped: z.number().int().min(0),
    }),
    422: errorResponse(422, 'invalid_order_graph'),
  },
} satisfies ZodContract;

export type OrderStep = z.infer<typeof orderStepSchema>;
export type WorkOrder = z.infer<typeof workOrderSchema>;
