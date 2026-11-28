import { describe, expect, it } from 'vitest';
import { checkRunnerQuota } from '../domain/quota.ts';

describe('Cell runner usage quota gate', () => {
  it('allows execution when remaining usage meets threshold or is unknown', () => {
    expect(
      checkRunnerQuota('claude', [
        { runner: 'claude', remainingPct: 25, resetsAt: null },
      ]),
    ).toEqual({ allowed: true });

    expect(checkRunnerQuota('codex', [])).toEqual({ allowed: true });
  });

  it('blocks order execution when a cell runner is below remaining usage threshold', () => {
    const result = checkRunnerQuota(
      'claude',
      [
        {
          runner: 'claude',
          remainingPct: 4,
          resetsAt: '2026-11-27T18:00:00Z',
        },
      ],
      10,
    );

    expect(result).toEqual({
      allowed: false,
      reason: 'insufficient_usage',
      runner: 'claude',
      remainingPct: 4,
      minRemainingPct: 10,
      resetsAt: '2026-11-27T18:00:00Z',
    });
  });
});
