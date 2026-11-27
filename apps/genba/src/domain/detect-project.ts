export const RULE_FILES: readonly string[] = [
  'AGENTS.md',
  'CLAUDE.md',
  'CONTRIBUTING.md',
  '.cursorrules',
  '.github/copilot-instructions.md',
];
const NODE_MANAGERS = [
  { lock: 'bun.lock', name: 'bun', setup: 'bun install --frozen-lockfile' },
  { lock: 'bun.lockb', name: 'bun', setup: 'bun install --frozen-lockfile' },
  {
    lock: 'pnpm-lock.yaml',
    name: 'pnpm',
    setup: 'pnpm install --frozen-lockfile',
  },
  { lock: 'yarn.lock', name: 'yarn', setup: 'yarn install --frozen-lockfile' },
  { lock: 'package-lock.json', name: 'npm', setup: 'npm ci' },
];
const QUICK_SCRIPTS = ['lint', 'typecheck', 'check-types'];
const VERIFY_ALL_SCRIPTS = ['ci:verify', 'verify', 'ci'];
const VERIFY_PARTS = ['lint', 'typecheck', 'check-types', 'test', 'build'];
const MAKE_ALL_TARGETS = ['ci', 'verify', 'check'];
const MAKE_PARTS = ['lint', 'test'];

export const DETECTION_FILES: readonly string[] = [
  ...NODE_MANAGERS.map((manager) => manager.lock),
  'package.json',
  'Cargo.toml',
  'go.mod',
  'pyproject.toml',
  'requirements.txt',
  'Gemfile',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'Makefile',
];

export type ProjectFiles = Readonly<Record<string, string | undefined>>;

export type DetectedProject = {
  stack: string[];
  setup: string[];
  quick: string[];
  verify: string[];
};

const has = (files: ProjectFiles, name: string): boolean =>
  files[name] !== undefined;

const scriptsOf = (packageJson: string): string[] => {
  try {
    const parsed = JSON.parse(packageJson) as { scripts?: object };
    return Object.keys(parsed.scripts ?? {});
  } catch {
    return [];
  }
};

const nodeHooks = (files: ProjectFiles): DetectedProject | null => {
  const packageJson = files['package.json'];
  if (packageJson === undefined) return null;
  const manager = NODE_MANAGERS.find((entry) => has(files, entry.lock));
  const name = manager?.name ?? 'npm';
  const scripts = scriptsOf(packageJson);
  const run = (script: string): string => `${name} run ${script}`;
  const all = VERIFY_ALL_SCRIPTS.find((script) => scripts.includes(script));
  const present = (list: string[]): string[] =>
    list.filter((script) => scripts.includes(script));
  return {
    stack: [`node (${name})`],
    setup: [manager?.setup ?? 'npm install'],
    quick: present(QUICK_SCRIPTS).map(run),
    verify: all === undefined ? present(VERIFY_PARTS).map(run) : [run(all)],
  };
};

const makeHooks = (files: ProjectFiles): DetectedProject | null => {
  const makefile = files['Makefile'];
  if (makefile === undefined) return null;
  const targets = [...makefile.matchAll(/^([A-Za-z0-9_.-]+)\s*:(?!=)/gm)].map(
    (match) => match[1] ?? '',
  );
  const all = MAKE_ALL_TARGETS.find((target) => targets.includes(target));
  const parts = MAKE_PARTS.filter((target) => targets.includes(target));
  return {
    stack: ['make'],
    setup: [],
    quick: targets.includes('lint') ? ['make lint'] : [],
    verify: (all === undefined ? parts : [all]).map(
      (target) => `make ${target}`,
    ),
  };
};

const fixedHooks = (
  files: ProjectFiles,
  markers: string[],
  hooks: DetectedProject,
): DetectedProject | null =>
  markers.some((marker) => has(files, marker)) ? hooks : null;

const pythonHooks = (files: ProjectFiles): DetectedProject | null => {
  const sources = `${files['pyproject.toml'] ?? ''}${files['requirements.txt'] ?? ''}`;
  if (!has(files, 'pyproject.toml') && !has(files, 'requirements.txt')) {
    return null;
  }
  return {
    stack: ['python'],
    setup: has(files, 'requirements.txt')
      ? ['python -m pip install -r requirements.txt']
      : [],
    quick: sources.includes('ruff') ? ['ruff check .'] : [],
    verify: sources.includes('pytest') ? ['python -m pytest'] : [],
  };
};

/** Stack and hooks guessed from the repo root. A Makefile wins only when no stack gave checks. */
export const detectProject = (files: ProjectFiles): DetectedProject => {
  const stacks = [
    nodeHooks(files),
    fixedHooks(files, ['Cargo.toml'], {
      stack: ['rust'],
      setup: [],
      quick: ['cargo check'],
      verify: ['cargo test'],
    }),
    fixedHooks(files, ['go.mod'], {
      stack: ['go'],
      setup: [],
      quick: ['go vet ./...'],
      verify: ['go vet ./...', 'go test ./...'],
    }),
    pythonHooks(files),
    fixedHooks(files, ['Gemfile'], {
      stack: ['ruby'],
      setup: ['bundle install'],
      quick: [],
      verify: ['bundle exec rake'],
    }),
    fixedHooks(files, ['pom.xml'], {
      stack: ['maven'],
      setup: [],
      quick: [],
      verify: ['mvn -q verify'],
    }),
    fixedHooks(files, ['build.gradle', 'build.gradle.kts'], {
      stack: ['gradle'],
      setup: [],
      quick: [],
      verify: ['./gradlew check'],
    }),
  ].filter((hooks) => hooks !== null);
  const make = makeHooks(files);
  const useMake =
    make !== null && stacks.every((hooks) => hooks.verify.length === 0);
  const all = useMake ? [...stacks, make] : stacks;
  return {
    stack: all.flatMap((hooks) => hooks.stack),
    setup: all.flatMap((hooks) => hooks.setup),
    quick: all.flatMap((hooks) => hooks.quick),
    verify: all.flatMap((hooks) => hooks.verify),
  };
};
