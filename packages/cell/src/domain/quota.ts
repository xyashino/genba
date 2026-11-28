import type { RunnerQuota } from '@repo/contracts/jobs.contract';

export const DEFAULT_MIN_REMAINING_USAGE_PCT = 10;

export type QuotaGateResult =
  | { allowed: true }
  | {
      allowed: false;
      reason: 'insufficient_usage';
      runner: string;
      remainingPct: number;
      minRemainingPct: number;
      resetsAt: string | null;
    };

export const checkRunnerQuota = (
  runner: string,
  quotas: readonly RunnerQuota[],
  minRemainingPct = DEFAULT_MIN_REMAINING_USAGE_PCT,
): QuotaGateResult => {
  const quota = quotas.find((entry) => entry.runner === runner);
  if (quota === undefined || quota.remainingPct >= minRemainingPct) {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason: 'insufficient_usage',
    runner,
    remainingPct: quota.remainingPct,
    minRemainingPct,
    resetsAt: quota.resetsAt,
  };
};
