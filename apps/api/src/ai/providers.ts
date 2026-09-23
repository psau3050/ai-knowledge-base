import { z } from 'zod';

export const PROVIDER_NAMES = [
  'openai',
  'groq',
  'together',
  'openrouter',
  'ollama',
  'custom',
] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

interface ProviderPreset {
  baseURL?: string;
  apiKeyRequired: boolean;
}

/**
 * Presets are convenience only: they fill in a default base URL. No other code branches on the provider
 * name, so any server that implements the OpenAI API works through `custom` + an explicit base URL.
 */
const PRESETS: Record<ProviderName, ProviderPreset> = {
  openai: { baseURL: 'https://api.openai.com/v1', apiKeyRequired: true },
  groq: { baseURL: 'https://api.groq.com/openai/v1', apiKeyRequired: true },
  together: { baseURL: 'https://api.together.xyz/v1', apiKeyRequired: true },
  openrouter: { baseURL: 'https://openrouter.ai/api/v1', apiKeyRequired: true },
  ollama: { baseURL: 'http://localhost:11434/v1', apiKeyRequired: false },
  custom: { apiKeyRequired: false },
};

export const aiEnvSchema = z.object({
  AI_CHAT_PROVIDER: z.enum(PROVIDER_NAMES),
  AI_CHAT_BASE_URL: z.url().optional(),
  AI_CHAT_API_KEY: z.string().optional(),
  AI_CHAT_MODEL: z.string().min(1),
  AI_CHAT_TEMPERATURE: z.coerce.number().min(0).max(2).optional(),

  AI_EMBED_PROVIDER: z.enum(PROVIDER_NAMES),
  AI_EMBED_BASE_URL: z.url().optional(),
  AI_EMBED_API_KEY: z.string().optional(),
  AI_EMBED_MODEL: z.string().min(1),
  AI_EMBED_DIMENSIONS: z.coerce.number().int().positive().default(1024),
  AI_EMBED_SEND_DIMENSIONS: z.stringbool().default(false),
  AI_EMBED_QUERY_PREFIX: z.string().default(''),
  AI_EMBED_DOCUMENT_PREFIX: z.string().default(''),
  AI_EMBED_BATCH_SIZE: z.coerce.number().int().min(1).max(2048).default(64),
});
export type AiEnv = z.infer<typeof aiEnvSchema>;

export interface ProviderConnection {
  provider: ProviderName;
  baseURL: string;
  apiKey: string;
}

export interface ChatModelConfig extends ProviderConnection {
  model: string;
  /** Sent only when set: some models (e.g. reasoning models) reject non-default sampling params. */
  temperature?: number;
}

export interface EmbeddingModelConfig extends ProviderConnection {
  model: string;
  dimensions: number;
  /** Ask the provider to truncate vectors (Matryoshka models such as text-embedding-3-*). */
  sendDimensions: boolean;
  queryPrefix: string;
  documentPrefix: string;
  batchSize: number;
}

export interface AiConfig {
  chat: ChatModelConfig;
  embeddings: EmbeddingModelConfig;
}

export function resolveAiConfig(env: AiEnv): AiConfig {
  return {
    chat: {
      ...resolveConnection(
        'AI_CHAT',
        env.AI_CHAT_PROVIDER,
        env.AI_CHAT_BASE_URL,
        env.AI_CHAT_API_KEY,
      ),
      model: env.AI_CHAT_MODEL,
      ...(env.AI_CHAT_TEMPERATURE !== undefined && { temperature: env.AI_CHAT_TEMPERATURE }),
    },
    embeddings: {
      ...resolveConnection(
        'AI_EMBED',
        env.AI_EMBED_PROVIDER,
        env.AI_EMBED_BASE_URL,
        env.AI_EMBED_API_KEY,
      ),
      model: env.AI_EMBED_MODEL,
      dimensions: env.AI_EMBED_DIMENSIONS,
      sendDimensions: env.AI_EMBED_SEND_DIMENSIONS,
      queryPrefix: env.AI_EMBED_QUERY_PREFIX,
      documentPrefix: env.AI_EMBED_DOCUMENT_PREFIX,
      batchSize: env.AI_EMBED_BATCH_SIZE,
    },
  };
}

function resolveConnection(
  envPrefix: string,
  provider: ProviderName,
  baseURL: string | undefined,
  apiKey: string | undefined,
): ProviderConnection {
  const preset = PRESETS[provider];
  const resolvedBaseURL = baseURL ?? preset.baseURL;
  if (!resolvedBaseURL) {
    throw new Error(`${envPrefix}_BASE_URL is required when ${envPrefix}_PROVIDER=${provider}`);
  }
  if (preset.apiKeyRequired && !apiKey) {
    throw new Error(`${envPrefix}_API_KEY is required when ${envPrefix}_PROVIDER=${provider}`);
  }
  // Keyless servers (Ollama, most self-hosted gateways) ignore the header, but the SDK insists on a value.
  return { provider, baseURL: resolvedBaseURL, apiKey: apiKey ?? 'not-needed' };
}
