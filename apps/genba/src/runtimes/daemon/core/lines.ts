import { parseLine } from '../../../domain/line.ts';
import type { LineDefinition } from '../../../domain/line.ts';
import { isAssetName, linePathOf } from '../../../domain/runtime-paths.ts';
import { DaemonError } from './errors.ts';

const invalid = (message: string): DaemonError =>
  new DaemonError(422, 'invalid_order_graph', message);

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
