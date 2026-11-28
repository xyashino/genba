import { claimJobContract } from '@repo/contracts/jobs.contract';
import type { LoopbackApiPort } from '@repo/cell/ports/loopback-api.port';

const COMPLETE = /^\/jobs\/[^/]+\/complete$/;
const SETTLED: readonly string[] = ['delivered', 'blocked', 'cancelled'];

/** Calls `done` once the one order has nothing left to run. */
export const untilSettled = (
  api: LoopbackApiPort,
  statusOf: () => string,
  done: () => void,
): LoopbackApiPort => ({
  events: api.events,
  request: async (method, path, body) => {
    const reply = await api.request(method, path, body);
    // One Cell and one order: with no job left, nothing will ever appear.
    const idle =
      path === '/cells/claims' &&
      claimJobContract.out[200].parse(reply).assignment === null;
    if (idle || (COMPLETE.test(path) && SETTLED.includes(statusOf()))) done();
    return reply;
  },
});
