const REMOTE_PREFIX = 'origin/';
const ORDER_PREFIX = 'genba/';

export const orderBranchOf = (slug: string): string => `${ORDER_PREFIX}${slug}`;

export const baseRefOf = (baseBranch: string, hasLocalRef: boolean): string =>
  hasLocalRef ? baseBranch : `${REMOTE_PREFIX}${baseBranch}`;
