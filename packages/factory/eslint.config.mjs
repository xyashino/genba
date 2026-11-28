import { config } from '@repo/eslint-config/base';

const HTTP = {
  group: ['hono', 'hono/*'],
  message: 'Only app.ts and adapters import Hono.',
};

const ADAPTERS = {
  group: ['**/adapters/**'],
  message: 'Inner layers depend on ports, never on adapters.',
};

const GENBA = {
  group: ['@repo/genba', '@repo/genba/**'],
  message: 'The factory never imports the app that hosts it.',
};

const restricted = (patterns) => ({
  'no-restricted-imports': ['error', { patterns }],
});

export default [
  ...config,
  { files: ['src/**/*.ts', 'test/**/*.ts'], rules: restricted([GENBA]) },
  {
    files: ['src/domain/**/*.ts'],
    ignores: ['src/domain/**/__tests__/**'],
    rules: restricted([
      GENBA,
      HTTP,
      ADAPTERS,
      {
        group: [
          'drizzle-orm',
          'drizzle-orm/*',
          'bun:sqlite',
          'node:*',
          '@repo/host/**',
          '**/db/**',
          '**/application/**',
        ],
        message: 'The domain is pure: no I/O, database, or application code.',
      },
    ]),
  },
  {
    files: ['src/application/**/*.ts'],
    rules: restricted([GENBA, HTTP, ADAPTERS]),
  },
  {
    files: ['src/db/**/*.ts'],
    rules: restricted([
      GENBA,
      HTTP,
      ADAPTERS,
      {
        group: ['**/application/**'],
        message: 'The database never calls procedures.',
      },
    ]),
  },
];
