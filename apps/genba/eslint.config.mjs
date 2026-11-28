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
      ['../adapters/**', '../runtimes/**', '@repo/factory/**'],
      'domain must stay pure and never import adapters, runtimes, or the factory',
    ),
  },
  {
    files: ['src/runtimes/operator/**/*.ts'],
    ...forbid(
      [
        '../../adapters/**',
        '@repo/cell/main',
        '@repo/cell/loop',
        '@repo/cell/deps',
        '@repo/factory/**',
      ],
      'operator runtime must stay a zero-state loopback client',
    ),
  },
  {
    files: ['src/runtimes/cli/**/*.ts'],
    ...forbid(
      ['@repo/factory/**'],
      'cli runtime reaches the factory over its HTTP API only',
    ),
  },
];
