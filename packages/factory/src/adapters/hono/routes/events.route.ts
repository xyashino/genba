import { Hono, type Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { authorize } from '../../../application/core/procedure.ts';
import { SSE_KEEPALIVE_MS } from '../../../config.ts';
import type { AppEnv } from '../types.ts';

const untilAborted = (signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal.aborted) resolve();
    else signal.addEventListener('abort', () => resolve(), { once: true });
  });

const streamEvents = (c: Context<AppEnv>): Response => {
  const ctx = authorize('cli', c.get('transport'));
  return streamSSE(c, async (stream) => {
    const closed = new AbortController();
    stream.onAbort(() => closed.abort());
    // A write fails only after the client disconnects; the abort path tears the stream down.
    let writes: Promise<unknown> = Promise.resolve();
    const enqueue = (write: () => Promise<unknown>): void => {
      writes = writes.then(write).catch(() => undefined);
    };
    // Subscribe first: whoever reads `connected` must not miss an event.
    const unsubscribe = ctx.events.subscribe((event) =>
      enqueue(() =>
        stream.writeSSE({ event: event.type, data: JSON.stringify(event) }),
      ),
    );
    enqueue(() => stream.write(': connected\n\n'));
    const keepalive = setInterval(
      () => enqueue(() => stream.write(': beat\n\n')),
      SSE_KEEPALIVE_MS,
    );
    try {
      await untilAborted(AbortSignal.any([ctx.signal, closed.signal]));
    } finally {
      clearInterval(keepalive);
      unsubscribe();
    }
  });
};

export const eventsRoute = new Hono<AppEnv>().get('/', streamEvents);
