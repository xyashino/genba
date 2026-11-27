export const DEFAULT_PORT = 7072;
export const DAEMON_HOST = '127.0.0.1';
export const MANIFEST_PATH = '.genba/config.json';
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
