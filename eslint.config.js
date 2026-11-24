import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// ESLint selector regexes require escaped path separators.
const restrictedLayer = /(?:^|\u002F)(?:render|ui)(?:\u002F|$)/.source;
const completeLayerSegment = /\u002F(?:render|ui)\u002F/.source;
const layerImportMessage =
  'Simulation modules must not import the render or UI layers.';

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
              regex: restrictedLayer,
              message: layerImportMessage,
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: `ImportExpression[source.value=/${restrictedLayer}/]`,
          message: layerImportMessage,
        },
        {
          selector: `ImportExpression[source.expressions.length=0][source.quasis.0.value.cooked=/${restrictedLayer}/]`,
          message: layerImportMessage,
        },
        {
          selector: `ImportExpression > TemplateLiteral.source[expressions.length>0] > TemplateElement[value.cooked=/${completeLayerSegment}/]`,
          message: layerImportMessage,
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
