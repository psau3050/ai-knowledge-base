import type { TokenUsage } from '@kb/shared';

/**
 * The application depends only on these two interfaces. Chat and embeddings are separate because
 * providers are not symmetric: Groq serves chat but no embeddings, a local Ollama may serve only embeddings.
 */

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatTurn {
  role: ChatRole;
  content: string;
}

export interface ChatRequest {
  messages: ChatTurn[];
  signal?: AbortSignal;
}

export interface ChatCompletion {
  text: string;
  usage: TokenUsage | null;
  /** The model that actually answered; differs from the configured one behind routers. */
  model: string;
}

export type ChatStreamPart =
  | { type: 'text'; text: string }
  | { type: 'finish'; usage: TokenUsage | null; finishReason: string | null; model: string };

export interface ChatModel {
  readonly provider: string;
  readonly model: string;
  complete(request: ChatRequest): Promise<ChatCompletion>;
  stream(request: ChatRequest): AsyncIterable<ChatStreamPart>;
}

export interface DocumentEmbeddings {
  vectors: number[][];
  usage: TokenUsage | null;
}

export interface QueryEmbedding {
  vector: number[];
  usage: TokenUsage | null;
}

export interface EmbeddingModel {
  readonly provider: string;
  readonly model: string;
  /** Length of every returned vector; must match the `vector(n)` column in the database. */
  readonly dimensions: number;
  /** Embeds passages for storage. */
  embedDocuments(texts: string[], signal?: AbortSignal): Promise<DocumentEmbeddings>;
  /** Embeds a search query. Asymmetric models (nomic, e5, bge) expect a different prefix than for passages. */
  embedQuery(text: string, signal?: AbortSignal): Promise<QueryEmbedding>;
}

export const CHAT_MODEL = Symbol('CHAT_MODEL');
export const EMBEDDING_MODEL = Symbol('EMBEDDING_MODEL');
