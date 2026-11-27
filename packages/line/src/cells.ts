import { createHash } from 'node:crypto';
import { DATA_DIR } from './runtime-paths.ts';

export const CELLS_DIR = `${DATA_DIR}/cells`;
export const RUNS_DIR = `${DATA_DIR}/runs`;
const CELL_ID = /^cell-([1-9]\d*)$/;
const ONCE_ID = /^once-[0-9a-f]+$/;
const PLAIN_ARG = /^[A-Za-z0-9_./:=-]+$/;
const HASH_CHARS = 6;

/** Cells are named by slot, so a replacement takes over the same name. */
export const cellIdOf = (slot: number): string => `cell-${slot}`;

export const slotOf = (cellId: string): number | null => {
  const slot = CELL_ID.exec(cellId)?.[1];
  return slot === undefined ? null : Number(slot);
};

/** The temporary Cell of `run --once`: it has no slot, so the daemon leaves it alone. */
export const onceIdOf = (suffix: string): string => `once-${suffix}`;

export const isCellId = (name: string): boolean =>
  slotOf(name) !== null || ONCE_ID.test(name);

export const cellDirOf = (cellId: string): string => `${CELLS_DIR}/${cellId}`;

export const timelinePathOf = (cellId: string): string =>
  `${cellDirOf(cellId)}/events.jsonl`;

/** What crashed predecessors of this Cell logged. */
export const crashPathOf = (cellId: string): string =>
  `${cellDirOf(cellId)}/crash.jsonl`;

export const runDirOf = (
  orderId: string,
  stationId: string,
  jobId: string,
): string => `${RUNS_DIR}/${orderId}/${stationId}/${jobId}`;

export const shellQuote = (value: string): string =>
  PLAIN_ARG.test(value) ? value : `'${value.replaceAll("'", `'\\''`)}'`;

// Repos share one herdr server, and two may have the same folder name.
export const workspaceLabelOf = (
  project: string,
  repoRoot: string,
  cellId: string,
): string => {
  const hash = createHash('sha256').update(repoRoot).digest('hex');
  return `genba:${project}-${hash.slice(0, HASH_CHARS)}:${cellId}`;
};

export const logsCommandOf = (
  selfCommand: readonly string[],
  cellId: string,
): string =>
  [...selfCommand, 'watch', '--full', '--cell', cellId]
    .map(shellQuote)
    .join(' ');
