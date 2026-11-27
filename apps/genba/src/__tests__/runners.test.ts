import { describe, expect, it } from 'vitest';
import { createRunnerCatalog } from '../adapters/runners/catalog.ts';

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
    [
      'claude',
      [
        'claude',
        expect.stringContaining(PROMPT),
        '--dangerously-skip-permissions',
        '--model',
        'm1',
      ],
    ],
    [
      'antigravity',
      [
        'agy',
        '--mode',
        'auto',
        '--dangerously-skip-permissions',
        '--model',
        'm1',
        '-i',
        PROMPT,
      ],
    ],
  ])('starts %s with its own command outside headless', (name, argv) => {
    const line = catalog.commandLine(name, PROMPT_FILE, {
      model: 'm1',
      headless: false,
    })!;

    expect([line.command, ...line.args]).toEqual(argv);
  });

  it.each(['codex', 'cursor', 'opencode', 'copilot'])(
    'gives %s the same command headless or not',
    (name) => {
      const headless = catalog.commandLine(name, PROMPT_FILE);

      const plain = catalog.commandLine(name, PROMPT_FILE, { headless: false });

      expect(headless).toEqual(plain);
    },
  );

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

describe('runner output', () => {
  it('reads claude tokens from a noisy log', () => {
    const log = [
      'warning: something on stderr',
      '{not json',
      JSON.stringify({
        type: 'result',
        usage: {
          input_tokens: 10,
          output_tokens: 20,
          cache_read_input_tokens: 30,
          cache_creation_input_tokens: 40,
        },
      }),
    ].join('\n');

    expect(catalog.parseOutput('claude', log)).toEqual({
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        cacheReadTokens: 30,
        cacheWriteTokens: 40,
      },
    });
  });

  it('sums codex turns and splits cached input', () => {
    const turn = JSON.stringify({
      type: 'turn.completed',
      usage: { input_tokens: 100, cached_input_tokens: 60, output_tokens: 7 },
    });

    expect(catalog.parseOutput('codex', `${turn}\n${turn}\n`)).toEqual({
      usage: {
        inputTokens: 80,
        outputTokens: 14,
        cacheReadTokens: 120,
        cacheWriteTokens: 0,
      },
    });
  });

  it.each(['claude', 'codex', 'cursor', 'antigravity', 'opencode', 'copilot'])(
    'omits usage for %s when the log has none',
    (name) => {
      expect(catalog.parseOutput(name, 'plain text\n')).toStrictEqual({});
    },
  );

  it('reads nothing for an unknown runner', () => {
    expect(catalog.parseOutput('unknown', 'plain text\n')).toBeUndefined();
  });
});
