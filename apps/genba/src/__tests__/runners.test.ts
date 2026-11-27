import { describe, expect, it } from 'vitest';
import { createRunnerCatalog } from '../adapters/runners/catalog.js';

const PROMPT_FILE = '.cell/build/prompt.md';
const PROMPT = `Read ${PROMPT_FILE} and follow the instructions in it.`;
const catalog = createRunnerCatalog(async (binary) => binary === 'agy');

const argvOf = (
  name: string,
  permission: 'read' | 'write',
  model?: string,
): string[] => {
  const line = catalog.commandLine(name, PROMPT_FILE, { permission, model });
  return line === undefined ? [] : [line.command, ...line.args];
};

describe('runner catalog', () => {
  it('knows the six CLIs', () => {
    expect(catalog.names()).toEqual([
      'claude',
      'codex',
      'cursor',
      'antigravity',
      'opencode',
      'copilot',
    ]);
  });

  it.each([
    [
      'codex',
      [
        'codex',
        'exec',
        '--dangerously-bypass-approvals-and-sandbox',
        '--json',
        '-m',
        'm1',
        PROMPT,
      ],
    ],
    [
      'cursor',
      [
        'cursor-agent',
        '-p',
        '--force',
        '--trust',
        '--approve-mcps',
        '--output-format',
        'json',
        '--model',
        'm1',
        PROMPT,
      ],
    ],
    [
      'antigravity',
      [
        'agy',
        '--mode',
        'auto',
        '--dangerously-skip-permissions',
        '--output-format',
        'json',
        '--model',
        'm1',
        '-p',
        PROMPT,
      ],
    ],
    ['opencode', ['opencode', 'run', '-m', 'm1', PROMPT]],
    [
      'copilot',
      [
        'copilot',
        '-p',
        PROMPT,
        '--allow-all-tools',
        '--no-ask-user',
        '--trust-folder',
        '--output-format',
        'json',
        '--model',
        'm1',
      ],
    ],
  ])('starts %s headless with the chosen model', (name, argv) => {
    expect(argvOf(name, 'write', 'm1')).toEqual(argv);
  });

  it.each([
    ['codex', ['--sandbox', 'read-only']],
    ['cursor', ['--mode', 'plan']],
    ['copilot', ['--deny-tool', 'write']],
    ['claude', ['--disallowedTools', 'Write,Edit,MultiEdit,NotebookEdit']],
  ])('restricts %s in read mode', (name, flags) => {
    expect(argvOf(name, 'read').join(' ')).toContain(flags.join(' '));
  });

  it('tells a writing claude to avoid shell heredocs', () => {
    const [, , prompt] = argvOf('claude', 'write', 'opus');

    expect(prompt).toContain(PROMPT);
    expect(prompt).toContain('Do not write files through shell heredocs');
    expect(argvOf('claude', 'write', 'opus').slice(3)).toEqual([
      '--dangerously-skip-permissions',
      '--output-format',
      'json',
      '--model',
      'opus',
    ]);
  });

  it('tells a read-only claude to write outputs with a heredoc', () => {
    const [, , prompt] = argvOf('claude', 'read');

    expect(prompt).toContain('using a shell heredoc');
  });

  it('keeps claude guidance out of other runners', () => {
    expect(argvOf('codex', 'write').join(' ')).not.toContain('heredoc');
  });

  it('probes the binary name, not the runner name', async () => {
    expect(await catalog.isInstalled('antigravity')).toBe(true);
    expect(await catalog.isInstalled('claude')).toBe(false);
    expect(await catalog.isInstalled('unknown')).toBe(false);
  });

  it('has no command for an unknown runner', () => {
    expect(catalog.commandLine('unknown', PROMPT_FILE)).toBeUndefined();
  });
});

describe('runner usage', () => {
  it('reads claude tokens and cost from a noisy log', () => {
    const log = [
      'warning: something on stderr',
      '{not json',
      JSON.stringify({
        type: 'result',
        total_cost_usd: 0.42,
        usage: {
          input_tokens: 10,
          output_tokens: 20,
          cache_read_input_tokens: 30,
          cache_creation_input_tokens: 40,
        },
      }),
    ].join('\n');

    expect(catalog.parseUsage('claude', log)).toEqual({
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        cacheReadTokens: 30,
        cacheWriteTokens: 40,
      },
      costUsd: 0.42,
    });
  });

  it('sums codex turns, splits cached input, and reports no price', () => {
    const turn = JSON.stringify({
      type: 'turn.completed',
      usage: { input_tokens: 100, cached_input_tokens: 60, output_tokens: 7 },
    });

    expect(catalog.parseUsage('codex', `${turn}\n${turn}\n`)).toEqual({
      usage: {
        inputTokens: 80,
        outputTokens: 14,
        cacheReadTokens: 120,
        cacheWriteTokens: 0,
      },
      costUsd: null,
    });
  });

  it.each(['claude', 'codex', 'opencode', 'unknown'])(
    'reports nothing for %s without usage output',
    (name) => {
      expect(catalog.parseUsage(name, 'plain text\n')).toBeNull();
    },
  );
});
