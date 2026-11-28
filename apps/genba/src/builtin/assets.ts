import { parseDocument, stringify } from 'yaml';
import type { DetectedProject } from '../domain/detect-project.ts';
import { linePathOf } from '../domain/runtime-paths.ts';
import { BUILTIN_LINES } from './registry.ts';

const TEMPLATE_RUNNER = 'claude';
const ROOT_HOOK = { timeout: '2m', exec: ['git fetch origin'] };
const WORKTREE_TIMEOUT = '10m';

export type Asset = { path: string; text: string };

export type LineValues = {
  project: Pick<DetectedProject, 'setup' | 'verify'>;
  runner: string;
  hasOrigin: boolean;
};

type Template = {
  name: string;
  description: string;
  operators: Record<string, { runner: string; model?: string }>;
  mechanic: { runner: string; model?: string };
  stations: { kind: string; exec?: string[] }[];
};

const lineTextOf = (
  template: string,
  { project, runner, hasOrigin }: LineValues,
): string => {
  const { name, description, ...line } = parseDocument(
    template,
  ).toJS() as Template;
  if (runner !== TEMPLATE_RUNNER) {
    // Template model names are claude's, so another CLI uses its own default.
    for (const agent of [...Object.values(line.operators), line.mechanic]) {
      agent.runner = runner;
      delete agent.model;
    }
  }
  for (const station of line.stations) {
    if (station.kind === 'inspection') station.exec = [...project.verify];
  }
  const changeover = {
    ...(hasOrigin ? { root: ROOT_HOOK } : {}),
    ...(project.setup.length > 0
      ? { worktree: { timeout: WORKTREE_TIMEOUT, exec: project.setup } }
      : {}),
  };
  return stringify(
    {
      name,
      description,
      ...(Object.keys(changeover).length > 0 ? { changeover } : {}),
      ...line,
    },
    { aliasDuplicateObjects: false },
  );
};

/** The line files `genba init` writes. Built-in roles are used directly unless overridden in `.genba/roles/`. */
export const templateAssets = (values: LineValues): Asset[] =>
  Object.entries(BUILTIN_LINES).map(([name, template]) => ({
    path: linePathOf(name),
    text: lineTextOf(template, values),
  }));
