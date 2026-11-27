import { config } from '@repo/eslint-config/base';

const forbid = (patterns, message) => ({
  rules: {
    'no-restricted-imports': [
      'error',
      { patterns: patterns.map((group) => ({ group: [group], message })) },
    ],
  },
});

export default [
  ...config,
  {
    files: ['src/domain/**/*.ts'],
    ...forbid(
      ['../adapters/**', '../runtimes/**'],
      'domain must stay pure and never import adapters or runtimes',
    ),
  },
  {
    files: ['src/runtimes/operator/**/*.ts'],
    ...forbid(
      ['../../adapters/**', '../daemon/**', '../cell/**'],
      'operator runtime must stay a zero-state loopback client',
    ),
  },
  {
    files: ['src/runtimes/cell/**/*.ts'],
    ...forbid(
      ['**/adapters/sqlite/**', '../daemon/**'],
      'cell runtime must never access SQLite or daemon internals',
    ),
  },
  {
    files: ['src/runtimes/cli/**/*.ts'],
    ...forbid(
      ['**/adapters/sqlite/**'],
      'cli runtime must talk to daemon loopback, never SQLite directly',
    ),
  },
];
