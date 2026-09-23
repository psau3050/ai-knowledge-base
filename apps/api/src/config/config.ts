import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { z } from 'zod';
import { aiEnvSchema, resolveAiConfig, type AiConfig } from '../ai/providers.js';

const envSchema = z.object({
  API_PORT: z.coerce.number().int().positive().default(4000),
  // Comma-separated: to a browser, localhost and 127.0.0.1 are different origins.
  WEB_ORIGIN: z
    .string()
    .default('http://localhost:3000,http://127.0.0.1:3000')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.url()).min(1)),
  SUPABASE_URL: z.url(),
  // The publishable key (or the legacy anon key). The API never needs the secret / service-role key.
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  RAG_TOP_K: z.coerce.number().int().min(1).max(20).default(6),
  // Cosine similarity floor for retrieved chunks. Model-specific (bge clusters high, OpenAI low), so it's
  // off by default and the prompt tells the model to say when the sources don't answer the question.
  RAG_MIN_SIMILARITY: z.coerce.number().min(-1).max(1).default(-1),
  ...aiEnvSchema.shape,
});

export interface AppConfig {
  port: number;
  webOrigins: string[];
  supabase: { url: string; publishableKey: string };
  rag: { topK: number; minSimilarity: number };
  ai: AiConfig;
}

export const APP_CONFIG = Symbol('APP_CONFIG');

/**
 * Web and API share one `.env` at the monorepo root. Variables already present in the real
 * environment take precedence, so deployments can ignore the file entirely.
 */
export function loadEnvFile(): void {
  // src/config or dist/config → four levels up is the repository root.
  const path = process.env.ENV_FILE ?? resolve(import.meta.dirname, '../../../../.env');
  if (!existsSync(path)) return;
  const fileVars = parseEnv(readFileSync(path, 'utf8')) as Record<string, string>;
  for (const [key, value] of Object.entries(fileVars)) process.env[key] ??= value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  // `KEY=` in a .env file means "not set", not "empty string".
  const defined = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ''));
  const parsed = envSchema.safeParse(defined);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment configuration (see .env.example):\n${z.prettifyError(parsed.error)}`,
    );
  }
  const vars = parsed.data;
  return {
    port: vars.API_PORT,
    webOrigins: vars.WEB_ORIGIN,
    supabase: { url: vars.SUPABASE_URL, publishableKey: vars.SUPABASE_PUBLISHABLE_KEY },
    rag: { topK: vars.RAG_TOP_K, minSimilarity: vars.RAG_MIN_SIMILARITY },
    ai: resolveAiConfig(vars),
  };
}
