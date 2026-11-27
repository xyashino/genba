import { z } from 'zod';
import type { RunnerUsage } from '../../ports/runner.port.js';
import { jsonLinesOf } from './json-lines.js';
import { promptFor } from './runner.js';
import type { CommandSpec, RunnerAdapter } from './runner.js';

const BINARY = 'codex';

const count = z.number().int().min(0);
const turnSchema = z.object({
  type: z.literal('turn.completed'),
  usage: z.object({
    input_tokens: count,
    cached_input_tokens: count.default(0),
    output_tokens: count,
  }),
});

const sandboxArgs = ({ permission }: CommandSpec): string[] =>
  permission === 'read'
    ? ['--ask-for-approval', 'never', 'exec', '--sandbox', 'read-only']
    : ['exec', '--dangerously-bypass-approvals-and-sandbox'];

const modelArgs = ({ model }: CommandSpec): string[] =>
  model === undefined ? [] : ['-m', model];

const parseUsage = (log: string): RunnerUsage | null => {
  const turns = jsonLinesOf(log).flatMap((line) => {
    const turn = turnSchema.safeParse(line);
    return turn.success ? [turn.data.usage] : [];
  });
  if (turns.length === 0) return null;
  const usage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
  for (const turn of turns) {
    // Codex counts cached tokens inside input_tokens.
    usage.inputTokens += Math.max(
      turn.input_tokens - turn.cached_input_tokens,
      0,
    );
    usage.cacheReadTokens += turn.cached_input_tokens;
    usage.outputTokens += turn.output_tokens;
  }
  return { usage, costUsd: null };
};

export const codexRunner: RunnerAdapter = {
  name: BINARY,
  binary: BINARY,
  buildCommand: (spec) => [
    BINARY,
    ...sandboxArgs(spec),
    '--json',
    ...modelArgs(spec),
    promptFor(spec.promptFile),
  ],
  parseUsage,
};
