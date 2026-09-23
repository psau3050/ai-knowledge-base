import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

/**
 * Type-aware rules shared by every TypeScript workspace.
 * Consumers must set `languageOptions.parserOptions.tsconfigRootDir` to their own directory.
 */
export default defineConfig(
  globalIgnores(['**/dist/**', '**/.next/**', '**/coverage/**', '**/*.d.ts']),
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
