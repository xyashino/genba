import { forgeProviderSchema } from '@repo/contracts/enums';
import { z } from 'zod';
import { DEFAULT_GUIDANCE_DIRS } from './runtime-paths.ts';

const nonEmptyTrimmed = z.string().trim().min(1);

// Agents read these inside their worktree, so the folder must be part of the repo.
const repoDir = (fallback: string) =>
  nonEmptyTrimmed
    .transform((dir) => dir.replace(/^(\.\/)+/, '').replace(/\/+$/, ''))
    .refine(
      (dir) =>
        dir !== '' && !dir.startsWith('/') && !dir.split('/').includes('..'),
      'use a folder inside the repo',
    )
    .default(fallback);

export const repoManifestSchema = z.object({
  project: nonEmptyTrimmed,
  /** folder holding the `<name>.md` files that roles list under `rules` */
  rules: repoDir(DEFAULT_GUIDANCE_DIRS.rules),
  /** folder holding the `<name>/SKILL.md` files that roles list under `skills` */
  skills: repoDir(DEFAULT_GUIDANCE_DIRS.skills),
  git: z
    .object({
      provider: forgeProviderSchema.default('github'),
      host: nonEmptyTrimmed.optional(),
      baseBranch: nonEmptyTrimmed.default('main'),
    })
    .default({ provider: 'github', baseBranch: 'main' }),
  defaults: z
    .object({
      line: nonEmptyTrimmed.default('standard'),
      cells: z.number().int().min(1).max(32).default(1),
      minRemainingUsagePct: z.number().min(0).max(100).default(10),
    })
    .default({
      line: 'standard',
      cells: 1,
      minRemainingUsagePct: 10,
    }),
});

export type RepoManifest = z.infer<typeof repoManifestSchema>;

export const parseRepoManifest = (raw: unknown): RepoManifest =>
  repoManifestSchema.parse(raw);
