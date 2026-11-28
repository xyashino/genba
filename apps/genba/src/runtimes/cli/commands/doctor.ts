import { join } from 'node:path';
import { BUILTIN_ROLES } from '@repo/cell/builtin/registry';
import { guidanceKeyOf, resolveGuidance } from '@repo/cell/domain/guidance';
import type { GuidanceEntry } from '@repo/cell/domain/guidance';
import { agentsOf, checksOfLine, parseLine } from '@repo/line/line';
import type { AgentDefinition, LineDefinition } from '@repo/line/line';
import { guidanceOf, parseRole } from '@repo/cell/domain/role';
import { LINES_DIR, rolePathOf } from '@repo/line/runtime-paths';
import type { RepoManifest } from '@repo/line/manifest';
import type { CliDeps } from '../context.ts';
import { manifestOf, repoRootOf } from '../context.ts';
import { findDaemon } from '../daemon-link.ts';

type Level = 'ok' | 'warn' | 'fail';

type Check = { level: Level; name: string; detail: string };

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const runnerChecks = async (
  deps: CliDeps,
  agents: readonly AgentDefinition[],
): Promise<Check[]> => {
  const names = [...new Set(agents.map((agent) => agent.runner))];
  return Promise.all(
    names.map(async (name): Promise<Check> => {
      const check = (level: Level, detail: string): Check => ({
        level,
        name: `runner ${name}`,
        detail,
      });
      if (!(await deps.catalog.isInstalled(name))) {
        return check('fail', 'not installed');
      }
      const reads = agents.some(
        (agent) => agent.runner === name && agent.permission === 'read',
      );
      if (reads && !deps.catalog.restrictsReadMode(name)) {
        return check('fail', 'cannot run read-only roles (no read mode)');
      }
      return name === 'claude'
        ? check('ok', 'installed; read mode denies edit tools, shell can write')
        : check(
            'warn',
            'installed; read mode and operator access are unverified',
          );
    }),
  );
};

// Line files, the roles they name, and what their agents and gates need.
const lineChecks = async (
  deps: CliDeps,
  root: string,
  manifest: RepoManifest,
): Promise<Check[]> => {
  const check = (level: Level, detail: string): Check => ({
    level,
    name: 'lines and roles',
    detail,
  });
  const read = (path: string): Promise<string> =>
    deps.fs.readText(join(root, path));
  const files = (await deps.fs.list(join(root, LINES_DIR))).filter((file) =>
    file.endsWith('.yml'),
  );
  if (files.length === 0) {
    return [check('fail', `no line files in ${LINES_DIR}`)];
  }
  const problems: string[] = [];
  const guidance = new Map<string, GuidanceEntry>();
  const lines: LineDefinition[] = [];
  for (const file of files) {
    try {
      lines.push(parseLine(await read(`${LINES_DIR}/${file}`)));
    } catch (error) {
      problems.push(`${file}: ${messageOf(error)}`);
    }
  }
  const agents = lines.flatMap(agentsOf);
  const roles = [...new Set(agents.map((agent) => agent.profile))];
  for (const role of roles) {
    try {
      const path = rolePathOf(role);
      const parsed = (await deps.fs.exists(join(root, path)))
        ? parseRole(await read(path), BUILTIN_ROLES)
        : Object.hasOwn(BUILTIN_ROLES, role)
          ? parseRole(BUILTIN_ROLES[role as keyof typeof BUILTIN_ROLES])
          : (() => {
              throw new Error(`missing ${path}`);
            })();
      const { rules, skills } = guidanceOf(parsed, manifest);
      for (const entry of [...rules, ...skills]) {
        guidance.set(guidanceKeyOf(entry), entry);
      }
    } catch (error) {
      problems.push(`role ${role}: ${messageOf(error)}`);
    }
  }
  const { files: present, missing } = await resolveGuidance(deps.fs, root, [
    ...guidance.values(),
  ]);
  const unverified = lines
    .filter((line) => checksOfLine(line).length === 0)
    .map((line) => line.name);
  return [
    problems.length === 0
      ? check('ok', `${files.length} lines, ${roles.length} roles`)
      : check('fail', problems.join('; ')),
    {
      // A warning: `changeover.worktree` may generate them in each worktree.
      level: missing.length === 0 ? 'ok' : 'warn',
      name: 'rules and skills',
      detail:
        missing.length === 0
          ? `${present.length} files present`
          : `missing here: ${missing.join(', ')}`,
    },
    {
      level: unverified.length === 0 ? 'ok' : 'warn',
      name: 'quality gates',
      detail:
        unverified.length === 0
          ? 'every line runs checks'
          : `no checks in: ${unverified.join(', ')}`,
    },
    ...(await runnerChecks(deps, agents)),
  ];
};

const herdrCheck = async (deps: CliDeps, root: string): Promise<Check> => {
  const status = await deps.process.run('herdr', ['status', 'server'], root);
  const running =
    status.exitCode === 0 && /^status: running$/m.test(status.stdout);
  return {
    level: running ? 'ok' : 'fail',
    name: 'herdr',
    detail: running
      ? 'server running'
      : 'config sets herdr: true, but no herdr server is running',
  };
};

const checksOf = async (deps: CliDeps, root: string): Promise<Check[]> => {
  let manifest: RepoManifest;
  try {
    manifest = await manifestOf(deps, root);
  } catch (error) {
    return [
      {
        level: 'fail',
        name: 'config',
        detail: error instanceof Error ? error.message : String(error),
      },
    ];
  }
  const origin = await deps.git.remoteUrl(root);
  const hasIdentity = await deps.git.hasAuthorIdentity(root);
  const authenticated =
    origin !== null &&
    (await deps
      .forgeOf(manifest)
      .checkAuth(root)
      .catch(() => false));
  return [
    { level: 'ok', name: 'config', detail: manifest.project },
    {
      level: hasIdentity ? 'ok' : 'fail',
      name: 'git identity',
      detail: hasIdentity
        ? 'configured'
        : 'missing user.name or user.email (run git config --global user.name and user.email)',
    },
    {
      level: origin === null ? 'fail' : 'ok',
      name: 'origin remote',
      detail: origin === null ? 'missing' : 'present',
    },
    {
      level: authenticated ? 'ok' : 'fail',
      name: `${manifest.git.provider} login`,
      detail: authenticated ? 'authenticated' : 'not authenticated',
    },
    ...(await lineChecks(deps, root, manifest)),
    ...(manifest.herdr ? [await herdrCheck(deps, root)] : []),
  ];
};

export const runDoctor = async (
  deps: CliDeps,
  { json }: { json: boolean },
): Promise<number> => {
  const checks = await checksOf(deps, await repoRootOf(deps));
  const link = await findDaemon(deps);
  checks.push({
    level: link?.health.crashLoop ? 'fail' : 'ok',
    name: 'daemon',
    detail:
      link === null
        ? 'not running'
        : `running with ${link.health.cells.length}/${link.health.desired} cells${link.health.crashLoop ? ' (crash loop)' : ''}`,
  });
  deps.out(
    json
      ? JSON.stringify(checks, null, 2)
      : checks
          .map(
            (check) =>
              `${check.level.padEnd(4)} ${check.name}: ${check.detail}`,
          )
          .join('\n'),
  );
  return checks.some((check) => check.level === 'fail') ? 1 : 0;
};
