import { errorResponse } from '@repo/contract-kit/reply';
import type { ZodContract } from '@repo/contract-kit/types';
import { z } from 'zod';
import { hubCommandKindSchema } from './enums.ts';
import { incidentSchema } from './incidents.contract.ts';
import { workOrderSchema } from './orders.contract.ts';

export const hubCommandSchema = z.object({
  id: z.string().min(1),
  genbaId: z.string().min(1),
  kind: hubCommandKindSchema,
  payload: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().min(1),
});

export const hubSyncContract = {
  in: {
    body: z.object({
      genbaId: z.string().min(1),
      project: z.string().min(1),
      onlineCells: z.number().int().min(0),
      orders: z.array(workOrderSchema),
      incidents: z.array(incidentSchema),
      sentAt: z.string().min(1),
    }),
  },
  out: {
    200: z.object({
      code: z.literal(200),
      commands: z.array(hubCommandSchema),
    }),
    401: errorResponse(401, 'unauthorized'),
  },
} satisfies ZodContract;

export const hubAckCommandContract = {
  in: {
    body: z.object({
      commandId: z.string().min(1),
      ok: z.boolean(),
      error: z.string().optional(),
    }),
  },
  out: {
    200: z.object({ code: z.literal(200), acked: z.literal(true) }),
    404: errorResponse(404, 'not_found'),
  },
} satisfies ZodContract;

export type HubCommand = z.infer<typeof hubCommandSchema>;
