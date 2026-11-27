const REMOTE_PREFIX = 'origin/';

export const baseRefOf = (baseBranch: string, hasLocalRef: boolean): string =>
  hasLocalRef ? baseBranch : `${REMOTE_PREFIX}${baseBranch}`;
