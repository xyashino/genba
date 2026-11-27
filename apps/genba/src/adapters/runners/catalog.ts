import type { RunnerCatalogPort } from '../../ports/runner.port.js';
import { antigravityRunner } from './antigravity.js';
import { claudeRunner } from './claude.js';
import { codexRunner } from './codex.js';
import { copilotRunner } from './copilot.js';
import { cursorRunner } from './cursor.js';
import { opencodeRunner } from './opencode.js';
import type { RunnerAdapter } from './runner.js';

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
  commandLine: (name, promptFile, options = {}) => {
    const argv = BY_NAME.get(name)?.buildCommand({
      promptFile,
      model: options.model,
      permission: options.permission ?? 'write',
    });
    if (argv === undefined) return undefined;
    const [command = '', ...args] = argv;
    return { command, args };
  },
  parseUsage: (name, log) => BY_NAME.get(name)?.parseUsage?.(log) ?? null,
});
