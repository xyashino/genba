import type { OperatorRequest } from '@repo/contracts/operator.contract';

export type OperatorResponse = { code: number } & Record<string, unknown>;

export type OperatorHandler = (
  request: OperatorRequest,
) => Promise<OperatorResponse>;

export type OperatorSession = {
  url: string;
  token: string;
  /** variables the runner process needs to reach this session */
  env: Readonly<Record<string, string>>;
};

export type OperatorEndpointPort = {
  /** Replaces any open session: one job, one URL, one token. */
  open(handler: OperatorHandler): Promise<OperatorSession>;
  close(): Promise<void>;
};
