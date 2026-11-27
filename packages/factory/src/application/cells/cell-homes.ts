import { join } from 'node:path';
import {
  CELLS_DIR,
  cellDirOf,
  crashPathOf,
  logsCommandOf,
  slotOf,
  timelinePathOf,
  workspaceLabelOf,
} from '@repo/line/cells';
import { parseRepoManifest } from '@repo/line/manifest';
import { DATA_DIR, MANIFEST_PATH } from '@repo/line/runtime-paths';
import { timelineLineOf } from '@repo/line/timeline';
import type { FsPort } from '@repo/host/ports/fs.port';
import type { WorkspacePort } from '@repo/host/ports/workspace.port';

export type CellHomes = {
  /** a fresh log and workspace; after a crash the old log is kept */
  open(cellId: string, options: { crashed: boolean }): Promise<void>;
  close(cellId: string): Promise<void>;
  /** every Cell that left something behind */
  known(): Promise<string[]>;
  note(cellId: string, action: string, detail?: string): Promise<void>;
};

export type CellHomeDeps = {
  fs: FsPort;
  workspaces: WorkspacePort;
  repoRoot: string;
  selfCommand: readonly string[];
  now: () => string;
  warn: (message: string) => void;
};

export const createCellHomes = (deps: CellHomeDeps): CellHomes => {
  const at = (path: string): string => join(deps.repoRoot, path);
  const processLogOf = (cellId: string): string =>
    at(`${DATA_DIR}/logs/${cellId}.log`);

  const manifest = async () =>
    parseRepoManifest(
      JSON.parse(await deps.fs.readText(at(MANIFEST_PATH))) as unknown,
    );

  // Cleanup must finish even when herdr is down.
  const dropWorkspace = async (cellId: string): Promise<void> => {
    try {
      const { project } = await manifest();
      await deps.workspaces.remove(
        workspaceLabelOf(project, deps.repoRoot, cellId),
      );
    } catch (error) {
      deps.warn(`${cellId}: workspace not removed: ${String(error)}`);
    }
  };

  return {
    open: async (cellId, { crashed }) => {
      const events = at(timelinePathOf(cellId));
      let kept = '';
      if (crashed) {
        for (const path of [at(crashPathOf(cellId)), events]) {
          if (await deps.fs.exists(path)) kept += await deps.fs.readText(path);
        }
      }
      await dropWorkspace(cellId);
      await deps.fs.removeDir(at(cellDirOf(cellId)));
      if (!crashed) await deps.fs.remove(processLogOf(cellId));
      if (kept !== '') {
        await deps.fs.writeText(at(crashPathOf(cellId)), kept, 0o600);
      }
      await deps.fs.writeText(events, '', 0o600);
      const { herdr, project } = await manifest();
      if (herdr) {
        await deps.workspaces.ensure(
          workspaceLabelOf(project, deps.repoRoot, cellId),
          logsCommandOf(deps.selfCommand, cellId),
        );
      }
    },
    close: async (cellId) => {
      await dropWorkspace(cellId);
      await deps.fs.removeDir(at(cellDirOf(cellId)));
      await deps.fs.remove(processLogOf(cellId));
    },
    known: async () =>
      (await deps.fs.list(at(CELLS_DIR))).filter(
        (name) => slotOf(name) !== null,
      ),
    note: async (cellId, action, detail) => {
      try {
        await deps.fs.appendText(
          at(timelinePathOf(cellId)),
          timelineLineOf({ at: deps.now(), cell: cellId, action, detail }),
        );
      } catch (error) {
        deps.warn(`${cellId}: timeline not written: ${String(error)}`);
      }
    },
  };
};
