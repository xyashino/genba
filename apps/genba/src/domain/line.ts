import { parse } from 'yaml';
import { z } from 'zod';

const DEFAULT_TIMEOUT = '30m';
const DURATION = /^([1-9]\d*)(s|m|h)$/;
const MS_PER_UNIT: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
};
// Ids genba itself schedules.
const RESERVED_STATIONS: readonly string[] = [
  'deliver',
  'mechanic',
  'escalate',
];

const text = z.string().trim().min(1);

const timeoutMs = z
  .string()
  .regex(DURATION, 'use a duration such as 30s, 40m or 1h')
  .default(DEFAULT_TIMEOUT)
  .transform((value) => {
    const [, amount, unit = ''] = DURATION.exec(value)!;
    return Number(amount) * (MS_PER_UNIT[unit] ?? 0);
  });

// Strict everywhere: a key genba would ignore must not look like it works.
const hookSchema = z
  .strictObject({ timeout: timeoutMs, exec: z.array(text).min(1) })
  .transform(({ timeout, exec }) => ({ timeoutMs: timeout, exec }));

const agentSchema = z
  .strictObject({
    profile: text,
    runner: text,
    /** omitted: the CLI uses its own default */
    model: text.optional(),
    timeout: timeoutMs,
    headless: z
      .boolean()
      .default(true)
      .refine((value) => value, 'genba runs headless only: set headless: true'),
    permission: z.enum(['read', 'write']),
  })
  .transform(({ timeout, ...agent }) => ({
    ...agent,
    timeoutMs: timeout,
  }));

const onFailSchema = z.strictObject({
  retry: text,
  max: z.number().int().min(1),
});

const operatorStationSchema = z.strictObject({
  id: text,
  kind: z.literal('operator'),
  operator: text,
  inputs: z.array(text).default([]),
  onFail: onFailSchema.optional(),
});

const inspectionStationSchema = z
  .strictObject({
    id: text,
    kind: z.literal('inspection'),
    timeout: timeoutMs,
    exec: z.array(text).default([]),
    onFail: onFailSchema.optional(),
  })
  .transform(({ timeout, ...station }) => ({
    ...station,
    timeoutMs: timeout,
  }));

const lineSchema = z
  .strictObject({
    name: text,
    description: text,
    changeover: z
      .strictObject({
        /** runs in the main checkout, before a worktree is created */
        root: hookSchema.optional(),
        /** runs in each new worktree, before its first station */
        worktree: hookSchema.optional(),
      })
      .default({}),
    operators: z.record(text, agentSchema),
    mechanic: agentSchema,
    stations: z
      .array(
        z.discriminatedUnion('kind', [
          operatorStationSchema,
          inspectionStationSchema,
        ]),
      )
      .min(1),
    deliver: z.strictObject({
      commit: text,
      report: text,
      to: z.enum(['new-pr', 'branch']).default('new-pr'),
      requireAdr: z.boolean().default(false),
    }),
  })
  .superRefine((line, context) => {
    const problem = (message: string): void => {
      context.addIssue({ code: 'custom', message });
    };
    const ids = line.stations.map((station) => station.id);
    for (const [index, station] of line.stations.entries()) {
      if (ids.indexOf(station.id) !== index) {
        problem(`station id "${station.id}" is used twice`);
      }
      if (RESERVED_STATIONS.includes(station.id)) {
        problem(`station id "${station.id}" is reserved`);
      }
      if (
        station.kind === 'operator' &&
        !Object.hasOwn(line.operators, station.operator)
      ) {
        problem(
          `station "${station.id}" names unknown operator "${station.operator}"`,
        );
      }
      const retry = station.onFail?.retry;
      if (retry !== undefined && !ids.slice(0, index + 1).includes(retry)) {
        problem(
          `station "${station.id}" must retry itself or an earlier station, not "${retry}"`,
        );
      }
    }
  });

export type LineDefinition = z.infer<typeof lineSchema>;
export type StationDefinition = LineDefinition['stations'][number];
export type OperatorStation = Extract<StationDefinition, { kind: 'operator' }>;
export type InspectionStation = Extract<
  StationDefinition,
  { kind: 'inspection' }
>;
export type AgentDefinition = LineDefinition['mechanic'];
export type Hook = NonNullable<LineDefinition['changeover']['root']>;

export const parseLine = (yamlText: string): LineDefinition =>
  lineSchema.parse(parse(yamlText));

export const operatorOf = (
  line: LineDefinition,
  station: OperatorStation,
): AgentDefinition => line.operators[station.operator]!;

export const agentsOf = (line: LineDefinition): AgentDefinition[] => [
  ...Object.values(line.operators),
  line.mechanic,
];

export const checksOfLine = (line: LineDefinition): string[] =>
  line.stations.flatMap((station) =>
    station.kind === 'inspection' ? station.exec : [],
  );
