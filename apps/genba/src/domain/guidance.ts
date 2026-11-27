import { join, relative } from 'node:path';
import type { FsPort } from '../ports/fs.port.ts';

/** One listed rule or skill: the first candidate path that holds files wins. */
export type GuidanceEntry = readonly string[];

export type ResolvedGuidance = {
  /** repo-relative files to read, without repeats */
  files: string[];
  /** the candidates of each entry that matched nothing */
  missing: string[];
};

export const resolveGuidance = async (
  fs: Pick<FsPort, 'filesAt'>,
  root: string,
  entries: readonly GuidanceEntry[],
): Promise<ResolvedGuidance> => {
  const files = new Set<string>();
  const missing: string[] = [];
  for (const candidates of entries) {
    let found: string[] = [];
    for (const candidate of candidates) {
      found = await fs.filesAt(join(root, candidate));
      if (found.length > 0) break;
    }
    if (found.length === 0) missing.push(candidates.join(' or '));
    for (const file of found) files.add(relative(root, file));
  }
  return { files: [...files], missing };
};
