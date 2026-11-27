import { idParams, pageOut, paginationIn } from '@repo/contract-kit/fields';
import { errorResponse } from '@repo/contract-kit/reply';
import type { ZodContract } from '@repo/contract-kit/types';
import { z } from 'zod';
import {
  incidentReasonSchema,
  incidentResolutionSchema,
  triageOwnerSchema,
} from './enums.js';

export const incidentSchema = z.object({
  id: z.string().min(1),
  orderId: z.string().min(1),
  stepId: z.string().min(1).nullable(),
  reason: incidentReasonSchema,
  triageOwner: triageOwnerSchema,
  summary: z.string().min(1),
  diagnosis: z.string().nullable(),
  issueUrl: z.url().nullable(),
  draftPrUrl: z.url().nullable(),
  resolution: incidentResolutionSchema.nullable(),
  createdAt: z.string().min(1),
  resolvedAt: z.string().nullable(),
});

export const listIncidentsContract = {
  in: {
    query: paginationIn.extend({
      triageOwner: triageOwnerSchema.optional(),
      openOnly: z.coerce.boolean().optional(),
    }),
  },
  out: {
    200: pageOut(incidentSchema),
  },
} satisfies ZodContract;

export const resolveIncidentContract = {
  in: {
    params: idParams,
    body: z.object({
      resolution: incidentResolutionSchema,
      stepId: z.string().min(1).optional(),
      diagnosis: z.string().min(1).optional(),
    }),
  },
  out: {
    200: z.object({
      code: z.literal(200),
      incident: incidentSchema,
    }),
    404: errorResponse(404, 'not_found'),
    409: errorResponse(409, 'already_resolved'),
  },
} satisfies ZodContract;

export type Incident = z.infer<typeof incidentSchema>;
