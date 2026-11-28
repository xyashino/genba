import { join } from 'node:path';
import { INCIDENT_RESOLUTIONS } from '@repo/contracts/enums';
import type { JobContext, Workspace } from './context.ts';
import { readIfPresent, stationDirOf, tailOf } from './context.ts';
import { runAgent } from './station-operator.ts';
import type { AgentTask, StationRun } from './station-operator.ts';

const STATION_ID = 'mechanic';
const LOG_FILES = ['gate.log', 'step.log'];

const logsOf = async (
  job: JobContext,
  workspace: Workspace,
  stationId: string | null,
): Promise<string> => {
  if (stationId === null) return '';
  const logs = await Promise.all(
    LOG_FILES.map((file) =>
      readIfPresent(job.fs, join(stationDirOf(workspace, stationId), file)),
    ),
  );
  return tailOf(logs.filter(Boolean).join('\n'));
};

const accept: AgentTask['accept'] = (request, outputs) => {
  if (request.verb === 'block') {
    return { kind: 'blocked', reason: request.reason };
  }
  if (request.verb !== 'incident') return null;
  const diagnosis = request.diagnosis ?? Object.values(outputs)[0]?.trim();
  return diagnosis
    ? {
        kind: 'resolved',
        resolution: request.resolution,
        stationId: request.stepId,
        diagnosis,
      }
    : { refusal: 'write the diagnosis output or pass --diagnosis' };
};

/** One automatic triage of a failed order; the daemon applies the chosen resolution. */
export const runMechanicStation = async (
  job: JobContext,
  workspace: Workspace,
): Promise<StationRun> => {
  const agent = job.line.mechanic;
  const { order, incident } = job.assignment;
  const outcome = await runAgent(job, {
    workspace,
    stationId: STATION_ID,
    agent,
    inputs: {
      order: `# ${order.title}\n\n${order.body}`,
      failure: `Station \`${incident?.stationId ?? 'unknown'}\` (${incident?.reason ?? 'unknown'}):\n\n${incident?.summary ?? ''}`,
      logs:
        (await logsOf(job, workspace, incident?.stationId ?? null)) || '_none_',
    },
    stationInputs: [],
    verbs: [
      `incident <${INCIDENT_RESOLUTIONS.join('|')}> [--step <station>]`,
      'block "<reason>"',
    ],
    accept,
  });
  return { outcome, agent };
};
