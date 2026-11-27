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

const outputSpecSchema = z.object({
  file: z.string().min(1),
  requiredHeadings: z.array(z.string().min(1)).optional(),
  format: z.enum(['conventional']).optional(),
});

// Names become file paths, so they must not escape their folder.
const assetNames = z
  .array(z.string().refine(isAssetName, 'use a plain file name'))
  .default([]);

const rulePaths = z
  .array(
    z
      .string()
      .refine(
        (path) =>
          path.split('/').every((part) => /^[a-z0-9][a-z0-9_.-]*$/i.test(part)),
        'use a file or folder inside the rules folder',
      ),
  )
  .default([]);

const roleConfigSchema = z.object({
  rules: rulePaths,
  skills: assetNames,
  outputs: z.record(z.string(), outputSpecSchema).default({}),
  guards: z
    .object({
      requireDiff: z.boolean().default(false),
      forbidPaths: z.array(z.string().min(1)).default([]),
    })
    .default({ requireDiff: false, forbidPaths: [] }),
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

export const parseRole = (markdown: string): RoleDefinition => {
  const prompt = parsePrompt(markdown);
  if (prompt.stage !== 'runtime') {
    throw new Error(`role "${prompt.id}" must declare stage: runtime`);
  }
  const config = roleConfigSchema.parse(prompt.config);
  return { prompt, config };
};

/** Repo files this role must read, relative to the repo root. */
export const guidanceOf = (
  { config }: RoleDefinition,
  dirs: { rules: string; skills: string },
): { rules: GuidanceEntry[]; skills: GuidanceEntry[] } => ({
  rules: config.rules.map((name) => rulePathsOf(dirs.rules, name)),
  skills: config.skills.map((name) => [skillPathOf(dirs.skills, name)]),
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
