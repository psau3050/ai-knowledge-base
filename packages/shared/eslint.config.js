import { defineConfig } from 'eslint/config';
import base from '@kb/eslint-config/base';

export default defineConfig(base, {
  languageOptions: { parserOptions: { tsconfigRootDir: import.meta.dirname } },
});
