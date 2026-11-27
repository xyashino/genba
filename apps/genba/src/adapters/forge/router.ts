import type { ForgeProvider } from '@repo/contracts/enums';
import { ForgeError } from '../../ports/forge.port.js';
import type { ForgePort } from '../../ports/forge.port.js';
import type { GitPort } from '../../ports/git.port.js';
import type { ProcessPort } from '../../ports/process.port.js';
import { detectForgeRemote } from './detect.js';
import { createGhForge } from './gh.js';
import { createGlabForge } from './glab.js';

export type ForgeRouterDeps = {
  process: ProcessPort;
  git: Pick<GitPort, 'remoteUrl'>;
  /** the manifest's `git` block; whatever it omits comes from the `origin` remote */
  config?: { provider?: ForgeProvider; host?: string };
};

const adapterOf = (
  provider: ForgeProvider,
  process: ProcessPort,
  host: string | undefined,
): ForgePort => {
  switch (provider) {
    case 'github':
      return createGhForge(process, { host });
    case 'gitlab':
      return createGlabForge(process, { host });
  }
};

export const createForgeRouter = ({
  process,
  git,
  config = {},
}: ForgeRouterDeps): ForgePort => {
  const forgeAt = async (cwd: string): Promise<ForgePort> => {
    const url = await git.remoteUrl(cwd);
    const remote = url === null ? null : detectForgeRemote(url);
    const provider = config.provider ?? remote?.provider;
    if (!provider) {
      throw new ForgeError(
        'cannot tell the forge from the origin remote: set git.provider',
      );
    }
    return adapterOf(provider, process, config.host ?? remote?.host);
  };
  return {
    publishPr: async (spec) => (await forgeAt(spec.cwd)).publishPr(spec),
    upsertAndonIssue: async (spec) =>
      (await forgeAt(spec.cwd)).upsertAndonIssue(spec),
    getPrStatus: async (cwd, prNumber) =>
      (await forgeAt(cwd)).getPrStatus(cwd, prNumber),
    checkAuth: async (cwd) => (await forgeAt(cwd)).checkAuth(cwd),
  };
};
