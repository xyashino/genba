import type { RepoManifest } from '../../../domain/manifest.ts';
import type { CliDeps } from '../context.ts';
import { manifestOf, repoRootOf } from '../context.ts';
import { findDaemon } from '../daemon-link.ts';

type Level = 'ok' | 'warn' | 'fail';

type Check = { level: Level; name: string; detail: string };

const runnerChecks = async (
  deps: CliDeps,
  manifest: RepoManifest,
): Promise<Check[]> => {
  const names = [
    ...new Set(Object.values(manifest.tiers).map((tier) => tier.runner)),
  ];
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
      if (!deps.catalog.restrictsReadMode(name)) {
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
  const authenticated =
    origin !== null &&
    (await deps
      .forgeOf(manifest)
      .checkAuth(root)
      .catch(() => false));
  return [
    { level: 'ok', name: 'config', detail: manifest.project },
    {
      level: manifest.checks.verify.length > 0 ? 'ok' : 'warn',
      name: 'verify checks',
      detail: manifest.checks.verify.join(' && ') || 'none configured',
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
    ...(await runnerChecks(deps, manifest)),
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
