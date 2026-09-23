import { defineConfig } from 'eslint/config';
import next from '@kb/eslint-config/next';

export default defineConfig(next, {
  languageOptions: { parserOptions: { tsconfigRootDir: import.meta.dirname } },
});
