import { dirname, join } from 'node:path';
import { z } from 'zod';
import type { FsPort, LockPort } from '../../ports/fs.port.ts';
import type { ProcessPort } from '../../ports/process.port.ts';
import type { WorkspacePort } from '../../ports/workspace.port.ts';

const HERDR = 'herdr';
const RECORD_FILE = 'herdr-workspaces.json';
const LOGS_LABEL = 'logs';
const WORKSPACE_ID = /"workspace_id"\s*:\s*"([^"]+)"/;
const TAB_ID = /"tab_id"\s*:\s*"([^"]+)"/;
const PANE_ID = /"pane_id"\s*:\s*"([^"]+)"/;

const listSchema = z.object({
  result: z.object({
    workspaces: z.array(
      z.object({ label: z.string().nullish(), workspace_id: z.string() }),
    ),
  }),
});
const recordSchema = z.record(z.string(), z.string());

export type HerdrWorkspaceDeps = {
  process: ProcessPort;
  fs: FsPort;
  lock: LockPort;
  /** `.genba-local`, where the ids of the workspaces genba created live */
  dataDir: string;
};

/** The herdr workspaces genba owns. It only closes the ones it recorded creating. */
export const createHerdrWorkspaces = (
  deps: HerdrWorkspaceDeps,
): WorkspacePort => {
  const root = dirname(deps.dataDir);
  const recordPath = join(deps.dataDir, RECORD_FILE);

  const herdr = async (args: string[]): Promise<string> => {
    const result = await deps.process.run(HERDR, args, root);
    if (result.exitCode !== 0) {
      throw new Error(
        `herdr ${args.slice(0, 2).join(' ')} failed: ${result.stderr.trim()}`,
      );
    }
    return result.stdout;
  };

  const readRecord = async (): Promise<Record<string, string>> =>
    (await deps.fs.exists(recordPath))
      ? recordSchema.parse(JSON.parse(await deps.fs.readText(recordPath)))
      : {};

  const writeRecord = (record: Record<string, string>): Promise<void> =>
    deps.fs.writeText(recordPath, `${JSON.stringify(record)}\n`, 0o600);

  const namedLike = async (label: string): Promise<string[]> =>
    listSchema
      .parse(JSON.parse(await herdr(['workspace', 'list'])))
      .result.workspaces.filter((entry) => entry.label === label)
      .map((entry) => entry.workspace_id);

  const locked = <T>(work: () => Promise<T>): Promise<T> =>
    deps.lock.withLock(deps.dataDir, new AbortController().signal, work);

  // The first tab only shows the timeline, so its failure must not stop a Cell.
  const showLogs = async (created: string, command: string): Promise<void> => {
    const tabId = TAB_ID.exec(created)?.[1];
    const paneId = PANE_ID.exec(created)?.[1];
    if (tabId === undefined || paneId === undefined) return;
    await deps.process.run(HERDR, ['tab', 'rename', tabId, LOGS_LABEL], root);
    await deps.process.run(HERDR, ['pane', 'run', paneId, command], root);
  };

  return {
    ensure: (label, logsCommand) =>
      locked(async () => {
        const record = await readRecord();
        const found = await namedLike(label);
        const owned = found.find((id) => id === record[label]);
        if (owned !== undefined) return owned;
        if (found.length > 0) {
          throw new Error(
            `herdr workspace "${label}" exists but genba did not create it: close or rename it`,
          );
        }
        const created = await herdr([
          'workspace',
          'create',
          '--label',
          label,
          '--cwd',
          root,
          '--no-focus',
        ]);
        const id = WORKSPACE_ID.exec(created)?.[1];
        if (id === undefined) throw new Error('herdr returned no workspace_id');
        await writeRecord({ ...record, [label]: id });
        await showLogs(created, logsCommand);
        return id;
      }),
    remove: (label) =>
      locked(async () => {
        const { [label]: id, ...rest } = await readRecord();
        if (id === undefined) return;
        if ((await namedLike(label)).includes(id)) {
          await herdr(['workspace', 'close', id]);
        }
        await writeRecord(rest);
      }),
  };
};
