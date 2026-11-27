import type { RunnerCatalogPort } from '../../ports/runner.port.ts';
import { antigravityRunner } from './antigravity.ts';
import { claudeRunner } from './claude.ts';
import { codexRunner } from './codex.ts';
import { copilotRunner } from './copilot.ts';
import { cursorRunner } from './cursor.ts';
import { opencodeRunner } from './opencode.ts';
import type { RunnerAdapter } from './runner.ts';

const ADAPTERS: readonly RunnerAdapter[] = [
  claudeRunner,
  codexRunner,
  cursorRunner,
  antigravityRunner,
  opencodeRunner,
  copilotRunner,
];

const BY_NAME = new Map(ADAPTERS.map((adapter) => [adapter.name, adapter]));

/** Answers whether a binary is on PATH. */
export type BinaryProbe = (binary: string) => Promise<boolean>;

const onPath: BinaryProbe = async (binary) => Bun.which(binary) !== null;

export const createRunnerCatalog = (
  probe: BinaryProbe = onPath,
): RunnerCatalogPort => ({
  names: () => ADAPTERS.map((adapter) => adapter.name),
  isInstalled: async (name) => {
    const adapter = BY_NAME.get(name);
    return adapter !== undefined && (await probe(adapter.binary));
  },
  restrictsReadMode: (name) => BY_NAME.get(name)?.restrictsReadMode ?? false,
  commandLine: (name, promptFile, options = {}) => {
    const adapter = BY_NAME.get(name);
    if (adapter === undefined) return undefined;
    const spec = {
      promptFile,
      model: options.model,
      permission: options.permission ?? 'write',
    };
    const argv =
      (options.headless ?? true)
        ? adapter.buildHeadlessCommand(spec)
        : adapter.buildCommand(spec);
    const [command = '', ...args] = argv;
    return { command, args };
  },
  parseOutput: (name, log) => {
    const adapter = BY_NAME.get(name);
    if (adapter === undefined) return undefined;
    return adapter.parseOutput?.(log) ?? {};
  },
});
