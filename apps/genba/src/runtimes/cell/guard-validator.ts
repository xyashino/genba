import { join } from 'node:path';
import { validateRoleGuards } from '../../domain/role.ts';
import type { RoleDefinition, RoleGuardSnapshot } from '../../domain/role.ts';
import type { JobContext, Workspace } from './context.ts';
import { readIfPresent } from './context.ts';

export type GuardTarget = {
  role: RoleDefinition;
  workspace: Workspace;
  stationDir: string;
  permission: 'read' | 'write';
  /** HEAD when the station started: changes are measured from here */
  startSha: string;
};

export const readOutputs = async (
  job: JobContext,
  { role, stationDir }: GuardTarget,
): Promise<RoleGuardSnapshot['outputs']> =>
  Object.fromEntries(
    await Promise.all(
      Object.values(role.config.outputs).map(async ({ file }) => [
        file,
        await readIfPresent(job.fs, join(stationDir, file)),
      ]),
    ),
  );

/** Live ROLE.md guards, checked against the worktree as it is now. */
export const guardViolations = async (
  job: JobContext,
  target: GuardTarget,
): Promise<string[]> => {
  const { workspace, startSha, role } = target;
  const branch = await job.git.currentBranch(workspace.path);
  const violations = validateRoleGuards(
    role,
    {
      changedPaths: await job.git.changedPaths(workspace.path, startSha),
      outputs: await readOutputs(job, target),
    },
    target.permission,
  );
  return branch === workspace.branch
    ? violations
    : [
        `the worktree must stay on branch ${workspace.branch}, found ${branch}`,
        ...violations,
      ];
};

/** Puts a read-only station's worktree back, whatever the agent did to it. */
export const restoreWorktree = async (
  job: JobContext,
  { workspace, startSha }: GuardTarget,
): Promise<void> => {
  await job.git.resetHard(workspace.path, startSha);
  await job.git.discardChanges(workspace.path);
};
