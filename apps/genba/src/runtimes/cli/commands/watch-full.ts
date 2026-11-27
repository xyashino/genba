import { join } from 'node:path';
import {
  CELLS_DIR,
  crashPathOf,
  isCellId,
  timelinePathOf,
} from '../../../domain/cells.ts';
import {
  matchesFilter,
  parseTimelineLine,
  renderEntry,
  renderHeader,
} from '../../../domain/timeline.ts';
import type {
  TimelineEntry,
  TimelineFilter,
} from '../../../domain/timeline.ts';
import type { FsPort } from '../../../ports/fs.port.ts';
import type { CliDeps } from '../context.ts';
import { CliError, repoRootOf } from '../context.ts';

const POLL_MS = 500;

const linesOf = async (fs: FsPort, path: string): Promise<string[]> => {
  try {
    return (await fs.readText(path)).split('\n').filter(Boolean);
  } catch {
    // The Cell may be removed between the listing and the read.
    return [];
  }
};

/** Returns a reader that gives each saved entry once, oldest first. */
export const timelineReader = (
  fs: FsPort,
  root: string,
  filter: TimelineFilter,
): (() => Promise<TimelineEntry[]>) => {
  let seen = new Set<string>();
  return async () => {
    const cells = (await fs.list(join(root, CELLS_DIR))).filter(isCellId);
    const lines = (
      await Promise.all(
        cells
          .flatMap((cellId) => [crashPathOf(cellId), timelinePathOf(cellId)])
          .map((path) => linesOf(fs, join(root, path))),
      )
    ).flat();
    const fresh = lines.filter((line) => !seen.has(line));
    const entries = fresh
      .map(parseTimelineLine)
      .filter((entry) => entry !== null);
    // A line still being written does not parse yet, so it is not remembered.
    seen = new Set(lines.filter((line) => parseTimelineLine(line) !== null));
    return entries
      .filter((entry) => matchesFilter(entry, filter))
      .sort((a, b) => a.at.localeCompare(b.at));
  };
};

/** Saved history of the Cells that still exist, then new entries until Ctrl+C. */
export const runWatchFull = async (
  deps: CliDeps,
  filter: TimelineFilter,
): Promise<number> => {
  if (filter.cell !== undefined && !isCellId(filter.cell)) {
    throw new CliError(`--cell takes a name like cell-1, found ${filter.cell}`);
  }
  const root = await repoRootOf(deps);
  const read = timelineReader(deps.fs, root, filter);
  const color = Boolean(process.stdout.isTTY);
  const stop = new AbortController();
  process.once('SIGINT', () => stop.abort());
  deps.out(renderHeader(filter, color));
  while (!stop.signal.aborted) {
    for (const entry of await read()) deps.out(renderEntry(entry, color));
    await new Promise((done) => setTimeout(done, POLL_MS));
  }
  return 0;
};
