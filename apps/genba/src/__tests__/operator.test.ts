import { afterEach, describe, expect, it } from 'vitest';
import { createOperatorClient } from '../operator/client.ts';
import { errorLineFor, exitCodeFor } from '../operator/exit-map.ts';
import { createLoopbackEndpoint } from '@repo/cell/adapters/operator-endpoint/loopback';
import { EXIT } from '../domain/exit-codes.ts';
import { OperatorUnreachableError } from '@repo/cell/ports/operator.port';
import type { OperatorHandler } from '@repo/cell/ports/operator.port';

const accept: OperatorHandler = async () => ({ code: 200, accepted: true });

describe('operator loopback', () => {
  const endpoint = createLoopbackEndpoint();

  afterEach(() => endpoint.close());

  it('hands the runner its URL and cycle token', async () => {
    const session = await endpoint.open(accept);

    expect(session.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect(session.env).toEqual({
      GENBA_OPERATOR_URL: session.url,
      GENBA_CYCLE_TOKEN: session.token,
    });
  });

  it('delivers a verb to the Cell and returns its reply', async () => {
    const seen: unknown[] = [];
    const session = await endpoint.open(async (request) => {
      seen.push(request);
      return { code: 200, accepted: true };
    });

    const reply = await createOperatorClient(session).send({
      verb: 'verdict',
      verdict: 'fail',
      feedback: 'tests missing',
    });

    expect(reply).toEqual({
      status: 200,
      body: { code: 200, accepted: true },
    });
    expect(seen).toEqual([
      { verb: 'verdict', verdict: 'fail', feedback: 'tests missing' },
    ]);
  });

  it('shows every guard violation and exits as refused', async () => {
    const session = await endpoint.open(async () => ({
      code: 422,
      type: 'guard_failed',
      violations: ['missing report.md', 'diff is empty'],
    }));

    const reply = await createOperatorClient(session).send({ verb: 'done' });

    expect(exitCodeFor(reply.status)).toBe(EXIT.refused);
    expect(errorLineFor(reply)).toBe(
      '422 guard_failed\n- missing report.md\n- diff is empty',
    );
  });

  it('rejects a wrong token before the Cell sees the verb', async () => {
    let handled = false;
    const session = await endpoint.open(async () => {
      handled = true;
      return { code: 200 };
    });

    const reply = await createOperatorClient({
      url: session.url,
      token: 'wrong',
    }).send({ verb: 'done' });

    expect(reply.status).toBe(401);
    expect(handled).toBe(false);
  });

  it.each([
    ['text that is not JSON', 'nope'],
    ['an unknown verb', '{"verb":"deploy"}'],
    ['a verb missing its fields', '{"verb":"block"}'],
  ])('rejects %s', async (_label, body) => {
    const session = await endpoint.open(accept);

    const response = await fetch(session.url, {
      method: 'POST',
      headers: { authorization: `Bearer ${session.token}` },
      body,
    });

    expect(response.status).toBe(400);
  });

  it('hides Cell failures behind a 500', async () => {
    const session = await endpoint.open(async () => {
      throw new Error('internal detail');
    });

    const reply = await createOperatorClient(session).send({ verb: 'read' });

    expect(reply.status).toBe(500);
    expect(JSON.stringify(reply.body)).not.toContain('internal detail');
  });

  it('retires the old token when the next job opens', async () => {
    const first = await endpoint.open(accept);

    const second = await endpoint.open(accept);
    const stale = await createOperatorClient({
      url: second.url,
      token: first.token,
    }).send({ verb: 'context' });

    expect(second.token).not.toBe(first.token);
    expect(stale.status).toBe(401);
  });

  it('is unreachable once the job closes', async () => {
    const session = await endpoint.open(accept);
    await endpoint.close();

    const attempt = createOperatorClient(session).send({ verb: 'done' });

    await expect(attempt).rejects.toThrow(OperatorUnreachableError);
  });
});
