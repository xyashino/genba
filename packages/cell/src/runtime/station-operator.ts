import { join, relative } from 'node:path';
import type { JobOutcome } from '@repo/contracts/jobs.contract';
import type { OperatorRequest } from '@repo/contracts/operator.contract';
import { checksOfLine, operatorOf } from '@repo/line/line';
import type { AgentDefinition, OperatorStation } from '@repo/line/line';
import { resolveGuidance, skillIndexOf } from '../domain/guidance.ts';
import { guidanceOf, renderRole } from '../domain/role.ts';
import { logsCommandOf, workspaceLabelOf } from '@repo/line/cells';
import { DECISIONS_DIR } from '@repo/line/runtime-paths';
import type { OperatorResponse } from '../ports/operator.port.ts';
import type { JobContext, ProcessEnd, Workspace } from './context.ts';
import {
  readIfPresent,
  roleOf,
  runTracked,
  stationDirOf,
  tailOf,
} from './context.ts';
import {
  guardViolations,
  readOutputs,
  restoreWorktree,
} from './guard-validator.ts';
import type { GuardTarget } from './guard-validator.ts';
import { operatorCommandOf, orNone, promptFooter } from './prompt.ts';
import type { StationInput } from './prompt.ts';

const RULE_FILES: readonly string[] = [
  'AGENTS.md',
  'CLAUDE.md',
  'CONTRIBUTING.md',
  '.cursorrules',
  '.github/copilot-instructions.md',
];
const PROMPT_FILE = 'prompt.md';
const LOG_FILE = 'step.log';

// After an accepted report the agent gets this long to exit before it is stopped.
const EXIT_GRACE_MS = 10_000;
const SPAWN_FAILED_EXIT = 127;
const GATE_OUTPUT = 'gate';
const GATE_FILE = 'gate.log';
const CHECKPOINT_PREFIX = 'chore(genba):';
const JUDGE_PROFILE = 'doctor';

export type StationRun = {
  outcome: JobOutcome;
  agent?: AgentDefinition;
};

export type AgentTask = {
  workspace: Workspace;
  stationId: string;
  /** runner, model, permission and timeout; `profile` names the role */
  agent: AgentDefinition;
  /** values for the ROLE.md inputs, without `operatorCommand` */
  inputs: Record<string, string>;
  stationInputs: readonly StationInput[];
  /** report verbs this role may use */
  verbs: readonly string[];
  /** turns an accepted report verb into the job outcome, or refuses it */
  accept: (
    request: OperatorRequest,
    outputs: Readonly<Record<string, string | undefined>>,
  ) => JobOutcome | { refusal: string } | null;
};

const adrNoteOf = (job: JobContext, permission: 'read' | 'write'): string =>
  job.line.deliver.requireAdr && permission === 'write'
    ? `\n\n## Decision Record\n\nDelivery needs exactly one new file in \`${DECISIONS_DIR}/\` for the whole order. Add it, or update the one an earlier attempt added.`
    : '';

const refused = (message: string): OperatorResponse => ({
  code: 409,
  type: 'invalid_state',
  message,
});

const guardFailed = (violations: string[]): OperatorResponse => ({
  code: 422,
  type: 'guard_failed',
  message: 'fix these and report again',
  violations,
});

const endDetailOf = (end: ProcessEnd, log: string): JobOutcome => {
  if (end.kind === 'exited' && end.exitCode === SPAWN_FAILED_EXIT) {
    return { kind: 'env_error', detail: `the runner did not start\n${log}` };
  }
  const cause =
    end.kind === 'timeout'
      ? 'the station timed out'
      : `the runner exited with code ${end.kind === 'exited' ? end.exitCode : 0}`;
  return {
    kind: 'failed',
    feedback: `${cause} before an accepted \`genba operator\` report\n${tailOf(log)}`,
  };
};

const stationInputsOf = async (
  job: JobContext,
  workspace: Workspace,
  station: OperatorStation,
): Promise<StationInput[]> =>
  Promise.all(
    station.inputs.map(async (name) => {
      const [stationId = '', output = ''] = name.split('.');
      const source = job.line.stations.find((entry) => entry.id === stationId);
      const file =
        source?.kind === 'operator'
          ? (await roleOf(job, operatorOf(job.line, source).profile)).config
              .outputs[output]?.file
          : output === GATE_OUTPUT
            ? GATE_FILE
            : undefined;
      const content =
        file === undefined
          ? undefined
          : await readIfPresent(
              job.fs,
              join(stationDirOf(workspace, stationId), file),
            );
      return { name, content: tailOf(content ?? '') };
    }),
  );

const presentIn = async (
  job: JobContext,
  workspace: Workspace,
  paths: readonly string[],
): Promise<string[]> => {
  const found = await Promise.all(
    paths.map(async (path) =>
      (await job.fs.exists(join(workspace.path, path))) ? path : null,
    ),
  );
  return found.filter((path) => path !== null);
};

const readAll = async (
  job: JobContext,
  workspace: Workspace,
  paths: readonly string[],
): Promise<string> => {
  const found = await Promise.all(
    paths.map(async (path) => {
      const text = await readIfPresent(job.fs, join(workspace.path, path));
      return text === undefined ? '' : `### ${path}\n\n${text.trim()}`;
    }),
  );
  return found.filter(Boolean).join('\n\n');
};

const roleInputsOf = async (
  job: JobContext,
  workspace: Workspace,
  roleName: string,
): Promise<Record<string, string>> => {
  const { order, feedback } = job.assignment;
  const role = await roleOf(job, roleName);
  const gate = job.line.stations.find((entry) => entry.kind === 'inspection');
  const values: Record<string, () => Promise<string>> = {
    order: async () => `# ${order.title}\n\n${order.body}`,
    checks: async () =>
      checksOfLine(job.line)
        .map((check) => `- \`${check}\``)
        .join('\n'),
    feedback: async () => feedback ?? '',
    lessons: () => readAll(job, workspace, [`.genba/lessons/${roleName}.md`]),
    diff: () => job.git.diffSince(workspace.path, workspace.baseSha),
    gateOutput: async () =>
      gate === undefined
        ? ''
        : tailOf(
            (await readIfPresent(
              job.fs,
              join(stationDirOf(workspace, gate.id), GATE_FILE),
            )) ?? '',
          ),
  };
  return Object.fromEntries(
    await Promise.all(
      Object.keys(role.prompt.input)
        .filter((name) => name !== 'operatorCommand')
        .map(async (name) => [name, orNone(await values[name]?.())]),
    ),
  );
};

const buildAccept =
  (isJudge: boolean): AgentTask['accept'] =>
  (request, outputs) => {
    if (request.verb === 'block') {
      return { kind: 'blocked', reason: request.reason };
    }
    if (!isJudge) {
      return request.verb === 'done'
        ? { kind: 'passed', summary: request.summary }
        : null;
    }
    if (request.verb !== 'verdict') return null;
    if (request.verdict === 'pass') return { kind: 'passed' };
    const feedback = request.feedback ?? Object.values(outputs)[0]?.trim();
    return feedback
      ? { kind: 'failed', feedback }
      : { refusal: 'write the audit output or pass --feedback' };
  };

// The Line's checkpoint: each passed write station becomes a commit.
const checkpoint = async (
  job: JobContext,
  workspace: Workspace,
  roleName: string,
  stationDir: string,
): Promise<void> => {
  if (await job.git.isClean(workspace.path)) return;
  const commit = (await roleOf(job, roleName)).config.outputs['commit'];
  const message =
    commit === undefined
      ? undefined
      : await readIfPresent(job.fs, join(stationDir, commit.file));
  await job.git.commitAll(
    workspace.path,
    message?.trim() || `${CHECKPOINT_PREFIX} ${job.assignment.order.slug}`,
  );
};

/** Starts one agent with its own operator endpoint and holds it to the role's guards. */
export const runAgent = async (
  job: JobContext,
  task: AgentTask,
): Promise<JobOutcome> => {
  const { workspace, stationId, agent } = task;
  const { profile, permission } = agent;
  const role = await roleOf(job, profile);
  if (!(await job.catalog.isInstalled(agent.runner))) {
    return {
      kind: 'env_error',
      detail: `runner "${agent.runner}" is not installed`,
    };
  }
  if (permission === 'read' && !job.catalog.restrictsReadMode(agent.runner)) {
    return {
      kind: 'env_error',
      detail: `runner "${agent.runner}" cannot be restricted to read mode, so it cannot run role "${profile}"`,
    };
  }
  if (
    permission === 'write' &&
    !(await job.git.hasAuthorIdentity(workspace.path))
  ) {
    return {
      kind: 'env_error',
      detail:
        'git author identity is not configured (run git config --global user.name and user.email)',
    };
  }
  // Checked in the worktree, after `changeover.worktree` had its chance to generate them.
  const listed = guidanceOf(role, job.manifest);
  const rules = await resolveGuidance(job.fs, workspace.path, listed.rules);
  const skills = await resolveGuidance(job.fs, workspace.path, listed.skills);
  const missing = [...rules.missing, ...skills.missing];
  if (missing.length > 0) {
    return {
      kind: 'env_error',
      detail: `role "${profile}" requires missing files: ${missing.join(', ')}`,
    };
  }
  const guidance = {
    rules: rules.files,
    skills: await skillIndexOf(job.fs, workspace.path, skills.files),
    fallback: await presentIn(job, workspace, RULE_FILES),
  };
  const stationDir = stationDirOf(workspace, stationId);
  // An output left by an earlier attempt must not satisfy this one.
  for (const { file } of Object.values(role.config.outputs)) {
    await job.fs.remove(join(stationDir, file));
  }
  const operatorCommand = operatorCommandOf(job.selfCommand);
  const prompt = `${renderRole(role, {
    ...task.inputs,
    operatorCommand,
  })}\n\n${promptFooter(
    {
      guidance,
      role,
      workspace,
      stationDir,
      operatorCommand,
      inputs: task.stationInputs,
    },
    task.verbs,
  )}${adrNoteOf(job, permission)}\n`;
  const promptPath = join(stationDir, PROMPT_FILE);
  await job.fs.writeText(promptPath, prompt);
  const target: GuardTarget = {
    role,
    workspace,
    stationDir,
    permission,
    startSha: await job.git.headSha(workspace.path),
  };
  const reported = Promise.withResolvers<JobOutcome>();
  let accepted: JobOutcome | undefined;

  const handle = async (
    request: OperatorRequest,
  ): Promise<OperatorResponse> => {
    if (request.verb === 'context') return { code: 200, prompt };
    if (request.verb === 'read') {
      return { code: 200, outputs: await readOutputs(job, target) };
    }
    if (accepted !== undefined) return refused('a report was already accepted');
    const outcome = task.accept(request, await readOutputs(job, target));
    if (outcome === null) {
      return refused(`role "${profile}" cannot use "${request.verb}"`);
    }
    if ('refusal' in outcome) return guardFailed([outcome.refusal]);
    // A blocked agent may be unable to satisfy any guard.
    if (outcome.kind !== 'blocked') {
      const violations = await guardViolations(job, target);
      if (violations.length > 0) return guardFailed(violations);
    }
    accepted = outcome;
    setTimeout(() => reported.resolve(outcome), EXIT_GRACE_MS).unref();
    return { code: 200, accepted: true };
  };

  const session = await job.operator.open(handle);
  const logPath = join(stationDir, LOG_FILE);
  // Each attempt is archived on its own, so its log starts empty.
  await job.fs.remove(logPath);
  await job.note(
    'agent start',
    `${agent.runner} ${agent.model ?? 'default'} ${permission}`,
  );
  let end: ProcessEnd;
  try {
    const line = job.catalog.commandLine(
      agent.runner,
      relative(workspace.path, promptPath),
      { model: agent.model, permission, headless: !job.manifest.herdr },
    )!;
    end = await runTracked(
      job,
      {
        ...line,
        cwd: workspace.path,
        env: session.env,
        logPath,
        ...(job.manifest.herdr
          ? {
              pane: {
                workspace: workspaceLabelOf(
                  job.manifest.project,
                  job.repoRoot,
                  job.cellId,
                ),
                tab: `${job.assignment.order.slug}:${stationId}`,
                logsCommand: logsCommandOf(job.selfCommand, job.cellId),
              },
            }
          : {}),
      },
      agent.timeoutMs,
      reported.promise,
    );
  } finally {
    await job.operator.close();
  }
  await job.note(
    'agent end',
    end.kind === 'exited' ? `exit ${end.exitCode}` : end.kind,
  );
  const log = (await readIfPresent(job.fs, logPath)) ?? '';
  let outcome = accepted ?? endDetailOf(end, log);
  // The agent kept running after its report, so check again now that it is gone.
  if (accepted !== undefined && accepted.kind !== 'blocked') {
    const violations = await guardViolations(job, target);
    if (violations.length > 0) {
      outcome = {
        kind: 'failed',
        feedback: `the worktree broke the role guards after the report\n${violations.join('\n')}`,
      };
    }
  }
  if (permission === 'read') await restoreWorktree(job, target);
  return outcome;
};

export const runOperatorStation = async (
  job: JobContext,
  workspace: Workspace,
  station: OperatorStation,
): Promise<StationRun> => {
  const agent = operatorOf(job.line, station);
  const isJudge = agent.profile === JUDGE_PROFILE;
  const outcome = await runAgent(job, {
    workspace,
    stationId: station.id,
    agent,
    inputs: await roleInputsOf(job, workspace, agent.profile),
    stationInputs: await stationInputsOf(job, workspace, station),
    verbs: isJudge
      ? [
          'verdict pass',
          'verdict fail --feedback "<what to fix>"',
          'block "<reason>"',
        ]
      : ['done', 'block "<reason>"'],
    accept: buildAccept(isJudge),
  });
  if (outcome.kind === 'passed' && agent.permission === 'write') {
    await checkpoint(
      job,
      workspace,
      agent.profile,
      stationDirOf(workspace, station.id),
    );
  }
  return { outcome, agent };
};
