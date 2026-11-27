import { z } from 'zod';
import type { RunnerReport } from '../../ports/runner.port.ts';
import { jsonLinesOf } from './json-lines.ts';
import { promptFor } from './runner.ts';
import type { CommandSpec, RunnerAdapter } from './runner.ts';

const BINARY = 'claude';
// Read mode keeps auto approval but denies file writes outright, so a judge cannot edit files.
const READ_DENIED_TOOLS = 'Write,Edit,MultiEdit,NotebookEdit';
const GUIDANCE = {
  write:
    'Write and edit files with your file-edit tool. Do not write files through shell heredocs, `python -c`, `sed -i`, or `tee`, and do not run `rm -rf`: automatic approval can block these and stall the run.',
  read: 'Your file-edit tools are disabled. Write only the required output files, using a shell heredoc.',
} as const;

const count = z.number().int().min(0);
const resultSchema = z.object({
  type: z.literal('result'),
  usage: z.object({
    input_tokens: count,
    output_tokens: count,
    cache_read_input_tokens: count.default(0),
    cache_creation_input_tokens: count.default(0),
  }),
});

const promptArg = ({ promptFile, permission }: CommandSpec): string =>
  `${promptFor(promptFile)} ${GUIDANCE[permission]}`;

const permissionArgs = ({ permission }: CommandSpec): string[] =>
  permission === 'read'
    ? ['--dangerously-skip-permissions', '--disallowedTools', READ_DENIED_TOOLS]
    : ['--dangerously-skip-permissions'];

const modelArgs = ({ model }: CommandSpec): string[] =>
  model === undefined ? [] : ['--model', model];

const parseOutput = (log: string): RunnerReport => {
  for (const line of jsonLinesOf(log).reverse()) {
    const result = resultSchema.safeParse(line);
    if (!result.success) continue;
    const { usage } = result.data;
    return {
      usage: {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheReadTokens: usage.cache_read_input_tokens,
        cacheWriteTokens: usage.cache_creation_input_tokens,
      },
    };
  }
  return {};
};

export const claudeRunner: RunnerAdapter = {
  name: BINARY,
  binary: BINARY,
  restrictsReadMode: true,
  // The prompt goes first: variadic `--disallowedTools` would swallow a trailing one.
  buildCommand: (spec) => [
    BINARY,
    promptArg(spec),
    ...permissionArgs(spec),
    ...modelArgs(spec),
  ],
  buildHeadlessCommand: (spec) => [
    BINARY,
    '-p',
    promptArg(spec),
    ...permissionArgs(spec),
    '--output-format',
    'json',
    ...modelArgs(spec),
  ],
  parseOutput,
};
