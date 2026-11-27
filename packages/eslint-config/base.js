import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import turboPlugin from 'eslint-plugin-turbo';
import tseslint from 'typescript-eslint';
import onlyWarn from 'eslint-plugin-only-warn';

/**
 * A shared ESLint configuration for the repository.
 *
 * @type {import("eslint").Linter.Config}
 * */
export const config = [
  js.configs.recommended,
  eslintConfigPrettier,
  ...tseslint.configs.recommended,
  {
    plugins: {
      turbo: turboPlugin,
    },
    rules: {
      'turbo/no-undeclared-env-vars': 'warn',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportAllDeclaration',
          message: 'Barrel exports are not allowed: import from the module.',
        },
        {
          selector: 'ExportNamedDeclaration[source]',
          message: 'Barrel exports are not allowed: import from the module.',
        },
        {
          selector:
            'TSAsExpression[expression.typeAnnotation.type="TSUnknownKeyword"]',
          message: 'Avoid `as unknown as`: narrow the type instead.',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    plugins: {
      onlyWarn,
    },
  },
  {
    ignores: ['dist/**'],
  },
];
