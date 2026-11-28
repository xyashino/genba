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
      ['../cli/**', '../operator/**', '../standalone/**', '@repo/factory/**'],
      'domain must stay pure and never import cli, operator, standalone, or the factory',
    ),
  },
  {
    files: ['src/operator/**/*.ts'],
    ...forbid(
      ['@repo/cell/**', '@repo/factory/**'],
      'operator must stay a zero-state loopback client',
    ),
  },
  {
    files: ['src/cli/**/*.ts'],
    ...forbid(
      ['@repo/factory/**'],
      'cli reaches the factory over its HTTP API only',
    ),
  },
];
