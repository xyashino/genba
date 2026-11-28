import type {
  IncidentReason,
  IncidentResolution,
  OrderPriority,
  OrderStatus,
  StepStatus,
  TriageOwner,
} from '@repo/contracts/enums';
import type { JobOutcome } from '@repo/contracts/jobs.contract';
import type { LineDefinition, StationDefinition } from '@repo/line/line';
import {
  DELIVER_STATION,
  ESCALATE_STATION,
  MECHANIC_STATION,
} from '@repo/line/stations';

const MIN_OPERATOR_ATTEMPTS = 2;
const SIDE_ATTEMPTS = 2;
// External cap: one automatic triage per order, then a human decides.
const MAX_MECHANIC_RUNS = 1;
const PRIORITY_RANK: Record<OrderPriority, number> = {
  critical: 3,
  high: 2,
  medium: 1,
  low: 0,
};
const PARENT_READY: readonly OrderStatus[] = ['delivered', 'merged'];

export type ScheduledStep = {
  stationId: string;
  status: StepStatus;
  attemptsUsed: number;
  maxAttempts: number;
  feedback: string | null;
};

export type StepChange = { stationId: string } & Partial<
  Omit<ScheduledStep, 'stationId'>
>;

export type IncidentDraft = {
  reason: IncidentReason;
  triageOwner: TriageOwner;
  stationId: string;
  summary: string;
};

export type IncidentChange = {
  triageOwner?: TriageOwner;
  diagnosis?: string;
  resolution?: IncidentResolution;
  resolved?: boolean;
  issueUrl?: string | null;
  draftPrUrl?: string | null;
  warning?: string;
};

export type Decision = {
  /** new `mechanic` / `escalate` steps are included here with every field set */
  steps: StepChange[];
  orderStatus?: OrderStatus;
  openIncident?: IncidentDraft;
  incident?: IncidentChange;
  resetWorktree?: boolean;
  delivered?: { prUrl: string | null; prNumber: number | null };
};

export type DecisionInput = {
  line: LineDefinition;
  steps: readonly ScheduledStep[];
  stationId: string;
  outcome: JobOutcome;
  /** station that raised the open incident */
  incidentStationId: string | null;
  mechanicRuns: number;
};

export type Candidate = {
  slug: string;
  status: OrderStatus;
  priority: OrderPriority;
  createdAt: string;
  parentSlug: string | null;
  parentStatus: OrderStatus | null;
};

const maxAttemptsOf = (station: StationDefinition): number => {
  if (station.onFail !== undefined) return station.onFail.max;
  if (station.kind === 'inspection') return 1;
  return MIN_OPERATOR_ATTEMPTS;
};

const freshStep = (stationId: string, maxAttempts: number): ScheduledStep => ({
  stationId,
  status: 'pending',
  attemptsUsed: 0,
  maxAttempts,
  feedback: null,
});

const sequenceOf = (line: LineDefinition): string[] => [
  ...line.stations.map((station) => station.id),
  DELIVER_STATION,
];

const stepOf = (
  steps: readonly ScheduledStep[],
  stationId: string,
): ScheduledStep => {
  const step = steps.find((entry) => entry.stationId === stationId);
  if (step === undefined) throw new Error(`no step for station ${stationId}`);
  return step;
};

const sideStep = (stationId: string): StepChange =>
  freshStep(stationId, SIDE_ATTEMPTS);

const incidentFor = (
  input: DecisionInput,
  reason: IncidentReason,
  summary: string,
): Decision => {
  const toMechanic =
    reason === 'step_retries_exhausted' &&
    input.mechanicRuns < MAX_MECHANIC_RUNS;
  return {
    steps: [
      { stationId: input.stationId, status: 'failed', feedback: summary },
      sideStep(toMechanic ? MECHANIC_STATION : ESCALATE_STATION),
    ],
    orderStatus: 'running',
    openIncident: {
      reason,
      triageOwner: toMechanic ? 'mechanic' : 'supervisor',
      stationId: input.stationId,
      summary,
    },
  };
};

const afterFailure = (input: DecisionInput, feedback: string): Decision => {
  const failed = stepOf(input.steps, input.stationId);
  if (failed.attemptsUsed >= failed.maxAttempts) {
    return incidentFor(input, 'step_retries_exhausted', feedback);
  }
  const station = input.line.stations.find(
    (entry) => entry.id === input.stationId,
  );
  const target = station?.onFail?.retry ?? input.stationId;
  const sequence = sequenceOf(input.line);
  const again = sequence.slice(
    sequence.indexOf(target),
    sequence.indexOf(input.stationId) + 1,
  );
  return {
    steps: again.map((stationId) => ({
      stationId,
      status: 'pending' as const,
      ...(stationId === target ? { feedback } : {}),
    })),
    orderStatus: 'running',
  };
};

const afterStation = (input: DecisionInput): Decision => {
  const { outcome, stationId } = input;
  switch (outcome.kind) {
    case 'passed': {
      const passed: StepChange = {
        stationId,
        status: 'passed',
        feedback: null,
      };
      return stationId === DELIVER_STATION
        ? {
            steps: [passed],
            orderStatus: 'delivered',
            delivered: {
              prUrl: outcome.prUrl ?? null,
              prNumber: outcome.prNumber ?? null,
            },
          }
        : { steps: [passed], orderStatus: 'running' };
    }
    case 'failed':
      return stationId === DELIVER_STATION
        ? incidentFor(input, 'env_error', outcome.feedback)
        : afterFailure(input, outcome.feedback);
    case 'blocked':
      return incidentFor(input, 'operator_blocked', outcome.reason);
    case 'env_error':
      return incidentFor(input, 'env_error', outcome.detail);
    case 'resolved':
    case 'escalated':
      throw new Error(`station ${stationId} cannot report ${outcome.kind}`);
  }
};

const afterEscalation = ({ outcome }: DecisionInput): Decision => {
  const escalated = outcome.kind === 'escalated' ? outcome : null;
  const warning =
    escalated === null
      ? 'escalation did not reach the forge'
      : (escalated.warning ?? undefined);
  return {
    steps: [{ stationId: ESCALATE_STATION, status: 'passed' }],
    orderStatus: 'blocked',
    incident: {
      triageOwner: 'supervisor',
      issueUrl: escalated?.issueUrl ?? null,
      draftPrUrl: escalated?.draftPrUrl ?? null,
      ...(warning === undefined ? {} : { warning }),
    },
  };
};

export const initialSteps = (line: LineDefinition): ScheduledStep[] => [
  ...line.stations.map((station) =>
    freshStep(station.id, maxAttemptsOf(station)),
  ),
  freshStep(DELIVER_STATION, 1),
];

/** The station the order's next job runs, or null when nothing is runnable. */
export const nextStationId = (
  line: LineDefinition,
  steps: readonly ScheduledStep[],
): string | null => {
  if (steps.some((step) => step.status === 'running')) return null;
  const pending = (stationId: string): boolean =>
    steps.some(
      (step) => step.stationId === stationId && step.status === 'pending',
    );
  const side = [ESCALATE_STATION, MECHANIC_STATION].find(pending);
  if (side !== undefined) return side;
  for (const stationId of sequenceOf(line)) {
    const step = stepOf(steps, stationId);
    if (step.status === 'passed' || step.status === 'skipped') continue;
    return step.status === 'pending' ? stationId : null;
  }
  return null;
};

export const applyResolution = (
  line: LineDefinition,
  steps: readonly ScheduledStep[],
  resolution: IncidentResolution,
  stationId: string | null,
  diagnosis: string | null,
): Decision | { error: string } => {
  const sequence = sequenceOf(line);
  const rewind = (from: string, attemptsFor: (id: string) => number) =>
    sequence.slice(sequence.indexOf(from)).map((id) => ({
      stationId: id,
      status: 'pending' as const,
      attemptsUsed: attemptsFor(id),
      feedback: id === from ? diagnosis : null,
    }));
  const closed: IncidentChange = { resolution, resolved: true };
  switch (resolution) {
    case 'cancel':
      return { steps: [], orderStatus: 'cancelled', incident: closed };
    case 'escalate':
      return {
        steps: [sideStep(ESCALATE_STATION)],
        orderStatus: 'running',
        incident: { resolution, triageOwner: 'supervisor' },
      };
    case 'restart_from_scratch':
      return {
        steps: rewind(sequence[0] ?? DELIVER_STATION, () => 0),
        orderStatus: 'queued',
        incident: closed,
        resetWorktree: true,
      };
    case 'retry_step':
    case 'restart_from_step': {
      if (stationId === null || !sequence.includes(stationId)) {
        return { error: `${resolution} needs a station of line ${line.name}` };
      }
      // A retry grants exactly one more attempt, so it grants no more than that.
      const attemptsFor = (id: string): number =>
        resolution === 'retry_step' && id === stationId
          ? Math.max(stepOf(steps, id).maxAttempts - 1, 0)
          : 0;
      return {
        steps: rewind(stationId, attemptsFor),
        orderStatus: 'queued',
        incident: closed,
      };
    }
  }
};

export const decideAfterJob = (input: DecisionInput): Decision => {
  if (input.stationId === ESCALATE_STATION) return afterEscalation(input);
  if (input.stationId !== MECHANIC_STATION) return afterStation(input);
  const { outcome } = input;
  const done: StepChange = { stationId: MECHANIC_STATION, status: 'passed' };
  if (outcome.kind === 'resolved') {
    const applied = applyResolution(
      input.line,
      input.steps,
      outcome.resolution,
      outcome.stationId ?? input.incidentStationId,
      outcome.diagnosis,
    );
    if (!('error' in applied)) {
      return {
        ...applied,
        steps: [done, ...applied.steps],
        incident: { ...applied.incident, diagnosis: outcome.diagnosis },
      };
    }
  }
  return {
    steps: [done, sideStep(ESCALATE_STATION)],
    orderStatus: 'running',
    incident: {
      triageOwner: 'supervisor',
      ...(outcome.kind === 'resolved' ? { diagnosis: outcome.diagnosis } : {}),
    },
  };
};

/** In-progress orders first, then priority, then age; a child waits for its parent. */
export const rankCandidates = <T extends Candidate>(
  candidates: readonly T[],
): T[] =>
  candidates
    .filter(
      (order) =>
        (order.status === 'queued' || order.status === 'running') &&
        (order.parentSlug === null ||
          (order.parentStatus !== null &&
            PARENT_READY.includes(order.parentStatus))),
    )
    .sort(
      (a, b) =>
        Number(b.status === 'running') - Number(a.status === 'running') ||
        PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] ||
        a.createdAt.localeCompare(b.createdAt),
    );
