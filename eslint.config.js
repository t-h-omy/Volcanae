import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/components/**/*.tsx'],
    rules: {
      'no-restricted-syntax': ['warn',
        {
          selector: 'JSXText[value=/[A-Za-z]{2,}/]',
          message: 'Player-facing text must come from useText()',
        },
        {
          selector: 'JSXAttribute[name.name=/^(title|aria-label|placeholder|alt)$/] > Literal[value=/[A-Za-z]{2,}/]',
          message: 'Player-facing text must come from useText()',
        },
        {
          selector: 'JSXAttribute[name.name=/^(title|aria-label|placeholder|alt)$/] TemplateElement[value.raw=/[A-Za-z]{2,}/]',
          message: 'Player-facing text must come from useText()',
        },
      ],
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['**/i18n/i18n', '**/i18n/i18n.ts', '**/i18n/entityText', '**/i18n/entityText.ts'],
          message: 'Components use useText()',
          allowTypeImports: true,
        }],
      }],
    },
  },
])
