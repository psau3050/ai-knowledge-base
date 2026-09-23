import nextVitals from 'eslint-config-next/core-web-vitals';
import { defineConfig } from 'eslint/config';
import base from './base.js';

// `base` comes after Next's preset so the type-aware typescript-eslint parser wins over Next's parser.
export default defineConfig(nextVitals, base, {
  files: ['**/*.{ts,tsx}'],
  rules: {
    // Async event handlers (onClick={async () => ...}) are idiomatic in React.
    '@typescript-eslint/no-misused-promises': [
      'error',
      { checksVoidReturn: { attributes: false } },
    ],
  },
});
