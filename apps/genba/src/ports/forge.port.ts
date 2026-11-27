import type { PrOutcome } from '@repo/contracts/enums';

export type PublishPrSpec = {
  cwd: string;
  branch: string;
  baseBranch: string;
  title: string;
  body: string;
  draft: boolean;
};

export type AndonIssueSpec = {
  cwd: string;
  orderSlug: string;
  title: string;
  body: string;
};

export type ForgeRef = {
  url: string;
  number: number;
};

export type ForgePort = {
  publishPr(spec: PublishPrSpec): Promise<ForgeRef>;
  upsertAndonIssue(spec: AndonIssueSpec): Promise<ForgeRef>;
  getPrStatus(cwd: string, prNumber: number): Promise<PrOutcome>;
  checkAuth(cwd: string): Promise<boolean>;
};

export class ForgeError extends Error {}
