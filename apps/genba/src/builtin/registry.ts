import fastLine from './lines/fast.yml' with { type: 'text' };
import featureLine from './lines/feature.yml' with { type: 'text' };
import standardLine from './lines/standard.yml' with { type: 'text' };

export const BUILTIN_LINES = {
  fast: fastLine,
  standard: standardLine,
  feature: featureLine,
} as const;

export type BuiltinLineName = keyof typeof BUILTIN_LINES;
