const REMOTE_PREFIX = 'origin/';
const ORDER_PREFIX = 'genba/';

export const orderBranchOf = (slug: string): string => `${ORDER_PREFIX}${slug}`;

/** The origin ref wins: a fetch updates it, never the local branch. */
export const baseRefOf = (baseBranch: string, hasRemoteRef: boolean): string =>
  hasRemoteRef ? `${REMOTE_PREFIX}${baseBranch}` : baseBranch;
