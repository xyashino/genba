import { timingSafeEqual } from 'node:crypto';
import {
  resolveIncidentContract,
  listIncidentsContract,
} from '@repo/contracts/incidents.contract';
import {
  claimJobContract,
  completeJobContract,
} from '@repo/contracts/jobs.contract';
import {
  importOrdersContract,
  listOrdersContract,
} from '@repo/contracts/orders.contract';
import { z } from 'zod';
import type { DaemonContext } from './core/context.ts';
import { DaemonError } from './core/errors.ts';
import type { EventBus } from './events.ts';
import { cancelOrder } from './procedures/cancel-order.ts';
import { claimJob } from './procedures/claim-job.ts';
import { completeJob } from './procedures/complete-job.ts';
import { importOrders } from './procedures/import-orders.ts';
import { resolveIncident } from './procedures/resolve-incident.ts';
import type { Supervisor } from './supervisor.ts';

const PREFIX = '/api/v1';
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const HEARTBEAT_MS = 5_000;

const scaleBody = z.object({ count: z.number().int().min(0).max(32) });
const runnerBody = z.object({
  runner: z
    .object({ pid: z.number().int().positive(), command: z.string().min(1) })
    .nullable(),
});

export type ServerDeps = {
  context: DaemonContext;
  supervisor: Supervisor;
  events: EventBus;
  port: number;
  repoRoot: string;
  cliToken: string;
  shutdown: () => void;
};

type Auth = { kind: 'cli' } | { kind: 'cell'; cellId: string };

type Call = {
  request: Request;
  url: URL;
  params: string[];
  auth: Auth;
};

type Route = {
  method: 'GET' | 'POST';
  path: RegExp;
  who: Auth['kind'];
  handle: (call: Call) => Promise<Response> | Response;
};

const ok = (body: object = {}): Response =>
  Response.json({ code: 200, ...body });

const fail = (code: number, type: string, message: string): Response =>
  Response.json({ code, type, message }, { status: code });

const isSame = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

// Rejects browsers: a web page sends `Origin`, and DNS rebinding arrives under a foreign `Host`.
const isLocalRequest = (request: Request, port: number): boolean =>
  request.headers.get('origin') === null &&
  [`127.0.0.1:${port}`, `localhost:${port}`].includes(
    request.headers.get('host') ?? '',
  );

const bodyOf = async <T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.output<T>> => {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw new DaemonError(400, 'invalid', z.prettifyError(parsed.error));
  }
  return parsed.data;
};

const queryOf = <T extends z.ZodType>(url: URL, schema: T): z.output<T> => {
  const parsed = schema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    throw new DaemonError(400, 'invalid', z.prettifyError(parsed.error));
  }
  return parsed.data;
};

const pageOf = <T>(
  all: readonly T[],
  { limit, cursor }: { limit: number; cursor?: string },
): Response => {
  const start = Number(cursor ?? 0) || 0;
  const end = start + limit;
  return ok({
    items: all.slice(start, end),
    nextCursor: end < all.length ? String(end) : null,
  });
};

const eventStream = (events: EventBus): Response => {
  let stop = (): void => undefined;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start: (controller) => {
      const send = (text: string): void =>
        controller.enqueue(encoder.encode(text));
      send(': connected\n\n');
      const unsubscribe = events.subscribe((event) =>
        send(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`),
      );
      const beat = setInterval(() => send(': beat\n\n'), HEARTBEAT_MS);
      stop = () => {
        clearInterval(beat);
        unsubscribe();
      };
    },
    cancel: () => stop(),
  });
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
    },
  });
};

const routesOf = (deps: ServerDeps): Route[] => {
  const { context, supervisor } = deps;
  const { store } = context;
  return [
    {
      method: 'GET',
      path: /^\/health$/,
      who: 'cli',
      handle: () => {
        const { desired, crashLoop, cells } = supervisor.status();
        return ok({
          repoRoot: deps.repoRoot,
          pid: process.pid,
          desired,
          crashLoop,
          cells,
        });
      },
    },
    {
      method: 'POST',
      path: /^\/orders\/import$/,
      who: 'cli',
      handle: async ({ request }) =>
        ok(
          importOrders(
            context,
            await bodyOf(request, importOrdersContract.in.body),
          ),
        ),
    },
    {
      method: 'GET',
      path: /^\/orders$/,
      who: 'cli',
      handle: ({ url }) => {
        const query = queryOf(url, listOrdersContract.in.query);
        return pageOf(
          store
            .listOrders()
            .filter(
              (order) =>
                (query.status === undefined || order.status === query.status) &&
                (query.planId === undefined || order.planId === query.planId),
            ),
          query,
        );
      },
    },
    {
      method: 'GET',
      path: /^\/orders\/([^/]+)$/,
      who: 'cli',
      handle: ({ params: [key = ''] }) => {
        const order = store.findOrder(key);
        if (order === undefined) {
          throw new DaemonError(404, 'not_found', `order ${key} missing`);
        }
        return ok({
          order,
          steps: store.stepsOf(order.id),
          jobs: store.jobsOf(order.id),
        });
      },
    },
    {
      method: 'POST',
      path: /^\/orders\/([^/]+)\/cancel$/,
      who: 'cli',
      handle: async ({ params: [key = ''] }) => {
        const order = store.findOrder(key);
        const job = store
          .activeJobs()
          .find((entry) => entry.orderId === order?.id);
        if (job !== undefined) await supervisor.stopCellOfJob(job.id);
        const cancelled = cancelOrder(context, key);
        void supervisor.reconcile();
        return ok({ order: cancelled });
      },
    },
    {
      method: 'GET',
      path: /^\/incidents$/,
      who: 'cli',
      handle: ({ url }) => {
        const query = queryOf(url, listIncidentsContract.in.query);
        // `z.coerce.boolean` reads any non-empty string as true, so compare the raw value.
        const openOnly = url.searchParams.get('openOnly') === 'true';
        return pageOf(
          store
            .listIncidents()
            .filter(
              (incident) =>
                (!openOnly || incident.resolvedAt === null) &&
                (query.triageOwner === undefined ||
                  incident.triageOwner === query.triageOwner),
            ),
          query,
        );
      },
    },
    {
      method: 'POST',
      path: /^\/incidents\/([^/]+)\/resolve$/,
      who: 'cli',
      handle: async ({ request, params: [id = ''] }) =>
        ok({
          incident: resolveIncident(
            context,
            id,
            await bodyOf(request, resolveIncidentContract.in.body),
          ),
        }),
    },
    {
      method: 'POST',
      path: /^\/cells\/scale$/,
      who: 'cli',
      handle: async ({ request }) => {
        const { count } = await bodyOf(request, scaleBody);
        await supervisor.scale(count);
        return ok(supervisor.status());
      },
    },
    {
      method: 'GET',
      path: /^\/events$/,
      who: 'cli',
      handle: () => eventStream(deps.events),
    },
    {
      method: 'POST',
      path: /^\/shutdown$/,
      who: 'cli',
      handle: async () => {
        await supervisor.stopAll();
        // Reply first, then close.
        setTimeout(deps.shutdown, 50);
        return ok();
      },
    },
    {
      method: 'POST',
      path: /^\/cells\/claims$/,
      who: 'cell',
      handle: async ({ request, auth }) => {
        const { cellId } = await bodyOf(request, claimJobContract.in.body);
        if (auth.kind !== 'cell' || auth.cellId !== cellId) {
          throw new DaemonError(403, 'forbidden', 'token of another Cell');
        }
        return ok({
          assignment: supervisor.isStopping(cellId)
            ? null
            : claimJob(context, cellId),
        });
      },
    },
    {
      method: 'POST',
      path: /^\/cells\/runner$/,
      who: 'cell',
      handle: async ({ request, auth }) => {
        const { runner } = await bodyOf(request, runnerBody);
        if (auth.kind === 'cell') supervisor.setRunner(auth.cellId, runner);
        return ok();
      },
    },
    {
      method: 'POST',
      path: /^\/jobs\/([^/]+)\/complete$/,
      who: 'cell',
      handle: async ({ request, params: [id = ''], auth }) => {
        const body = await bodyOf(request, completeJobContract.in.body);
        if (auth.kind !== 'cell' || auth.cellId !== body.cellId) {
          throw new DaemonError(403, 'forbidden', 'token of another Cell');
        }
        return ok({ job: completeJob(context, id, body) });
      },
    },
  ];
};

export const createDaemonServer = (deps: ServerDeps) => {
  const routes = routesOf(deps);
  const authOf = (request: Request): Auth | null => {
    const token = (request.headers.get('authorization') ?? '').replace(
      /^Bearer /,
      '',
    );
    if (isSame(token, deps.cliToken)) return { kind: 'cli' };
    const cellId = deps.supervisor.cellOfToken(token);
    return cellId === undefined ? null : { kind: 'cell', cellId };
  };
  const serve = async (request: Request): Promise<Response> => {
    if (!isLocalRequest(request, deps.port)) {
      return fail(403, 'forbidden', 'only local clients are served');
    }
    const auth = authOf(request);
    if (auth === null) return fail(401, 'unauthorized', 'bad bearer token');
    const url = new URL(request.url);
    const path = url.pathname.startsWith(PREFIX)
      ? url.pathname.slice(PREFIX.length)
      : '';
    for (const route of routes) {
      const match = route.path.exec(path);
      if (match === null || route.method !== request.method) continue;
      if (route.who !== auth.kind) {
        return fail(403, 'forbidden', `route is for the ${route.who}`);
      }
      return route.handle({
        request,
        url,
        auth,
        params: match.slice(1).map(decodeURIComponent),
      });
    }
    return fail(404, 'not_found', `no route ${request.method} ${url.pathname}`);
  };
  return Bun.serve({
    hostname: '127.0.0.1',
    port: deps.port,
    maxRequestBodySize: MAX_BODY_BYTES,
    // An SSE client stays open far longer than the default idle limit.
    idleTimeout: 0,
    fetch: async (request) => {
      try {
        return await serve(request);
      } catch (error) {
        if (error instanceof DaemonError) {
          return fail(error.code, error.type, error.message);
        }
        console.error(error);
        return fail(500, 'internal', 'the daemon failed to handle the request');
      }
    },
  });
};
