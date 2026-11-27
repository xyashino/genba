import { relative } from 'node:path';
import type { RoleDefinition } from '../../domain/role.ts';
import type { Workspace } from './context.ts';

const NONE = '_none_';
const PLAIN_ARG = /^[A-Za-z0-9_./:=-]+$/;

export type StationInput = { name: string; content: string };

export type Guidance = {
  rules: readonly string[];
  skills: readonly string[];
  /** instruction files the repo has, used when the role lists no rules */
  fallback: readonly string[];
};

export type PromptFooter = {
  guidance: Guidance;
  role: RoleDefinition;
  workspace: Workspace;
  stationDir: string;
  operatorCommand: string;
  inputs: readonly StationInput[];
};

const shellQuote = (value: string): string =>
  PLAIN_ARG.test(value) ? value : `'${value.replaceAll("'", `'\\''`)}'`;

export const operatorCommandOf = (selfCommand: readonly string[]): string =>
  [...selfCommand.map(shellQuote), 'operator'].join(' ');

export const orNone = (value: string | null | undefined): string =>
  value === null || value === undefined || value.trim() === '' ? NONE : value;

const readSection = (title: string, paths: readonly string[]): string[] =>
  paths.length === 0
    ? []
    : [
        `## ${title}`,
        `Read each file in full before you start, including every file it links as a rule. They are mandatory:\n\n${paths.map((path) => `- \`${path}\``).join('\n')}`,
      ];

/** What the Cell adds to every role: rules, inputs, where outputs go, and how to report. */
export const promptFooter = (
  footer: PromptFooter,
  verbs: readonly string[],
): string => {
  const dir = relative(footer.workspace.path, footer.stationDir);
  const outputs = Object.values(footer.role.config.outputs).map((spec) => {
    const headings = spec.requiredHeadings?.length
      ? ` with markdown headings ${spec.requiredHeadings.join(', ')}`
      : '';
    const format = spec.format
      ? ' whose first line is `type(scope): title`'
      : '';
    return `- \`${dir}/${spec.file}\`${headings}${format}`;
  });
  const { rules, skills, fallback } = footer.guidance;
  return [
    ...readSection('Rules', rules.length > 0 ? rules : fallback),
    ...readSection('Skills', skills),
    ...(footer.inputs.length === 0
      ? []
      : [
          '## Station Inputs',
          ...footer.inputs.map(
            (input) => `### ${input.name}\n\n${orNone(input.content)}`,
          ),
        ]),
    '## Output Files',
    `Write these exact paths, relative to this worktree. Never commit them:\n\n${outputs.join('\n')}`,
    '## Reporting',
    `Finish by running exactly one of these. If it is refused, fix what it lists and run it again:\n\n${verbs.map((verb) => `- \`${footer.operatorCommand} ${verb}\``).join('\n')}`,
  ].join('\n\n');
};
