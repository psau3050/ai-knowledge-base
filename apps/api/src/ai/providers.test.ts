import { describe, expect, it } from 'vitest';
import { aiEnvSchema, resolveAiConfig } from './providers.js';

const baseEnv = {
  AI_CHAT_PROVIDER: 'groq',
  AI_CHAT_API_KEY: 'gsk_test',
  AI_CHAT_MODEL: 'llama-3.3-70b-versatile',
  AI_EMBED_PROVIDER: 'ollama',
  AI_EMBED_MODEL: 'nomic-embed-text',
};

const resolve = (overrides: Record<string, string> = {}) =>
  resolveAiConfig(aiEnvSchema.parse({ ...baseEnv, ...overrides }));

describe('resolveAiConfig', () => {
  it('configures chat and embeddings independently, filling base URLs from presets', () => {
    const config = resolve();

    expect(config.chat).toMatchObject({
      provider: 'groq',
      baseURL: 'https://api.groq.com/openai/v1',
      apiKey: 'gsk_test',
      model: 'llama-3.3-70b-versatile',
    });
    expect(config.embeddings).toMatchObject({
      provider: 'ollama',
      baseURL: 'http://localhost:11434/v1',
      model: 'nomic-embed-text',
      dimensions: 1024,
      sendDimensions: false,
    });
  });

  it('lets an explicit base URL override the preset', () => {
    const config = resolve({ AI_CHAT_BASE_URL: 'https://gateway.example.com/v1' });

    expect(config.chat.baseURL).toBe('https://gateway.example.com/v1');
  });

  it('supports any OpenAI-compatible server through the custom provider', () => {
    expect(() => resolve({ AI_CHAT_PROVIDER: 'custom' })).toThrow(
      'AI_CHAT_BASE_URL is required when AI_CHAT_PROVIDER=custom',
    );
    expect(
      resolve({ AI_CHAT_PROVIDER: 'custom', AI_CHAT_BASE_URL: 'http://localhost:8080/v1' }).chat
        .baseURL,
    ).toBe('http://localhost:8080/v1');
  });

  it('requires an API key for hosted providers but not for local ones', () => {
    expect(() => resolve({ AI_EMBED_PROVIDER: 'together' })).toThrow(
      'AI_EMBED_API_KEY is required when AI_EMBED_PROVIDER=together',
    );
    expect(resolve().embeddings.apiKey).toBe('not-needed');
  });
});
