import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['dist/', 'coverage/']),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['src/{world,game,net}/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(?:^|/)(?:render|ui)(?:/|$)',
              message:
                'Simulation modules must not import the render or UI layers.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/net/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'error' },
  },
  prettier,
);
