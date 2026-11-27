import { modelTierSchema } from '@repo/contracts/enums';
import type { ModelTier } from '@repo/contracts/enums';
import { parse } from 'yaml';
import { z } from 'zod';
import type { RepoManifest, TierTarget } from './manifest.js';

const onFailSchema = z.object({
  retry: z.string().min(1),
  max: z.number().int().min(1),
});

const operatorStationSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('operator'),
  role: z.string().min(1),
  tier: modelTierSchema.default('fast'),
  escalate: z.array(modelTierSchema).min(1).optional(),
  inputs: z.array(z.string().min(1)).default([]),
  onFail: onFailSchema.optional(),
});

const inspectionStationSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('inspection'),
  hook: z.enum(['checks.quick', 'checks.verify']),
  onFail: onFailSchema.optional(),
});

const stationSchema = z.discriminatedUnion('kind', [
  operatorStationSchema,
  inspectionStationSchema,
]);

const lineSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  stations: z.array(stationSchema).min(1),
  deliver: z.object({
    commit: z.string().min(1),
    report: z.string().min(1),
    to: z.enum(['pr', 'branch']).default('pr'),
  }),
});

export type OperatorStation = z.infer<typeof operatorStationSchema>;
export type InspectionStation = z.infer<typeof inspectionStationSchema>;
export type StationDefinition = z.infer<typeof stationSchema>;
export type LineDefinition = z.infer<typeof lineSchema>;

export type ResolvedModel = TierTarget & { tier: ModelTier };

export type BoundStation =
  | (OperatorStation & { model: ResolvedModel })
  | (InspectionStation & { commands: string[] });

export type BoundLine = {
  name: string;
  description: string;
  setup: string[];
  stations: BoundStation[];
  deliver: LineDefinition['deliver'];
};

const resolveHook = (
  hook: InspectionStation['hook'],
  manifest: RepoManifest,
): string[] => {
  switch (hook) {
    case 'checks.quick':
      return [...manifest.checks.quick];
    case 'checks.verify':
      return [...manifest.checks.verify];
  }
};

export const parseLine = (yamlText: string): LineDefinition =>
  lineSchema.parse(parse(yamlText));

export const resolveAttemptModel = (
  station: Pick<OperatorStation, 'tier' | 'escalate'>,
  attempt: number,
  manifest: RepoManifest,
): ResolvedModel => {
  const ladder = station.escalate ?? [station.tier];
  const index = Math.min(Math.max(attempt, 1) - 1, ladder.length - 1);
  const tier = ladder[index] ?? station.tier;
  const target = manifest.tiers[tier];
  if (target === undefined) {
    throw new Error(`tier "${tier}" is not configured in manifest.tiers`);
  }
  return { tier, ...target };
};

export const bindLine = (
  line: LineDefinition,
  manifest: RepoManifest,
): BoundLine => ({
  name: line.name,
  description: line.description,
  setup: [...manifest.workspace.setup],
  stations: line.stations.map((station) => {
    switch (station.kind) {
      case 'operator':
        return {
          ...station,
          model: resolveAttemptModel(station, 1, manifest),
        };
      case 'inspection':
        return {
          ...station,
          commands: resolveHook(station.hook, manifest),
        };
    }
  }),
  deliver: line.deliver,
});
