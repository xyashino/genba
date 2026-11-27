import { z } from 'zod';

export const ORDER_STATUSES = [
  'queued',
  'running',
  'blocked',
  'delivered',
  'merged',
  'closed',
  'cancelled',
] as const;

export const ORDER_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;

export const PR_OUTCOMES = ['open', 'merged', 'closed'] as const;

export const STEP_STATUSES = [
  'pending',
  'running',
  'passed',
  'failed',
  'skipped',
] as const;

export const JOB_STATUSES = [
  'claimed',
  'running',
  'completed',
  'failed',
  'cancelled',
] as const;

export const INCIDENT_REASONS = [
  'step_retries_exhausted',
  'operator_blocked',
  'quota_exhausted',
  'stale_base',
  'env_error',
] as const;

export const INCIDENT_RESOLUTIONS = [
  'retry_step',
  'restart_from_step',
  'restart_from_scratch',
  'escalate',
  'cancel',
] as const;

export const TRIAGE_OWNERS = ['mechanic', 'supervisor'] as const;

export const FORGE_PROVIDERS = ['github', 'gitlab'] as const;

export const MODEL_TIERS = ['fast', 'strong', 'top'] as const;

export const HUB_COMMAND_KINDS = [
  'scale_cells',
  'pause_order',
  'resume_order',
  'cancel_order',
  'resolve_incident',
  'sync_prs',
] as const;

export const orderStatusSchema = z.enum(ORDER_STATUSES);
export const orderPrioritySchema = z.enum(ORDER_PRIORITIES);
export const prOutcomeSchema = z.enum(PR_OUTCOMES);
export const stepStatusSchema = z.enum(STEP_STATUSES);
export const jobStatusSchema = z.enum(JOB_STATUSES);
export const incidentReasonSchema = z.enum(INCIDENT_REASONS);
export const incidentResolutionSchema = z.enum(INCIDENT_RESOLUTIONS);
export const triageOwnerSchema = z.enum(TRIAGE_OWNERS);
export const forgeProviderSchema = z.enum(FORGE_PROVIDERS);
export const modelTierSchema = z.enum(MODEL_TIERS);
export const hubCommandKindSchema = z.enum(HUB_COMMAND_KINDS);

export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type OrderPriority = z.infer<typeof orderPrioritySchema>;
export type PrOutcome = z.infer<typeof prOutcomeSchema>;
export type StepStatus = z.infer<typeof stepStatusSchema>;
export type JobStatus = z.infer<typeof jobStatusSchema>;
export type IncidentReason = z.infer<typeof incidentReasonSchema>;
export type IncidentResolution = z.infer<typeof incidentResolutionSchema>;
export type TriageOwner = z.infer<typeof triageOwnerSchema>;
export type ForgeProvider = z.infer<typeof forgeProviderSchema>;
export type ModelTier = z.infer<typeof modelTierSchema>;
export type HubCommandKind = z.infer<typeof hubCommandKindSchema>;
