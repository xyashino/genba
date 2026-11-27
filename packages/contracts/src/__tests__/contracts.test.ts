import { parseReply } from '@repo/contract-kit/reply';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { hubSyncContract } from '../hub.contract.js';
import type { HubCommand } from '../hub.contract.js';
import {
  incidentSchema,
  resolveIncidentContract,
} from '../incidents.contract.js';
import { completeJobContract, jobSchema } from '../jobs.contract.js';
import { operatorDoneContract } from '../operator.contract.js';
import {
  getOrderContract,
  importOrdersContract,
  workOrderSchema,
} from '../orders.contract.js';
import type { WorkOrder } from '../orders.contract.js';

const SAMPLE_ORDER = {
  id: 'ord-1',
  slug: 'add-login',
  title: 'Add login flow',
  body: 'Implement OAuth login',
  line: 'standard',
  priority: 'high' as const,
  status: 'delivered' as const,
  parentSlug: null,
  planId: 'plan-1',
  prUrl: 'https://github.com/org/repo/pull/12',
  prNumber: 12,
  prOutcome: 'merged' as const,
  createdAt: '2026-11-27T10:00:00Z',
  updatedAt: '2026-11-27T11:00:00Z',
  startedAt: '2026-11-27T10:05:00Z',
  deliveredAt: '2026-11-27T10:40:00Z',
  mergedAt: '2026-11-27T11:00:00Z',
};

describe('Unified wire contracts', () => {
  it('validates work orders, import payloads, and typed replies', () => {
    const parsed = workOrderSchema.parse(SAMPLE_ORDER);
    expect(parsed.prOutcome).toBe('merged');
    expectTypeOf(parsed).toEqualTypeOf<WorkOrder>();

    const imported = importOrdersContract.in.body.parse({
      orders: [
        {
          slug: 'fix-bug',
          title: 'Fix null crash',
          body: 'Handle empty input',
          line: 'fast',
        },
      ],
    });
    expect(imported.orders[0]?.priority).toBe('medium');

    const reply = parseReply(getOrderContract, 404, {
      code: 404,
      type: 'not_found',
      message: 'order missing',
    });
    expect(reply.ok).toBe(true);
  });

  it('validates jobs with runner, model, tier, usage, and cost', () => {
    const job = jobSchema.parse({
      id: 'job-1',
      orderId: 'ord-1',
      stepId: 'step-1',
      cellId: 'cell-a1',
      stationId: 'build',
      attempt: 2,
      status: 'completed',
      runner: 'claude',
      model: 'sonnet',
      tier: 'strong',
      usage: {
        inputTokens: 12000,
        outputTokens: 3200,
        cacheReadTokens: 8000,
      },
      costUsd: 0.18,
      durationMs: 42000,
      startedAt: '2026-11-27T10:05:00Z',
      finishedAt: '2026-11-27T10:05:42Z',
    });
    expect(job.usage?.cacheWriteTokens).toBe(0);
    expect(
      completeJobContract.in.body.safeParse({
        status: 'completed',
        durationMs: 1000,
        costUsd: 0.05,
      }).success,
    ).toBe(true);
  });

  it('validates incidents with forge links and diagnosis', () => {
    const incident = incidentSchema.parse({
      id: 'inc-1',
      orderId: 'ord-1',
      stepId: 'step-1',
      reason: 'step_retries_exhausted',
      triageOwner: 'supervisor',
      summary: 'Build failed after 3 attempts',
      diagnosis: 'Retried build 3 times on flaky test',
      issueUrl: 'https://github.com/org/repo/issues/99',
      draftPrUrl: 'https://github.com/org/repo/pull/100',
      resolution: null,
      createdAt: '2026-11-27T10:30:00Z',
      resolvedAt: null,
    });
    expect(incident.reason).toBe('step_retries_exhausted');
    expect(
      resolveIncidentContract.in.body.safeParse({
        resolution: 'retry_step',
      }).success,
    ).toBe(true);
  });

  it('validates operator guard violations and hub sync outbox', () => {
    const guardReply = parseReply(operatorDoneContract, 422, {
      code: 422,
      type: 'guard_failed',
      violations: ['missing required heading: Checks'],
    });
    expect(guardReply.ok).toBe(true);

    const syncOut = parseReply(hubSyncContract, 200, {
      code: 200,
      commands: [
        {
          id: 'cmd-1',
          genbaId: 'genba-local',
          kind: 'scale_cells',
          payload: { count: 2 },
          createdAt: '2026-11-27T11:00:00Z',
        },
      ],
    });
    expect(syncOut.ok).toBe(true);
    expectTypeOf<HubCommand['kind']>().toEqualTypeOf<
      | 'scale_cells'
      | 'pause_order'
      | 'resume_order'
      | 'cancel_order'
      | 'resolve_incident'
      | 'sync_prs'
    >();
  });
});
