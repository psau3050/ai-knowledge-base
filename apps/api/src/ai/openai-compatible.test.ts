import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AiProviderError } from './ai.errors.js';
import type { ChatStreamPart } from './ai.types.js';
import { OpenAICompatibleChatModel, OpenAICompatibleEmbeddingModel } from './openai-compatible.js';
import type { EmbeddingModelConfig } from './providers.js';
import { startFakeOpenAIServer, type FakeOpenAIServer } from './testing/fake-openai-server.js';

const DIMENSIONS = 4;
let server: FakeOpenAIServer;

beforeAll(async () => {
  server = await startFakeOpenAIServer({ dimensions: DIMENSIONS });
});
afterAll(() => server.close());
beforeEach(() => {
  server.requests.length = 0;
  server.failWith(null);
});

const chatModel = (temperature?: number) =>
  new OpenAICompatibleChatModel({
    provider: 'custom',
    baseURL: server.baseURL,
    apiKey: 'test-key',
    model: 'any-chat-model',
    ...(temperature !== undefined && { temperature }),
  });

const embeddingModel = (overrides: Partial<EmbeddingModelConfig> = {}) =>
  new OpenAICompatibleEmbeddingModel({
    provider: 'custom',
    baseURL: server.baseURL,
    apiKey: 'test-key',
    model: 'any-embedding-model',
    dimensions: DIMENSIONS,
    sendDimensions: false,
    queryPrefix: '',
    documentPrefix: '',
    batchSize: 64,
    ...overrides,
  });

describe('OpenAICompatibleChatModel', () => {
  it('calls the configured base URL with the configured model and key', async () => {
    const result = await chatModel().complete({ messages: [{ role: 'user', content: 'Hi' }] });

    expect(result).toEqual({
      text: 'Hello',
      usage: { promptTokens: 5, completionTokens: 2, totalTokens: 7 },
      model: 'any-chat-model',
    });
    const [request] = server.requests;
    expect(request?.path).toBe('/v1/chat/completions');
    expect(request?.headers.authorization).toBe('Bearer test-key');
    expect(request?.body).toMatchObject({
      model: 'any-chat-model',
      messages: [{ role: 'user', content: 'Hi' }],
    });
  });

  it('sends sampling params only when configured', async () => {
    await chatModel().complete({ messages: [{ role: 'user', content: 'Hi' }] });
    await chatModel(0.2).complete({ messages: [{ role: 'user', content: 'Hi' }] });

    expect(server.requests[0]?.body).not.toHaveProperty('temperature');
    expect(server.requests[1]?.body).toHaveProperty('temperature', 0.2);
  });

  it('streams text deltas and finishes with usage', async () => {
    const parts: ChatStreamPart[] = [];
    for await (const part of chatModel().stream({ messages: [{ role: 'user', content: 'Hi' }] })) {
      parts.push(part);
    }

    expect(parts).toEqual([
      { type: 'text', text: 'Hel' },
      { type: 'text', text: 'lo' },
      {
        type: 'finish',
        finishReason: 'stop',
        usage: { promptTokens: 5, completionTokens: 2, totalTokens: 7 },
        model: 'any-chat-model',
      },
    ]);
  });

  it('reports the model that actually answered when a router picks one', async () => {
    const router = await startFakeOpenAIServer({
      dimensions: DIMENSIONS,
      servedModel: 'vendor/picked',
    });
    const model = new OpenAICompatibleChatModel({
      provider: 'custom',
      baseURL: router.baseURL,
      apiKey: 'test-key',
      model: 'router/auto',
    });

    const completion = await model.complete({ messages: [{ role: 'user', content: 'Hi' }] });
    const parts: ChatStreamPart[] = [];
    for await (const part of model.stream({ messages: [{ role: 'user', content: 'Hi' }] })) {
      parts.push(part);
    }
    await router.close();

    expect(completion.model).toBe('vendor/picked');
    expect(parts.at(-1)).toMatchObject({ type: 'finish', model: 'vendor/picked' });
  });

  it('wraps HTTP failures in AiProviderError with the status code', async () => {
    server.failWith(401);

    const error = await chatModel()
      .complete({ messages: [{ role: 'user', content: 'Hi' }] })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AiProviderError);
    expect(error).toMatchObject({ provider: 'custom', status: 401 });
  });
});

describe('OpenAICompatibleEmbeddingModel', () => {
  it('batches inputs, keeps them in order and applies the document prefix', async () => {
    const texts = ['a', 'bb', 'ccc', 'dddd', 'eeeee'];

    const { vectors, usage } = await embeddingModel({
      batchSize: 2,
      documentPrefix: 'doc: ',
    }).embedDocuments(texts);

    expect(server.requests).toHaveLength(3);
    expect(server.requests[0]?.body.input).toEqual(['doc: a', 'doc: bb']);
    expect(vectors.map((vector) => vector[0])).toEqual(texts.map((t) => `doc: ${t}`.length));
    expect(usage?.totalTokens).toBe(5);
  });

  it('applies the query prefix to search queries', async () => {
    await embeddingModel({ queryPrefix: 'search_query: ' }).embedQuery('pgvector');

    expect(server.requests[0]?.body.input).toEqual(['search_query: pgvector']);
  });

  it('requests float vectors and sends `dimensions` only when configured', async () => {
    await embeddingModel().embedQuery('x');
    await embeddingModel({ sendDimensions: true }).embedQuery('x');

    expect(server.requests[0]?.body).toMatchObject({ encoding_format: 'float' });
    expect(server.requests[0]?.body).not.toHaveProperty('dimensions');
    expect(server.requests[1]?.body).toHaveProperty('dimensions', DIMENSIONS);
  });

  it('fails loudly when vectors do not match the database column size', async () => {
    await expect(embeddingModel({ dimensions: 768 }).embedQuery('x')).rejects.toThrow(
      /returned 4-dimensional vectors, but AI_EMBED_DIMENSIONS=768/,
    );
  });
});
