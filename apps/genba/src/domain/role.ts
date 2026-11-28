import { parsePrompt, renderPrompt } from '@repo/prompt/prompt';
import { z } from 'zod';
import type { GuidanceEntry } from './guidance.ts';
import {
  isAssetName,
  rulePathsOf,
  skillPathOf,
} from '@repo/line/runtime-paths';

const CONVENTIONAL_SUBJECT =
  /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)\([^()\s]+\)!?: \S.*$/;
const BUILTIN_EXTENDS = /^builtin:([a-z0-9][a-z0-9_-]*)$/i;
const GLOB_CHARS = /[*?]/;

const outputSpecSchema = z.object({
  file: z.string().min(1),
  requiredHeadings: z.array(z.string().min(1)).optional(),
  format: z.enum(['conventional']).optional(),
});

const isSafeRuleSegment = (part: string): boolean =>
  part !== '' &&
  part !== '.' &&
  part !== '..' &&
  (part === '**' || /^[a-z0-9*?._-]+$/i.test(part));

const rulePaths = z
  .array(
    z
      .string()
      .refine(
        (path) =>
          !path.startsWith('/') && path.split('/').every(isSafeRuleSegment),
        'use a file, folder, or glob inside the rules folder',
      ),
  )
  .default([]);

// Names become file paths, so they must not escape their folder; `*` selects all skills.
const skillNames = z
  .array(
    z
      .string()
      .refine(
        (name) => name === '*' || isAssetName(name),
        'use a plain skill name or "*"',
      ),
  )
  .default([]);

const guardsSchema = z.object({
  requireDiff: z.boolean().default(false),
  forbidPaths: z.array(z.string().min(1)).default([]),
});

const roleConfigSchema = z.object({
  extends: z
    .string()
    .regex(BUILTIN_EXTENDS, 'extends must be "builtin:<role>"')
    .optional(),
  rules: rulePaths,
  skills: skillNames,
  outputs: z.record(z.string(), outputSpecSchema).default({}),
  guards: guardsSchema.default({ requireDiff: false, forbidPaths: [] }),
});

export type RoleOutputSpec = z.infer<typeof outputSpecSchema>;
export type RoleConfig = z.infer<typeof roleConfigSchema>;

export type RoleDefinition = {
  prompt: ReturnType<typeof parsePrompt>;
  config: RoleConfig;
};

export type RoleGuardSnapshot = {
  changedPaths: readonly string[];
  outputs: Readonly<Record<string, string | undefined>>;
};

const matchesForbidPattern = (filePath: string, pattern: string): boolean =>
  new Bun.Glob(pattern).match(filePath.replaceAll('\\', '/'));

const hasHeading = (markdown: string, heading: string): boolean => {
  const target = heading.trim().toLowerCase();
  return markdown
    .replaceAll('\r\n', '\n')
    .split('\n')
    .some((line) => {
      const match = /^#{1,6}\s+(.+?)\s*$/.exec(line);
      return match?.[1]?.toLowerCase() === target;
    });
};

const mergeExtendedRole = (
  base: RoleDefinition,
  childPrompt: ReturnType<typeof parsePrompt>,
  childConfig: RoleConfig,
): RoleDefinition => {
  const raw = childPrompt.config;
  const rawGuards =
    typeof raw['guards'] === 'object' && raw['guards'] !== null
      ? (raw['guards'] as Record<string, unknown>)
      : {};
  const extraBody = childPrompt.body.trim();
  return {
    prompt: {
      ...base.prompt,
      id: childPrompt.id,
      input: { ...base.prompt.input, ...childPrompt.input },
      config: { ...base.prompt.config, ...childPrompt.config },
      body:
        extraBody.length > 0
          ? `${base.prompt.body.trimEnd()}\n\n${childPrompt.body.trimStart()}`
          : base.prompt.body,
    },
    config: {
      extends: childConfig.extends,
      rules: 'rules' in raw ? childConfig.rules : base.config.rules,
      skills: 'skills' in raw ? childConfig.skills : base.config.skills,
      outputs: { ...base.config.outputs, ...childConfig.outputs },
      guards: {
        requireDiff:
          'requireDiff' in rawGuards
            ? childConfig.guards.requireDiff
            : base.config.guards.requireDiff,
        forbidPaths:
          'forbidPaths' in rawGuards
            ? childConfig.guards.forbidPaths
            : base.config.guards.forbidPaths,
      },
    },
  };
};

export const parseRole = (
  markdown: string,
  builtins?: Readonly<Record<string, string>>,
): RoleDefinition => {
  const prompt = parsePrompt(markdown);
  if (prompt.stage !== 'runtime') {
    throw new Error(`role "${prompt.id}" must declare stage: runtime`);
  }
  const config = roleConfigSchema.parse(prompt.config);
  if (config.extends === undefined) return { prompt, config };
  const baseName = BUILTIN_EXTENDS.exec(config.extends)?.[1] ?? '';
  const baseSource = builtins?.[baseName];
  if (baseSource === undefined) {
    throw new Error(`role "${prompt.id}" extends unknown "${config.extends}"`);
  }
  return mergeExtendedRole(parseRole(baseSource), prompt, config);
};

/** Repo files this role must read, relative to the repo root. */
export const guidanceOf = (
  { config }: RoleDefinition,
  dirs: { rules: string; skills: string },
): { rules: GuidanceEntry[]; skills: GuidanceEntry[] } => ({
  rules: config.rules.map((name): GuidanceEntry => {
    if (name === '*')
      return { kind: 'glob', baseDir: dirs.rules, pattern: '**' };
    if (GLOB_CHARS.test(name)) {
      return { kind: 'glob', baseDir: dirs.rules, pattern: name };
    }
    return { kind: 'exact', candidates: rulePathsOf(dirs.rules, name) };
  }),
  skills: config.skills.map((name): GuidanceEntry =>
    name === '*'
      ? { kind: 'glob', baseDir: dirs.skills, pattern: '*/SKILL.md' }
      : { kind: 'exact', candidates: [skillPathOf(dirs.skills, name)] },
  ),
});

export const renderRole = (
  role: RoleDefinition,
  inputs: Record<string, unknown>,
): string => renderPrompt(role.prompt, { inputs });

export const validateRoleGuards = (
  role: RoleDefinition,
  snapshot: RoleGuardSnapshot,
  permission: 'read' | 'write',
): string[] => {
  const violations: string[] = [];
  const { guards, outputs } = role.config;

  if (permission === 'read' && snapshot.changedPaths.length > 0) {
    violations.push(
      `read-only role "${role.prompt.id}" modified repository files: ${snapshot.changedPaths.join(', ')}`,
    );
  }

  if (guards.requireDiff && snapshot.changedPaths.length === 0) {
    violations.push(
      `role "${role.prompt.id}" requires repository changes but diff is empty`,
    );
  }

  for (const path of snapshot.changedPaths) {
    for (const pattern of guards.forbidPaths) {
      if (matchesForbidPattern(path, pattern)) {
        violations.push(`path "${path}" is forbidden by pattern "${pattern}"`);
      }
    }
  }

  for (const [name, spec] of Object.entries(outputs)) {
    const content = snapshot.outputs[spec.file];
    if (content === undefined || content.trim().length === 0) {
      violations.push(`missing required output "${name}" (${spec.file})`);
      continue;
    }
    for (const heading of spec.requiredHeadings ?? []) {
      if (!hasHeading(content, heading)) {
        violations.push(
          `output "${spec.file}" missing required heading "${heading}"`,
        );
      }
    }
    if (spec.format === 'conventional') {
      const firstLine = content.replaceAll('\r\n', '\n').trim().split('\n')[0];
      if (firstLine === undefined || !CONVENTIONAL_SUBJECT.test(firstLine)) {
        violations.push(
          `output "${spec.file}" first line must be conventional "type(scope): title"`,
        );
      }
    }
  }

  return violations;
};
