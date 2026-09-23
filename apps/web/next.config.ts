import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import type { NextConfig } from 'next';

// Web and API share one `.env` at the monorepo root (Next itself only reads apps/web/.env*).
// Variables already set in the real environment win.
const rootEnvFile = resolve(process.cwd(), '../../.env');
if (existsSync(rootEnvFile)) {
  const fileVars = parseEnv(readFileSync(rootEnvFile, 'utf8')) as Record<string, string>;
  for (const [key, value] of Object.entries(fileVars)) process.env[key] ??= value;
}

const nextConfig: NextConfig = {
  // Exposes the shared variables to the browser bundle under explicit public names.
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_URL ?? '',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY ?? '',
    NEXT_PUBLIC_API_URL: process.env.API_URL ?? 'http://localhost:4000',
  },
};

export default nextConfig;
