import { join } from 'node:path';
import type { JobOutcome } from '@repo/contracts/jobs.contract';
import {
  prTitleOf,
  renderEscalationBody,
  renderPrBody,
} from '@repo/cell/domain/pr-body';
import { checksOfLine, operatorOf } from '@repo/line/line';
import { DECISIONS_DIR } from '@repo/line/runtime-paths';
import { isSideStation } from '@repo/line/stations';
import type { JobContext, Workspace } from './context.ts';
import { readIfPresent, roleOf, stationDirOf } from './context.ts';
import type { StationRun } from './station-operator.ts';
import { ensureWorktree, removeWorktree, replacedBy } from './worktree.ts';

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Reads a delivery source written as `<station>.<output>`. */
const sourceOf = async (
  job: JobContext,
  workspace: Workspace,
  reference: string,
): Promise<string> => {
  const [stationId = '', output = ''] = reference.split('.');
  const station = job.line.stations.find((entry) => entry.id === stationId);
  const file =
    station?.kind === 'operator'
      ? (await roleOf(job, operatorOf(job.line, station).profile)).config
          .outputs[output]?.file
      : undefined;
  if (file === undefined) return '';
  const path = join(stationDirOf(workspace, stationId), file);
  return (await readIfPresent(job.fs, path)) ?? '';
};

const pushBranch = async (
  job: JobContext,
  workspace: Workspace,
): Promise<void> => {
  await job.git.push(
    workspace.path,
    workspace.branch,
    await replacedBy(job, workspace.path),
  );
};

export const runDeliverStation = async (
  job: JobContext,
  workspace: Workspace,
): Promise<StationRun> => {
  const { order, steps } = job.assignment;
  if (
    (await job.git.commitCountSince(workspace.path, workspace.baseSha)) === 0
  ) {
    return {
      outcome: { kind: 'failed', feedback: 'there is no commit to deliver' },
    };
  }
  if (job.line.deliver.requireAdr) {
    const added = await job.git.addedPaths(
      workspace.path,
      workspace.baseSha,
      DECISIONS_DIR,
    );
    if (added.length !== 1) {
      return {
        outcome: {
          kind: 'failed',
          feedback: `requireAdr needs exactly one new ${DECISIONS_DIR}/ entry, found ${added.length}`,
        },
      };
    }
  }
  await job.note('push', workspace.branch);
  await pushBranch(job, workspace);
  let published: { url: string; number: number } | undefined;
  if (job.line.deliver.to === 'new-pr') {
    published = await job.forgeOf(job.manifest).publishPr({
      cwd: workspace.path,
      branch: workspace.branch,
      baseBranch: workspace.baseBranch,
      title: prTitleOf(
        await sourceOf(job, workspace, job.line.deliver.commit),
        order.title,
      ),
      body: renderPrBody({
        slug: order.slug,
        title: order.title,
        objective: order.body,
        report: await sourceOf(job, workspace, job.line.deliver.report),
        checks: checksOfLine(job.line),
        steps: steps.filter(
          (step) =>
            step.attemptsUsed > 0 &&
            !isSideStation(step.stationId) &&
            step.stationId !== job.assignment.job.stationId,
        ),
      }),
      draft: false,
    });
  }
  // The branch is pushed, so a leftover directory must not fail the delivery.
  await removeWorktree(job, workspace).catch(() => undefined);
  return {
    outcome: {
      kind: 'passed',
      prUrl: published?.url,
      prNumber: published?.number,
    },
  };
};

/**
 * Hands a stuck order to a human: WIP draft PR plus `genba:andon` issue.
 * Forge failures never fail the escalation; they come back as a warning.
 */
export const runEscalation = async (job: JobContext): Promise<StationRun> => {
  const { order, incident } = job.assignment;
  const forge = job.forgeOf(job.manifest);
  const warnings: string[] = [];
  const body = renderEscalationBody({
    slug: order.slug,
    reason: incident?.reason ?? 'unknown',
    stationId: incident?.stationId ?? null,
    summary: incident?.summary ?? '',
    diagnosis: incident?.diagnosis ?? null,
  });
  let draftPrUrl: string | null = null;
  try {
    const workspace = await ensureWorktree(job);
    const message = `chore(genba): work in progress on ${order.slug}`;
    if (!(await job.git.isClean(workspace.path))) {
      await job.git.commitAll(workspace.path, message);
    }
    // A pull request needs at least one commit.
    if (
      (await job.git.commitCountSince(workspace.path, workspace.baseSha)) === 0
    ) {
      await job.git.commitAll(workspace.path, message, true);
    }
    await pushBranch(job, workspace);
    draftPrUrl = (
      await forge.publishPr({
        cwd: workspace.path,
        branch: workspace.branch,
        baseBranch: workspace.baseBranch,
        title: `chore(genba): WIP ${order.title}`,
        body,
        draft: true,
      })
    ).url;
  } catch (error) {
    warnings.push(`draft PR failed: ${messageOf(error)}`);
  }
  let issueUrl: string | null = null;
  try {
    issueUrl = (
      await forge.upsertAndonIssue({
        cwd: job.repoRoot,
        orderSlug: order.slug,
        title: `genba andon: ${order.title}`,
        body: draftPrUrl === null ? body : `${body}\n\nDraft PR: ${draftPrUrl}`,
      })
    ).url;
  } catch (error) {
    warnings.push(`andon issue failed: ${messageOf(error)}`);
  }
  const outcome: JobOutcome = {
    kind: 'escalated',
    issueUrl,
    draftPrUrl,
    warning: warnings.length === 0 ? null : warnings.join('; '),
  };
  return { outcome };
};
