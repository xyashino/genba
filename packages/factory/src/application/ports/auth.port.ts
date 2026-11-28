export type Principal = { kind: 'cli' } | { kind: 'cell'; cellId: string };

export type AuthPort = {
  verify(bearer: string): Principal | null;
};
