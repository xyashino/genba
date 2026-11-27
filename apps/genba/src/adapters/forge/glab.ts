import { z } from 'zod';
import type { ForgePort, PublishPrSpec } from '../../ports/forge.port.ts';
import type { ProcessPort } from '../../ports/process.port.ts';
import {
  ANDON_LABEL,
  andonBodyOf,
  andonMarkerOf,
  createdRefOf,
  parseForgeJson,
  runForgeCli,
} from './cli.ts';

const GLAB = 'glab';
const MR_URL = /https?:\/\/\S+\/-\/merge_requests\/(\d+)/;
// Newer GitLab versions print issues as work items.
const ISSUE_URL = /https?:\/\/\S+\/-\/(?:issues|work_items)\/(\d+)/;
const ISSUES_PER_PAGE = 100;

const refShape = { iid: z.number().int().positive(), web_url: z.url() };
const openMrsSchema = z.array(z.object({ ...refShape, draft: z.boolean() }));
const issuesSchema = z.array(
  z.object({ ...refShape, description: z.string().nullable() }),
);
const mrStateSchema = z.object({
  state: z.enum(['opened', 'locked', 'merged', 'closed']),
});

// `locked` is GitLab's short-lived state while a merge is running.
const MR_STATUS = {
  opened: 'open',
  locked: 'open',
  merged: 'merged',
  closed: 'closed',
} as const;

export const createGlabForge = (
  process: ProcessPort,
  { host }: { host?: string } = {},
): ForgePort => {
  const glab = (args: readonly string[], cwd: string): Promise<string> =>
    runForgeCli(process, GLAB, args, cwd);
  const openMrOf = async ({ cwd, branch }: PublishPrSpec) => {
    const stdout = await glab(
      ['mr', 'list', '--source-branch', branch, '--output', 'json'],
      cwd,
    );
    return parseForgeJson(openMrsSchema, stdout, 'glab mr list')[0];
  };
  const andonIssueOf = async (cwd: string, marker: string) => {
    for (let page = 1; ; page += 1) {
      const stdout = await glab(
        [
          ...['issue', 'list', '--label', ANDON_LABEL.name],
          ...['--output', 'json', '--page', String(page)],
          ...['--per-page', String(ISSUES_PER_PAGE)],
        ],
        cwd,
      );
      const issues = parseForgeJson(issuesSchema, stdout, 'glab issue list');
      const found = issues.find((issue) => issue.description?.includes(marker));
      if (found !== undefined || issues.length < ISSUES_PER_PAGE) return found;
    }
  };
  return {
    publishPr: async (spec) => {
      const { cwd, branch, baseBranch, title, body, draft } = spec;
      const open = await openMrOf(spec);
      if (open === undefined) {
        const stdout = await glab(
          [
            ...['mr', 'create', '--source-branch', branch],
            ...['--target-branch', baseBranch],
            ...['--title', title, '--description', body, '--yes'],
            ...(draft ? ['--draft'] : []),
          ],
          cwd,
        );
        return createdRefOf(stdout, MR_URL, 'glab mr create');
      }
      const draftArgs =
        open.draft === draft ? [] : [draft ? '--draft' : '--ready'];
      await glab(
        [
          ...['mr', 'update', String(open.iid), '--target-branch', baseBranch],
          ...['--title', title, '--description', body, '--yes'],
          ...draftArgs,
        ],
        cwd,
      );
      return { url: open.web_url, number: open.iid };
    },
    upsertAndonIssue: async ({ cwd, orderSlug, title, body }) => {
      const existing = await andonIssueOf(cwd, andonMarkerOf(orderSlug));
      const fullBody = andonBodyOf(orderSlug, body);
      if (existing !== undefined) {
        await glab(
          [
            ...['issue', 'update', String(existing.iid)],
            ...['--title', title, '--description', fullBody],
          ],
          cwd,
        );
        return { url: existing.web_url, number: existing.iid };
      }
      // Fails when the label exists; any other cause resurfaces from `issue create`.
      await process.run(
        GLAB,
        [
          ...['label', 'create', '--name', ANDON_LABEL.name],
          ...['--color', `#${ANDON_LABEL.color}`],
          ...['--description', ANDON_LABEL.description],
        ],
        cwd,
      );
      const created = await glab(
        [
          ...['issue', 'create', '--label', ANDON_LABEL.name],
          ...['--title', title, '--description', fullBody, '--yes'],
        ],
        cwd,
      );
      return createdRefOf(created, ISSUE_URL, 'glab issue create');
    },
    getPrStatus: async (cwd, prNumber) => {
      const stdout = await glab(
        ['mr', 'view', String(prNumber), '--output', 'json'],
        cwd,
      );
      const { state } = parseForgeJson(mrStateSchema, stdout, 'glab mr view');
      return MR_STATUS[state];
    },
    checkAuth: async (cwd) => {
      const args = ['auth', 'status', ...(host ? ['--hostname', host] : [])];
      return (await process.run(GLAB, args, cwd)).exitCode === 0;
    },
  };
};
