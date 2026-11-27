import { describe, expect, it } from 'vitest';
import { CELL_TOKEN, createTestApp } from '../support/test-app.ts';

const ORDER = {
  slug: 'add-login',
  title: 'Add login',
  body: 'body',
  line: 'standard',
};

const replyOf = async (response: Promise<Response>) => {
  const settled = await response;
  return { status: settled.status, body: (await settled.json()) as unknown };
};

describe('factory server', () => {
  it.each([
    ['a browser', { origin: 'http://127.0.0.1:7072' }],
    ['a rebound host name', { host: 'evil.test:7072' }],
  ])('refuses %s', async (_, headers) => {
    const { call } = createTestApp();

    const reply = await replyOf(call('GET', '/health', { headers }));

    expect(reply).toMatchObject({ status: 403, body: { type: 'forbidden' } });
  });

  it('tells a stranger nothing about which routes exist', async () => {
    const { call } = createTestApp();

    const reply = await replyOf(call('GET', '/nope', { token: 'guess' }));

    expect(reply).toMatchObject({
      status: 401,
      body: { type: 'unauthorized' },
    });
  });

  it('answers an unknown route with not_found', async () => {
    const { call } = createTestApp();

    const reply = await replyOf(call('GET', '/nope'));

    expect(reply).toMatchObject({ status: 404, body: { type: 'not_found' } });
  });

  it.each([
    ['a Cell from a human route', 'GET', '/orders', CELL_TOKEN],
    ['the CLI from a Cell route', 'POST', '/cells/claims', undefined],
  ] as const)('keeps %s', async (_, method, path, token) => {
    const { call } = createTestApp();

    const reply = await replyOf(
      call(method, path, {
        token,
        body: method === 'POST' ? { cellId: 'cell-1' } : undefined,
      }),
    );

    expect(reply.status).toBe(403);
  });

  it('keeps a Cell from claiming under another name', async () => {
    const { call } = createTestApp();

    const reply = await replyOf(
      call('POST', '/cells/claims', {
        token: CELL_TOKEN,
        body: { cellId: 'cell-2' },
      }),
    );

    expect(reply.status).toBe(403);
  });

  it('names the field of an invalid request', async () => {
    const { call } = createTestApp();

    const reply = await replyOf(
      call('POST', '/cells/scale', { body: { count: -1 } }),
    );

    expect(reply).toMatchObject({
      status: 400,
      body: { type: 'invalid', message: expect.stringContaining('count') },
    });
  });

  it('takes an order from import to a claimed job', async () => {
    const { call } = createTestApp();
    await call('POST', '/orders/import', { body: { orders: [ORDER] } });

    const claim = await replyOf(
      call('POST', '/cells/claims', {
        token: CELL_TOKEN,
        body: { cellId: 'cell-1' },
      }),
    );
    const detail = await replyOf(call('GET', '/orders/add-login'));

    expect(claim.body).toMatchObject({
      assignment: { job: { stationId: 'build' } },
    });
    expect(detail.body).toMatchObject({
      order: { status: 'running' },
      jobs: [{ cellId: 'cell-1' }],
    });
  });

  it('cancels a queued order once', async () => {
    const { call } = createTestApp();
    await call('POST', '/orders/import', { body: { orders: [ORDER] } });

    const first = await replyOf(call('POST', '/orders/add-login/cancel'));
    const second = await replyOf(call('POST', '/orders/add-login/cancel'));

    expect(first.body).toMatchObject({ order: { status: 'cancelled' } });
    expect(second).toMatchObject({
      status: 409,
      body: { type: 'invalid_state' },
    });
  });

  it('lists incidents when openOnly is false', async () => {
    const { call } = createTestApp();

    const reply = await replyOf(call('GET', '/incidents?openOnly=false'));

    expect(reply.body).toEqual({ code: 200, items: [], nextCursor: null });
  });

  it('streams events as they happen', async () => {
    const { call } = createTestApp();
    const stop = new AbortController();
    const stream = await call('GET', '/events', { signal: stop.signal });
    const reader = stream.body!.getReader();
    const next = async () =>
      new TextDecoder().decode((await reader.read()).value);
    const greeting = await next();

    await call('POST', '/orders/import', { body: { orders: [ORDER] } });
    const event = await next();
    stop.abort();

    expect(greeting).toBe(': connected\n\n');
    expect(event).toMatch(/^event: order\ndata: \{.*"add-login".*\}\n\n$/);
  });
});
