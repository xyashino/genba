import { parseDocument, stringify } from 'yaml';
import type { DetectedProject } from '../domain/detect-project.ts';
import { guidanceOf, parseRole } from '../domain/role.ts';
import {
  DEFAULT_GUIDANCE_DIRS,
  linePathOf,
  rolePathOf,
  rulePathsOf,
  skillPathOf,
} from '../domain/runtime-paths.ts';
import { BUILTIN_LINES, BUILTIN_ROLES } from './registry.ts';

const TEMPLATE_RUNNER = 'claude';
const ROOT_HOOK = { timeout: '2m', exec: ['git fetch origin'] };
const WORKTREE_TIMEOUT = '10m';

export type Asset = { path: string; text: string };

export type LineValues = {
  project: Pick<DetectedProject, 'setup' | 'verify'>;
  runner: string;
  hasOrigin: boolean;
  /** whether the repo has this file; roles list only what exists */
  has: (path: string) => boolean;
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

const roleTextOf = (template: string, { has }: LineValues): string =>
  template.replace(
    /^(rules|skills): \[(.*)\]$/gm,
    (_line, key: 'rules' | 'skills', list: string) => {
      const pathsOf = (name: string): string[] =>
        key === 'rules'
          ? rulePathsOf(DEFAULT_GUIDANCE_DIRS.rules, name)
          : [skillPathOf(DEFAULT_GUIDANCE_DIRS.skills, name)];
      const names = list
        .split(',')
        .map((name) => name.trim())
        .filter((name) => name !== '' && pathsOf(name).some(has));
      return `${key}: [${names.join(', ')}]`;
    },
  );

/** Every rule and skill file a template role can list. */
export const templateGuidancePaths = (): string[] => [
  ...new Set(
    Object.values(BUILTIN_ROLES).flatMap((text) => {
      const { rules, skills } = guidanceOf(
        parseRole(text),
        DEFAULT_GUIDANCE_DIRS,
      );
      return [...rules, ...skills].flat();
    }),
  ),
];

/** The files `genba init` writes. At runtime genba reads only the repo copies. */
export const templateAssets = (values: LineValues): Asset[] => [
  ...Object.entries(BUILTIN_LINES).map(([name, template]) => ({
    path: linePathOf(name),
    text: lineTextOf(template, values),
  })),
  ...Object.entries(BUILTIN_ROLES).map(([name, template]) => ({
    path: rolePathOf(name),
    text: roleTextOf(template, values),
  })),
];
