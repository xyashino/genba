import { basename, extname, join, resolve } from 'node:path';
import { statSync } from 'node:fs';
import {
  importOrdersContract,
  listOrdersContract,
  orderStepSchema,
  workOrderSchema,
} from '@repo/contracts/orders.contract';
import { getOrderContract, jobSchema } from '@repo/contracts/jobs.contract';
import { z } from 'zod';
import { parseOrderMarkdown } from '@repo/line/order';
import type { ParsedOrder } from '@repo/line/order';
import type { LoopbackApiPort } from '@repo/cell/ports/loopback-api.port';
import type { CliDeps } from '../context.ts';
import { CliError, manifestOf, repoRootOf } from '../context.ts';
import { ensureDaemon, requireDaemon } from '../daemon-link.ts';
import { table } from '../output.ts';

const POLL_MS = 500;
const PAGE = 100;
const SETTLED = ['delivered', 'merged', 'blocked', 'closed', 'cancelled'];

const orderDetailSchema = getOrderContract.out[200].extend({
  order: workOrderSchema,
  steps: z.array(orderStepSchema),
  jobs: z.array(jobSchema.extend({ summary: z.string().nullable() })),
});

const detailOf = async (api: LoopbackApiPort, key: string) =>
  orderDetailSchema.parse(
    await api.request('GET', `/orders/${encodeURIComponent(key)}`),
  );

const filesOf = async (deps: CliDeps, path: string): Promise<string[]> => {
  const full = resolve(deps.cwd, path);
  if (!(await deps.fs.exists(full))) {
    throw new CliError(`no such file or directory: ${path}`);
  }
  if (!statSync(full).isDirectory()) return [full];
  return (await deps.fs.list(full))
    .filter((name) => extname(name) === '.md')
    .map((name) => join(full, name));
};

export const readOrders = async (
  deps: CliDeps,
  paths: readonly string[],
): Promise<ParsedOrder[]> => {
  const manifest = await manifestOf(deps, await repoRootOf(deps));
  const files = (
    await Promise.all(paths.map((path) => filesOf(deps, path)))
  ).flat();
  if (files.length === 0) throw new CliError('no order files found');
  return Promise.all(
    files.map(async (file) => {
      try {
        return parseOrderMarkdown(
          basename(file, extname(file)),
          await deps.fs.readText(file),
          manifest.defaults.line,
        );
      } catch (error) {
        throw new CliError(
          `invalid order ${file}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }),
  );
};

const submit = async (api: LoopbackApiPort, orders: ParsedOrder[]) =>
  importOrdersContract.out[200].parse(
    await api.request('POST', '/orders/import', {
      orders: orders.filter((order) => order.status === 'queued'),
    }),
  );

export const allOrders = async (api: LoopbackApiPort) => {
  const items = [];
  let cursor: string | null = '0';
  while (cursor !== null) {
    const page: z.infer<(typeof listOrdersContract.out)[200]> =
      listOrdersContract.out[200].parse(
        await api.request('GET', `/orders?limit=${PAGE}&cursor=${cursor}`),
      );
    items.push(...page.items);
    cursor = page.nextCursor;
  }
  return items;
};

export const runImport = async (
  deps: CliDeps,
  paths: readonly string[],
): Promise<number> => {
  const orders = await readOrders(deps, paths);
  const { api } = await ensureDaemon(deps);
  const { imported, skipped } = await submit(api, orders);
  const notQueued = orders.filter((order) => order.status !== 'queued').length;
  deps.out(
    `imported ${imported}, already known ${skipped}, not queued ${notQueued}`,
  );
  return 0;
};

export const runQueue = async (
  deps: CliDeps,
  { json }: { json: boolean },
): Promise<number> => {
  const { api, health } = await requireDaemon(deps);
  const orders = await allOrders(api);
  if (json) {
    deps.out(JSON.stringify({ cells: health.cells, orders }, null, 2));
    return 0;
  }
  deps.out(
    `cells ${health.cells.length}/${health.desired}${health.crashLoop ? ' (crash loop: see .genba-local/logs)' : ''}`,
  );
  deps.out(
    orders.length === 0
      ? 'no orders'
      : table(
          ['ORDER', 'STATUS', 'PRIORITY', 'LINE', 'PR'],
          orders.map((order) => [
            order.slug,
            order.status,
            order.priority,
            order.line,
            order.prUrl ?? '',
          ]),
        ),
  );
  return 0;
};

export const runOrder = async (
  deps: CliDeps,
  slug: string,
  { json }: { json: boolean },
): Promise<number> => {
  const { api } = await requireDaemon(deps);
  const detail = await detailOf(api, slug);
  if (json) {
    deps.out(JSON.stringify(detail, null, 2));
    return 0;
  }
  const { order, steps, jobs } = detail;
  deps.out(
    [
      `${order.slug}: ${order.status} (${order.line}, ${order.priority})`,
      ...(order.prUrl === null ? [] : [`PR ${order.prUrl}`]),
      table(
        ['STATION', 'STATUS', 'ATTEMPTS'],
        steps.map((step) => [
          step.stationId,
          step.status,
          `${step.attemptsUsed}/${step.maxAttempts}`,
        ]),
      ),
      ...jobs
        .filter((job) => job.status === 'failed')
        .map(
          (job) => `\n${job.stationId} #${job.attempt}: ${job.summary ?? ''}`,
        ),
    ].join('\n'),
  );
  return 0;
};

export const runCancel = async (
  deps: CliDeps,
  slug: string,
): Promise<number> => {
  const { api } = await requireDaemon(deps);
  await api.request('POST', `/orders/${encodeURIComponent(slug)}/cancel`);
  deps.out(`cancelled ${slug}`);
  return 0;
};

/** Imports one order, makes sure a Cell is up, and follows the order until it settles. */
export const runRun = async (deps: CliDeps, path: string): Promise<number> => {
  const orders = await readOrders(deps, [path]);
  const [order] = orders;
  if (orders.length !== 1 || order === undefined) {
    throw new CliError('`genba run` takes one order file');
  }
  const { api, health } = await ensureDaemon(deps);
  await submit(api, orders);
  if (health.desired === 0) {
    await api.request('POST', '/cells/scale', { count: 1 });
  }
  let printed = 0;
  for (;;) {
    const detail = await detailOf(api, order.slug);
    const finished = detail.jobs.filter((job) => job.finishedAt !== null);
    for (const job of finished.slice(printed)) {
      deps.out(`${job.stationId} #${job.attempt}: ${job.status}`);
    }
    printed = finished.length;
    if (SETTLED.includes(detail.order.status)) {
      deps.out(
        `${order.slug}: ${detail.order.status}${detail.order.prUrl === null ? '' : ` ${detail.order.prUrl}`}`,
      );
      return ['delivered', 'merged'].includes(detail.order.status) ? 0 : 1;
    }
    await new Promise((done) => setTimeout(done, POLL_MS));
  }
};
