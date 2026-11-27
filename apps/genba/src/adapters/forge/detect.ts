import type { ForgeProvider } from '@repo/contracts/enums';

const SCP_REMOTE = /^(?:[^@/]+@)?([^/:]{2,}):(?!\/\/)/;
const URL_PROTOCOLS = ['https:', 'http:', 'ssh:', 'git:'];

export type ForgeRemote = {
  host: string;
  /** null when the host name does not say which forge it runs */
  provider: ForgeProvider | null;
};

const hostOf = (remoteUrl: string): string | null => {
  if (!remoteUrl.includes('://')) {
    return SCP_REMOTE.exec(remoteUrl)?.[1] ?? null;
  }
  try {
    const url = new URL(remoteUrl);
    return URL_PROTOCOLS.includes(url.protocol) ? url.hostname || null : null;
  } catch {
    return null;
  }
};

const providerOf = (host: string): ForgeProvider | null => {
  if (host.includes('github')) return 'github';
  if (host.includes('gitlab')) return 'gitlab';
  return null;
};

export const detectForgeRemote = (remoteUrl: string): ForgeRemote | null => {
  const host = hostOf(remoteUrl.trim())?.toLowerCase();
  return host === undefined ? null : { host, provider: providerOf(host) };
};
