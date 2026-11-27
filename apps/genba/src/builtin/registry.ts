import fastLine from './lines/fast.yml' with { type: 'text' };
import featureLine from './lines/feature.yml' with { type: 'text' };
import standardLine from './lines/standard.yml' with { type: 'text' };
import builderRole from './roles/builder/ROLE.md' with { type: 'text' };
import doctorRole from './roles/doctor/ROLE.md' with { type: 'text' };
import mechanicRole from './roles/mechanic/ROLE.md' with { type: 'text' };
import plannerRole from './roles/planner/ROLE.md' with { type: 'text' };

export const BUILTIN_ROLES = {
  planner: plannerRole,
  builder: builderRole,
  doctor: doctorRole,
  mechanic: mechanicRole,
} as const;

export const BUILTIN_LINES = {
  fast: fastLine,
  standard: standardLine,
  feature: featureLine,
} as const;

export type BuiltinRoleName = keyof typeof BUILTIN_ROLES;
export type BuiltinLineName = keyof typeof BUILTIN_LINES;
