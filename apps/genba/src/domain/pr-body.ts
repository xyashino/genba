const FALLBACK_TYPE = 'chore(genba)';
const NONE = '_none_';

export type PrProof = {
  slug: string;
  title: string;
  objective: string;
  report: string;
  checks: readonly string[];
  steps: readonly { stationId: string; status: string; attemptsUsed: number }[];
};

export type EscalationFacts = {
  slug: string;
  reason: string;
  stationId: string | null;
  summary: string;
  diagnosis: string | null;
};

const bulletsOf = (items: readonly string[]): string =>
  items.length === 0 ? NONE : items.map((item) => `- ${item}`).join('\n');

export const prTitleOf = (commitText: string, orderTitle: string): string => {
  const subject = commitText.trim().split('\n')[0]?.trim() ?? '';
  return subject === '' ? `${FALLBACK_TYPE}: ${orderTitle}` : subject;
};

export const renderPrBody = (proof: PrProof): string =>
  [
    `## Order \`${proof.slug}\``,
    proof.objective.trim() || proof.title,
    '## Report',
    proof.report.trim() || NONE,
    '## Verification',
    proof.checks.length === 0
      ? 'No verify checks are configured: nothing was verified automatically.'
      : `These checks passed:\n\n${bulletsOf(proof.checks.map((check) => `\`${check}\``))}`,
    '## Stations',
    [
      '| Station | Status | Attempts |',
      '| :--- | :--- | :--- |',
      ...proof.steps.map(
        (step) =>
          `| ${step.stationId} | ${step.status} | ${step.attemptsUsed} |`,
      ),
    ].join('\n'),
  ].join('\n\n');

export const renderEscalationBody = (facts: EscalationFacts): string =>
  [
    `## genba stopped on order \`${facts.slug}\``,
    `- Reason: \`${facts.reason}\`\n- Station: \`${facts.stationId ?? 'unknown'}\``,
    '## Failure',
    facts.summary.trim() || NONE,
    '## Diagnosis',
    facts.diagnosis?.trim() || NONE,
  ].join('\n\n');
