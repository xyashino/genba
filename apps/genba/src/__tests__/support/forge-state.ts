export const FORGE_STATE_ENV = 'FAKE_FORGE_STATE';

export type FakeItem = {
  number: number;
  url: string;
  state: string;
  title: string;
  body: string;
  branch?: string;
  baseBranch?: string;
  draft?: boolean;
  label?: string;
};

export type FakeForgeState = {
  calls: string[];
  failing: string[];
  authenticated: boolean;
  labels: string[];
  prs: FakeItem[];
  issues: FakeItem[];
};
