import { join, relative } from 'node:path';
import type { FsPort } from '../ports/fs.port.ts';

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;
const NAME_FIELD = /^name:\s*(.+)$/m;
const DESC_FIELD = /^description:\s*(.+)$/m;

/** One listed rule or skill: exact candidates (must exist) or a glob under a base dir (optional). */
export type GuidanceEntry =
  | { kind: 'exact'; candidates: readonly string[] }
  | { kind: 'glob'; baseDir: string; pattern: string };

export type ResolvedGuidance = {
  /** repo-relative files to read, without repeats */
  files: string[];
  /** the candidates of each exact entry that matched nothing */
  missing: string[];
};

export type SkillSummary = {
  path: string;
  name?: string;
  description?: string;
};

const unquote = (value: string): string => {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
};

const parseSkillSummary = (path: string, markdown: string): SkillSummary => {
  const block = FRONTMATTER.exec(markdown)?.[1];
  if (block === undefined) return { path };
  const name = NAME_FIELD.exec(block)?.[1];
  const description = DESC_FIELD.exec(block)?.[1];
  return {
    path,
    ...(name ? { name: unquote(name) } : {}),
    ...(description ? { description: unquote(description) } : {}),
  };
};

export const guidanceKeyOf = (entry: GuidanceEntry): string =>
  entry.kind === 'exact'
    ? `exact:${entry.candidates.join('|')}`
    : `glob:${entry.baseDir}:${entry.pattern}`;

export const resolveGuidance = async (
  fs: Pick<FsPort, 'filesAt'>,
  root: string,
  entries: readonly GuidanceEntry[],
): Promise<ResolvedGuidance> => {
  const files = new Set<string>();
  const missing: string[] = [];
  for (const entry of entries) {
    if (entry.kind === 'glob') {
      const base = join(root, entry.baseDir);
      const all = await fs.filesAt(base);
      const matcher = new Bun.Glob(entry.pattern);
      for (const file of all) {
        const rel = relative(base, file).replaceAll('\\', '/');
        if (matcher.match(rel)) {
          files.add(relative(root, file).replaceAll('\\', '/'));
        }
      }
      continue;
    }
    let found: string[] = [];
    for (const candidate of entry.candidates) {
      found = await fs.filesAt(join(root, candidate));
      if (found.length > 0) break;
    }
    if (found.length === 0) missing.push(entry.candidates.join(' or '));
    for (const file of found) {
      files.add(relative(root, file).replaceAll('\\', '/'));
    }
  }
  return { files: [...files].sort(), missing };
};

export const skillIndexOf = async (
  fs: Pick<FsPort, 'exists' | 'readText'>,
  root: string,
  paths: readonly string[],
): Promise<SkillSummary[]> =>
  Promise.all(
    paths.map(async (path): Promise<SkillSummary> => {
      const full = join(root, path);
      if (!(await fs.exists(full))) return { path };
      return parseSkillSummary(path, await fs.readText(full));
    }),
  );
