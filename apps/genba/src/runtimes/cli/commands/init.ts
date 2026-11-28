import { basename, join } from 'node:path';
import { templateAssets } from '../../../builtin/assets.ts';
import { detectForgeRemote } from '../../../adapters/forge/detect.ts';
import {
  DETECTION_FILES,
  detectProject,
} from '../../../domain/detect-project.ts';
import { parseRepoManifest } from '@repo/line/manifest';
import {
  DATA_DIR,
  DEFAULT_GUIDANCE_DIRS,
  LINES_DIR,
  MANIFEST_PATH,
  ROLES_DIR,
  WORKTREES_DIR,
} from '@repo/line/runtime-paths';
import type { CliDeps } from '../context.ts';
import { CliError, repoRootOf } from '../context.ts';

// Only CLIs whose read mode restricts something can run the planner, doctor, and mechanic.
const RUNNER_PREFERENCE = ['claude', 'codex', 'cursor', 'copilot'];
const REMOTE_HEAD = 'refs/remotes/origin/HEAD';

const installedRunners = async (deps: CliDeps): Promise<string[]> => {
  const found = await Promise.all(
    deps.catalog
      .names()
      .map(async (name) =>
        (await deps.catalog.isInstalled(name)) ? name : null,
      ),
  );
  return found.filter((name) => name !== null);
};

const baseBranchOf = async (deps: CliDeps, root: string): Promise<string> => {
  const remote = await deps.process.run(
    'git',
    ['symbolic-ref', '--short', REMOTE_HEAD],
    root,
  );
  if (remote.exitCode === 0) {
    return remote.stdout.trim().replace(/^origin\//, '');
  }
  const current = await deps.process.run(
    'git',
    ['symbolic-ref', '--short', 'HEAD'],
    root,
  );
  return current.exitCode === 0 ? current.stdout.trim() : 'main';
};

/** Detects the repo and writes its config, lines, and roles. */
export const runInit = async (
  deps: CliDeps,
  { force }: { force: boolean },
): Promise<number> => {
  const root = await repoRootOf(deps);
  const configPath = join(root, MANIFEST_PATH);
  if (!force && (await deps.fs.exists(configPath))) {
    throw new CliError(`${MANIFEST_PATH} exists: pass --force to replace it`);
  }
  const files = Object.fromEntries(
    await Promise.all(
      DETECTION_FILES.map(async (name) => {
        const path = join(root, name);
        // Lockfiles only need to exist, and the binary one is not text.
        return [
          name,
          (await deps.fs.exists(path))
            ? await deps.fs.readText(path)
            : undefined,
        ];
      }),
    ),
  ) as Record<string, string | undefined>;
  const project = detectProject(files);
  const url = await deps.git.remoteUrl(root);
  const remote = url === null ? null : detectForgeRemote(url);
  const installed = await installedRunners(deps);
  const runner = RUNNER_PREFERENCE.find((name) => installed.includes(name));
  const manifest = {
    project: basename(root),
    rules: `./${DEFAULT_GUIDANCE_DIRS.rules}`,
    skills: `./${DEFAULT_GUIDANCE_DIRS.skills}`,
    herdr: false,
    git: {
      provider: remote?.provider ?? 'github',
      baseBranch: await baseBranchOf(deps, root),
    },
  };
  parseRepoManifest(manifest);
  await deps.fs.writeText(configPath, `${JSON.stringify(manifest, null, 2)}\n`);
  for (const asset of templateAssets({
    project,
    runner: runner ?? 'claude',
    hasOrigin: url !== null,
  })) {
    const path = join(root, asset.path);
    if (force || !(await deps.fs.exists(path))) {
      await deps.fs.writeText(path, asset.text);
    }
  }
  await deps.git.excludeLocally(root, `${DATA_DIR}/`);
  await deps.git.excludeLocally(root, `${WORKTREES_DIR}/`);
  deps.out(
    [
      `wrote ${MANIFEST_PATH}`,
      `  assets:  ${LINES_DIR} (roles use built-ins; override in ${ROLES_DIR})`,
      `  stack:   ${project.stack.join(', ') || 'unknown'}`,
      `  setup:   ${project.setup.join(' && ') || 'none'}`,
      `  verify:  ${project.verify.join(' && ') || 'none'}`,
      `  rules:   ${manifest.rules} (skills: ${manifest.skills})`,
      `  forge:   ${manifest.git.provider} (base ${manifest.git.baseBranch})`,
      `  runners: ${installed.join(', ') || 'none found'}`,
    ].join('\n'),
  );
  const warnings = [
    ...(project.verify.length === 0
      ? [
          'no verify checks found: add commands to the quality-gate exec in each line, or nothing is verified',
        ]
      : []),
    ...(runner === undefined
      ? [
          `none of ${RUNNER_PREFERENCE.join(', ')} is installed: edit the runners in each line before \`genba start\``,
        ]
      : []),
    ...(runner !== undefined && runner !== 'claude'
      ? [`${runner} has not been verified with genba: see \`genba doctor\``]
      : []),
    ...(url === null
      ? ['no origin remote: delivery needs one to push to']
      : []),
    ...(url !== null && !remote?.provider
      ? ['could not tell the forge from origin: check git.provider']
      : []),
  ];
  for (const warning of warnings) deps.err(`warning: ${warning}`);
  return 0;
};
