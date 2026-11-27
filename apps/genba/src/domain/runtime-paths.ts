export const DEFAULT_PORT = 7072;
export const DAEMON_HOST = '127.0.0.1';
export const MANIFEST_PATH = '.genba/config.json';
export const LINES_DIR = '.genba/lines';
export const ROLES_DIR = '.genba/roles';
export const DECISIONS_DIR = 'decisions';
export const DEFAULT_GUIDANCE_DIRS = {
  rules: '.agents/rules',
  skills: '.agents/skills',
};
export const DATA_DIR = '.genba-local';
export const WORKTREES_DIR = '.worktrees';
export const CELL_DIR = '.cell';
export const DB_FILE = 'genba.db';
export const CLI_TOKEN_FILE = 'cli-token';
export const CELLS_FILE = 'cells.json';
export const PORT_ENV = 'GENBA_PORT';
export const CELL_TOKEN_ENV = 'GENBA_CELL_TOKEN';
export const DAEMON_URL_ENV = 'GENBA_DAEMON_URL';
export const REPO_ROOT_ENV = 'GENBA_REPO_ROOT';

// Names come from order files and line YAML, so they must not escape their folder.
export const isAssetName = (name: string): boolean =>
  /^[a-z0-9][a-z0-9_-]*$/i.test(name);

export const linePathOf = (name: string): string => `${LINES_DIR}/${name}.yml`;

export const rolePathOf = (name: string): string => `${ROLES_DIR}/${name}.md`;

/** A rule names a folder or a file; the `.md` extension is optional. */
export const rulePathsOf = (dir: string, name: string): string[] => [
  `${dir}/${name}`,
  `${dir}/${name}.md`,
];

export const skillPathOf = (dir: string, name: string): string =>
  `${dir}/${name}/SKILL.md`;

export const portOf = (value: string | undefined): number => {
  if (value === undefined) return DEFAULT_PORT;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${PORT_ENV} must be a port number, found "${value}"`);
  }
  return port;
};

export const daemonUrlOf = (port: number): string =>
  `http://${DAEMON_HOST}:${port}`;
