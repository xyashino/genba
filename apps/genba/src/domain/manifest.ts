import { forgeProviderSchema, modelTierSchema } from '@repo/contracts/enums';
import { z } from 'zod';

const nonEmptyTrimmed = z.string().trim().min(1);

export const tierTargetSchema = z.object({
  runner: nonEmptyTrimmed,
  model: nonEmptyTrimmed,
});

export const repoManifestSchema = z.object({
  project: nonEmptyTrimmed,
  git: z
    .object({
      provider: forgeProviderSchema.default('github'),
      host: nonEmptyTrimmed.optional(),
    })
    .default({ provider: 'github' }),
  workspace: z
    .object({
      setup: z.array(nonEmptyTrimmed).default([]),
    })
    .default({ setup: [] }),
  checks: z
    .object({
      quick: z.array(nonEmptyTrimmed).default([]),
      verify: z.array(nonEmptyTrimmed).default([]),
    })
    .default({ quick: [], verify: [] }),
  context: z
    .object({
      rules: z.array(nonEmptyTrimmed).default([]),
      conventions: z.array(nonEmptyTrimmed).default([]),
    })
    .default({ rules: [], conventions: [] }),
  defaults: z
    .object({
      line: nonEmptyTrimmed.default('standard'),
      cells: z.number().int().min(1).max(32).default(1),
      minRemainingUsagePct: z.number().min(0).max(100).default(10),
    })
    .default({ line: 'standard', cells: 1, minRemainingUsagePct: 10 }),
  tiers: z.record(modelTierSchema, tierTargetSchema).default({
    fast: { runner: 'claude', model: 'haiku' },
    strong: { runner: 'claude', model: 'sonnet' },
    top: { runner: 'claude', model: 'opus' },
  }),
});

export type TierTarget = z.infer<typeof tierTargetSchema>;
export type RepoManifest = z.infer<typeof repoManifestSchema>;

export const parseRepoManifest = (raw: unknown): RepoManifest =>
  repoManifestSchema.parse(raw);
