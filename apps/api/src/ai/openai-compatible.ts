import type { TokenUsage } from '@kb/shared';
import OpenAI from 'openai';
import { AiProviderError } from './ai.errors.js';
import type {
  ChatCompletion,
  ChatModel,
  ChatRequest,
  ChatStreamPart,
  DocumentEmbeddings,
  EmbeddingModel,
  QueryEmbedding,
} from './ai.types.js';
import type { ChatModelConfig, EmbeddingModelConfig, ProviderConnection } from './providers.js';

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 2;

/**
 * The single adapter behind both interfaces. It relies only on the parts of the OpenAI API that every
 * compatible server implements, and sends optional parameters only when explicitly configured.
 */
function createClient(connection: ProviderConnection): OpenAI {
  return new OpenAI({
    baseURL: connection.baseURL,
    apiKey: connection.apiKey,
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: MAX_RETRIES,
  });
}

export class OpenAICompatibleChatModel implements ChatModel {
  private readonly client: OpenAI;

  constructor(private readonly config: ChatModelConfig) {
    this.client = createClient(config);
  }

  get provider(): string {
    return this.config.provider;
  }

  get model(): string {
    return this.config.model;
  }

  async complete({ messages, signal }: ChatRequest): Promise<ChatCompletion> {
    try {
      const response = await this.client.chat.completions.create(
        { model: this.config.model, messages, ...this.samplingParams() },
        { signal },
      );
      return {
        text: response.choices[0]?.message.content ?? '',
        usage: toTokenUsage(response.usage),
        model: response.model || this.config.model,
      };
    } catch (error) {
      throw toProviderError(this.config.provider, error);
    }
  }

  async *stream({ messages, signal }: ChatRequest): AsyncIterable<ChatStreamPart> {
    let usage: TokenUsage | null = null;
    let finishReason: string | null = null;
    let model = this.config.model;
    try {
      const stream = await this.client.chat.completions.create(
        {
          model: this.config.model,
          messages,
          stream: true,
          stream_options: { include_usage: true },
          ...this.samplingParams(),
        },
        { signal },
      );
      for await (const chunk of stream) {
        if (chunk.model) model = chunk.model;
        if (chunk.usage) usage = toTokenUsage(chunk.usage);
        const choice = chunk.choices[0];
        if (choice?.delta.content) yield { type: 'text', text: choice.delta.content };
        if (choice?.finish_reason) finishReason = choice.finish_reason;
      }
    } catch (error) {
      throw toProviderError(this.config.provider, error);
    }
    yield { type: 'finish', usage, finishReason, model };
  }

  private samplingParams(): { temperature?: number } {
    return this.config.temperature === undefined ? {} : { temperature: this.config.temperature };
  }
}

export class OpenAICompatibleEmbeddingModel implements EmbeddingModel {
  private readonly client: OpenAI;

  constructor(private readonly config: EmbeddingModelConfig) {
    this.client = createClient(config);
  }

  get provider(): string {
    return this.config.provider;
  }

  get model(): string {
    return this.config.model;
  }

  get dimensions(): number {
    return this.config.dimensions;
  }

  async embedDocuments(texts: string[], signal?: AbortSignal): Promise<DocumentEmbeddings> {
    const vectors: number[][] = [];
    let usage: TokenUsage | null = null;
    for (let start = 0; start < texts.length; start += this.config.batchSize) {
      const batch = texts.slice(start, start + this.config.batchSize);
      const result = await this.embed(
        batch.map((text) => this.config.documentPrefix + text),
        signal,
      );
      vectors.push(...result.vectors);
      usage = addUsage(usage, result.usage);
    }
    return { vectors, usage };
  }

  async embedQuery(text: string, signal?: AbortSignal): Promise<QueryEmbedding> {
    const { vectors, usage } = await this.embed([this.config.queryPrefix + text], signal);
    const [vector] = vectors;
    if (!vector) {
      throw new AiProviderError(this.config.provider, 'Embedding response contained no vectors');
    }
    return { vector, usage };
  }

  private async embed(input: string[], signal?: AbortSignal): Promise<DocumentEmbeddings> {
    let response: OpenAI.CreateEmbeddingResponse;
    try {
      response = await this.client.embeddings.create(
        {
          model: this.config.model,
          input,
          // The SDK defaults to base64, which several OpenAI-compatible servers don't implement.
          encoding_format: 'float',
          ...(this.config.sendDimensions && { dimensions: this.config.dimensions }),
        },
        { signal },
      );
    } catch (error) {
      throw toProviderError(this.config.provider, error);
    }

    // The spec identifies rows by `index`; don't trust array order.
    const vectors = [...response.data]
      .sort((a, b) => a.index - b.index)
      .map((row) => row.embedding);
    if (vectors.length !== input.length) {
      throw new AiProviderError(
        this.config.provider,
        `Expected ${input.length} embeddings, received ${vectors.length}`,
      );
    }
    const wrongSize = vectors.find((vector) => vector.length !== this.config.dimensions);
    if (wrongSize) {
      throw new AiProviderError(
        this.config.provider,
        `Model "${this.config.model}" returned ${wrongSize.length}-dimensional vectors, but ` +
          `AI_EMBED_DIMENSIONS=${this.config.dimensions} (the database column size). Pick a model with ` +
          `${this.config.dimensions} dimensions, or set AI_EMBED_SEND_DIMENSIONS=true if it supports truncation.`,
      );
    }
    // Some compatible servers omit usage for embeddings even though the spec types it as required.
    const usage = response.usage as OpenAI.CreateEmbeddingResponse.Usage | undefined;
    return {
      vectors,
      usage: usage
        ? {
            promptTokens: usage.prompt_tokens,
            completionTokens: 0,
            totalTokens: usage.total_tokens,
          }
        : null,
    };
  }
}

function toTokenUsage(usage: OpenAI.CompletionUsage | null | undefined): TokenUsage | null {
  if (!usage) return null;
  return {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
  };
}

function addUsage(total: TokenUsage | null, next: TokenUsage | null): TokenUsage | null {
  if (!total) return next;
  if (!next) return total;
  return {
    promptTokens: total.promptTokens + next.promptTokens,
    completionTokens: total.completionTokens + next.completionTokens,
    totalTokens: total.totalTokens + next.totalTokens,
  };
}

function toProviderError(provider: string, error: unknown): Error {
  // A cancelled request (client disconnected) is not a provider failure; let callers see the abort.
  if (error instanceof OpenAI.APIUserAbortError || error instanceof AiProviderError) return error;
  if (error instanceof OpenAI.APIError) {
    const status: unknown = error.status;
    // The SDK's message already starts with the HTTP status ("400 Model x does not exist").
    return new AiProviderError(
      provider,
      `${provider} API error: ${error.message}`,
      typeof status === 'number' ? status : undefined,
      { cause: error },
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  return new AiProviderError(provider, `${provider} request failed: ${message}`, undefined, {
    cause: error,
  });
}
