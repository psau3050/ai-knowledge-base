import { defineConfig } from 'vitest/config';

// Unit tests only; the end-to-end suite needs the local Supabase stack (see vitest.e2e.config.js).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.e2e.test.ts'],
  },
});
