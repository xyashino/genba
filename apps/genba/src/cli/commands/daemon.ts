import { z } from 'zod';
import type { CliDeps } from '../context.ts';
import { CliError, manifestOf, repoRootOf } from '../context.ts';
import { ensureDaemon, findDaemon, requireDaemon } from '../daemon-link.ts';

const STOP_TIMEOUT_MS = 10_000;
const POLL_MS = 100;
const MAX_CELLS = 32;

const eventSchema = z.object({
  type: z.string(),
  at: z.string(),
  order: z.string().optional(),
  station: z.string().optional(),
  status: z.string().optional(),
  detail: z.string().optional(),
});

const countOf = (value: string): number => {
  const count = Number(value);
  if (!/^\d+$/.test(value) || count > MAX_CELLS) {
    throw new CliError(`cell count must be 0-${MAX_CELLS}, found "${value}"`);
  }
  return count;
};

export const runStart = async (
  deps: CliDeps,
  requested: string | undefined,
): Promise<number> => {
  const manifest = await manifestOf(deps, await repoRootOf(deps));
  const count =
    requested === undefined ? manifest.defaults.cells : countOf(requested);
  const { api } = await ensureDaemon(deps);
  await api.request('POST', '/cells/scale', { count });
  deps.out(
    `genba is running with ${count} cell(s) on port ${deps.port}; follow it with \`genba watch\``,
  );
  return 0;
};

export const runScale = async (
  deps: CliDeps,
  requested: string,
): Promise<number> => {
  const count = countOf(requested);
  const { api } = await requireDaemon(deps);
  await api.request('POST', '/cells/scale', { count });
  deps.out(`scaled to ${count} cell(s)`);
  return 0;
};

export const runStop = async (deps: CliDeps): Promise<number> => {
  const link = await findDaemon(deps);
  if (link === null) {
    deps.out('no genba daemon is running');
    return 0;
  }
  await link.api.request('POST', '/shutdown');
  const deadline = Date.now() + STOP_TIMEOUT_MS;
  while (deps.process.isAlive(link.health.pid)) {
    if (Date.now() > deadline) {
      throw new CliError(`daemon ${link.health.pid} did not exit`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  deps.out('genba stopped');
  return 0;
};

export const runWatch = async (
  deps: CliDeps,
  { json }: { json: boolean },
): Promise<number> => {
  const { api } = await requireDaemon(deps);
  const stop = new AbortController();
  process.once('SIGINT', () => stop.abort());
  for await (const data of api.events(stop.signal)) {
    const event = eventSchema.parse(data);
    deps.out(
      json
        ? JSON.stringify(event)
        : [
            event.at.slice(11, 19),
            event.type,
            event.order,
            event.station,
            event.status,
            event.detail?.split('\n')[0],
          ]
            .filter(Boolean)
            .join(' '),
    );
  }
  return 0;
};
