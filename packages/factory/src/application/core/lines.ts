import { parseLine } from '@repo/line/line';
import type { LineDefinition } from '@repo/line/line';
import { isAssetName, linePathOf } from '@repo/line/runtime-paths';
import { InvalidOrderGraph } from './error-handling.ts';

const invalid = (message: string): InvalidOrderGraph =>
  new InvalidOrderGraph(message);

export const createLineLoader =
  (readRepo: (path: string) => string | undefined) =>
  (name: string): LineDefinition => {
    if (!isAssetName(name)) throw invalid(`invalid line name "${name}"`);
    const source = readRepo(linePathOf(name));
    if (source === undefined) {
      throw invalid(`unknown line "${name}": add ${linePathOf(name)}`);
    }
    try {
      return parseLine(source);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw invalid(`invalid line "${name}": ${reason}`);
    }
  };
