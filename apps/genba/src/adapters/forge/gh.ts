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

const GH = 'gh';
const PR_URL = /https:\/\/\S+\/pull\/(\d+)/;
const ISSUE_URL = /https:\/\/\S+\/issues\/(\d+)/;
const ISSUE_SCAN_LIMIT = '1000';

const refShape = { number: z.number().int().positive(), url: z.url() };
const openPrsSchema = z.array(z.object({ ...refShape, isDraft: z.boolean() }));
const issuesSchema = z.array(z.object({ ...refShape, body: z.string() }));
const prStateSchema = z.object({
  state: z.enum(['OPEN', 'MERGED', 'CLOSED']),
});

const PR_STATUS = { OPEN: 'open', MERGED: 'merged', CLOSED: 'closed' } as const;

export const createGhForge = (
  process: ProcessPort,
  { host }: { host?: string } = {},
): ForgePort => {
  const gh = (args: readonly string[], cwd: string): Promise<string> =>
    runForgeCli(process, GH, args, cwd);
  // `pr view <branch>` would also match a merged or closed PR, so only open ones are listed.
  const openPrOf = async ({ cwd, branch }: PublishPrSpec) => {
    const stdout = await gh(
      [
        ...['pr', 'list', '--head', branch, '--state', 'open'],
        ...['--json', 'number,url,isDraft', '--limit', '1'],
      ],
      cwd,
    );
    return parseForgeJson(openPrsSchema, stdout, 'gh pr list')[0];
  };
  return {
    publishPr: async (spec) => {
      const { cwd, branch, baseBranch, title, body, draft } = spec;
      const open = await openPrOf(spec);
      if (open === undefined) {
        const stdout = await gh(
          [
            ...['pr', 'create', '--base', baseBranch, '--head', branch],
            ...['--title', title, '--body', body],
            ...(draft ? ['--draft'] : []),
          ],
          cwd,
        );
        return createdRefOf(stdout, PR_URL, 'gh pr create');
      }
      const id = String(open.number);
      await gh(
        [
          ...['pr', 'edit', id, '--base', baseBranch],
          ...['--title', title, '--body', body],
        ],
        cwd,
      );
      if (open.isDraft !== draft) {
        await gh(['pr', 'ready', id, ...(draft ? ['--undo'] : [])], cwd);
      }
      return { url: open.url, number: open.number };
    },
    upsertAndonIssue: async ({ cwd, orderSlug, title, body }) => {
      const stdout = await gh(
        [
          ...['issue', 'list', '--label', ANDON_LABEL.name, '--state', 'open'],
          ...['--json', 'number,url,body', '--limit', ISSUE_SCAN_LIMIT],
        ],
        cwd,
      );
      const marker = andonMarkerOf(orderSlug);
      const existing = parseForgeJson(
        issuesSchema,
        stdout,
        'gh issue list',
      ).find((issue) => issue.body.includes(marker));
      const fullBody = andonBodyOf(orderSlug, body);
      if (existing !== undefined) {
        await gh(
          [
            ...['issue', 'edit', String(existing.number)],
            ...['--title', title, '--body', fullBody],
          ],
          cwd,
        );
        return { url: existing.url, number: existing.number };
      }
      // Fails when the label exists; any other cause resurfaces from `issue create`.
      await process.run(
        GH,
        [
          ...['label', 'create', ANDON_LABEL.name],
          ...['--color', ANDON_LABEL.color],
          ...['--description', ANDON_LABEL.description],
        ],
        cwd,
      );
      const created = await gh(
        [
          ...['issue', 'create', '--label', ANDON_LABEL.name],
          ...['--title', title, '--body', fullBody],
        ],
        cwd,
      );
      return createdRefOf(created, ISSUE_URL, 'gh issue create');
    },
    getPrStatus: async (cwd, prNumber) => {
      const stdout = await gh(
        ['pr', 'view', String(prNumber), '--json', 'state'],
        cwd,
      );
      const { state } = parseForgeJson(prStateSchema, stdout, 'gh pr view');
      return PR_STATUS[state];
    },
    checkAuth: async (cwd) => {
      const args = ['auth', 'status', ...(host ? ['--hostname', host] : [])];
      return (await process.run(GH, args, cwd)).exitCode === 0;
    },
  };
};
