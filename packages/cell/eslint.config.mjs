import { config } from '@repo/eslint-config/base';

const restricted = (patterns, message) => ({
  'no-restricted-imports': [
    'error',
    { patterns: patterns.map((group) => ({ group: [group], message })) },
  ],
});

const OTHER_RUNTIMES = [
  '@repo/factory/**',
  '@repo/sqlite-kit/**',
  '@repo/genba/**',
];

const DOMAIN_IO = [
  '**/adapters/**',
  '**/runtimes/**',
  'node:fs',
  'node:fs/*',
  'node:child_process',
  'node:net',
  'node:http',
  'node:os',
  'node:crypto',
  'bun',
  'bun:*',
];

export default [
  ...config,
  {
    files: ['src/**/*.ts'],
    rules: restricted(
      OTHER_RUNTIMES,
      'cell never imports the factory, its storage, or the app that hosts it',
    ),
  },
  {
    files: ['src/domain/**/*.ts'],
    rules: restricted(
      [...OTHER_RUNTIMES, ...DOMAIN_IO],
      'domain must stay pure: no adapters, runtimes, or node I/O',
    ),
  },
];
