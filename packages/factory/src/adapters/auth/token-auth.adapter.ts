import { timingSafeEqual } from 'node:crypto';
import type { AuthPort } from '../../application/ports/auth.port.ts';

const isSame = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

export const createTokenAuth = (
  cliToken: string,
  cellOfToken: (token: string) => string | undefined,
): AuthPort => ({
  verify: (bearer) => {
    if (isSame(bearer, cliToken)) return { kind: 'cli' };
    const cellId = cellOfToken(bearer);
    return cellId === undefined ? null : { kind: 'cell', cellId };
  },
});
