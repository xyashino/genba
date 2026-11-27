import {
  claimJobContract,
  completeJobContract,
} from '@repo/contracts/jobs.contract';
import { ApiError } from '../../ports/loopback-api.port.ts';
import type { LoopbackApiPort } from '../../ports/loopback-api.port.ts';
import type { DaemonContext } from '../daemon/core/context.ts';
import { DaemonError } from '../daemon/core/errors.ts';
import { claimJob } from '../daemon/procedures/claim-job.ts';
import { completeJob } from '../daemon/procedures/complete-job.ts';

const COMPLETE = /^\/jobs\/([^/]+)\/complete$/;
const SETTLED: readonly string[] = ['delivered', 'blocked', 'cancelled'];

/**
 * What the Cell loop asks the daemon, answered in this process for one order.
 * `done` is called once the order has nothing left to run.
 */
export const createLocalApi = (
  context: DaemonContext,
  slug: string,
  done: () => void,
): LoopbackApiPort => {
  const settled = (): boolean =>
    SETTLED.includes(context.store.findOrder(slug)!.status);

  const answer = (path: string, body: unknown): unknown => {
    if (path === '/cells/claims') {
      const { cellId } = claimJobContract.in.body.parse(body);
      const assignment = claimJob(context, cellId);
      // One Cell and one order: with no job left, nothing will ever appear.
      if (assignment === null) done();
      return { code: 200, assignment };
    }
    const jobId = COMPLETE.exec(path)?.[1];
    if (jobId === undefined) {
      throw new ApiError(404, 'not_found', `no local route ${path}`);
    }
    const job = completeJob(
      context,
      jobId,
      completeJobContract.in.body.parse(body),
    );
    if (settled()) done();
    return { code: 200, job };
  };

  return {
    request: async (_method, path, body) => {
      try {
        return answer(path, body);
      } catch (error) {
        if (error instanceof DaemonError) {
          throw new ApiError(error.code, error.type, error.message);
        }
        throw error;
      }
    },
    events: async function* () {},
  };
};
