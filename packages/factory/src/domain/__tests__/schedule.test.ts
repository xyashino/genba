import { describe, expect, it } from 'vitest';
import { parseLine } from '@repo/line/line';
import {
  applyResolution,
  decideAfterJob,
  initialSteps,
  nextStationId,
  rankCandidates,
} from '../schedule.ts';
import type { DecisionInput, ScheduledStep } from '../schedule.ts';

import { STANDARD_LINE } from '../../../test/support/standard-line.ts';

const line = parseLine(STANDARD_LINE);

const stepsWith = (
  changes: Record<string, Partial<ScheduledStep>>,
): ScheduledStep[] =>
  initialSteps(line).map((step) => ({ ...step, ...changes[step.stationId] }));

const decide = (input: Partial<DecisionInput>) =>
  decideAfterJob({
    line,
    steps: initialSteps(line),
    stationId: 'build',
    outcome: { kind: 'passed' },
    incidentStationId: null,
    mechanicRuns: 0,
    ...input,
  });

const gateExhausted = (mechanicRuns: number) =>
  decide({
    steps: stepsWith({
      build: { status: 'passed', attemptsUsed: 3 },
      'quality-gate': { status: 'running', attemptsUsed: 3 },
    }),
    stationId: 'quality-gate',
    outcome: { kind: 'failed', feedback: 'tests red' },
    mechanicRuns,
  });

describe('order scheduling', () => {
  it('runs the stations in line order and delivers last', () => {
    const steps = stepsWith({
      build: { status: 'passed' },
      'quality-gate': { status: 'passed' },
      audit: { status: 'passed' },
    });

    expect(nextStationId(line, initialSteps(line))).toBe('build');
    expect(nextStationId(line, steps)).toBe('deliver');
  });

  it('sends a failed gate back to the builder with the failure', () => {
    const decision = decide({
      steps: stepsWith({
        build: { status: 'passed', attemptsUsed: 1 },
        'quality-gate': { status: 'running', attemptsUsed: 1 },
      }),
      stationId: 'quality-gate',
      outcome: { kind: 'failed', feedback: 'tests red' },
    });

    expect(decision.steps).toEqual([
      { stationId: 'build', status: 'pending', feedback: 'tests red' },
      { stationId: 'quality-gate', status: 'pending' },
    ]);
  });

  it('calls the mechanic once retries run out, and a human the second time', () => {
    expect(gateExhausted(0).openIncident).toMatchObject({
      reason: 'step_retries_exhausted',
      triageOwner: 'mechanic',
    });
    expect(gateExhausted(1).openIncident).toMatchObject({
      triageOwner: 'supervisor',
    });
  });

  it.each(['blocked', 'env_error'] as const)(
    'escalates a %s station straight to a human',
    (kind) => {
      const outcome =
        kind === 'blocked'
          ? { kind, reason: 'need a decision' }
          : { kind, detail: 'no runner' };

      expect(decide({ outcome }).openIncident).toMatchObject({
        triageOwner: 'supervisor',
      });
    },
  );

  it('blocks the order after escalating, keeping what the forge returned', () => {
    const decision = decide({
      stationId: 'escalate',
      outcome: {
        kind: 'escalated',
        issueUrl: null,
        draftPrUrl: null,
        warning: 'gh is down',
      },
    });

    expect(decision.orderStatus).toBe('blocked');
    expect(decision.incident).toMatchObject({ warning: 'gh is down' });
  });

  it('gives a retried step exactly one more attempt', () => {
    const decision = applyResolution(
      line,
      initialSteps(line),
      'retry_step',
      'build',
      'try again',
    );

    expect(decision).toMatchObject({
      orderStatus: 'queued',
      steps: expect.arrayContaining([
        expect.objectContaining({ stationId: 'build', attemptsUsed: 1 }),
      ]),
    });
  });

  it('escalates when the mechanic asks for a station that does not exist', () => {
    const decision = decide({
      stationId: 'mechanic',
      outcome: {
        kind: 'resolved',
        resolution: 'restart_from_step',
        stationId: 'nope',
        diagnosis: 'guess',
      },
    });

    expect(decision.steps.map((step) => step.stationId)).toEqual([
      'mechanic',
      'escalate',
    ]);
  });

  it('picks running work, then priority, and holds a child until its parent ships', () => {
    const order = {
      status: 'queued' as const,
      priority: 'low' as const,
      createdAt: '1',
      parentSlug: null,
      parentStatus: null,
    };

    const ranked = rankCandidates([
      { ...order, slug: 'low' },
      { ...order, slug: 'urgent', priority: 'critical' as const },
      { ...order, slug: 'started', status: 'running' as const },
      { ...order, slug: 'child', parentSlug: 'p', parentStatus: 'queued' },
      { ...order, slug: 'blocked', status: 'blocked' as const },
    ]);

    expect(ranked.map((entry) => entry.slug)).toEqual([
      'started',
      'urgent',
      'low',
    ]);
  });
});
