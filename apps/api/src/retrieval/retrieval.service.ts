import { Inject, Injectable } from '@nestjs/common';
import { EMBEDDING_MODEL, type EmbeddingModel } from '../ai/ai.types.js';
import type { UserContext } from '../auth/user-context.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { toHttpError } from '../supabase/db-error.js';
import { UsageService } from '../usage/usage.service.js';

export interface RetrievedChunk {
  chunkId: number;
  documentId: string;
  documentTitle: string;
  heading: string | null;
  content: string;
  /** Cosine similarity to the query embedding. */
  similarity: number;
  /** Reciprocal Rank Fusion score across the semantic and lexical rankings. */
  score: number;
}

@Injectable()
export class RetrievalService {
  constructor(
    @Inject(EMBEDDING_MODEL) private readonly embeddings: EmbeddingModel,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly usage: UsageService,
  ) {}

  /** Hybrid search over the caller's chunks (RLS scopes `match_chunks` to them). */
  async search(ctx: UserContext, query: string, signal?: AbortSignal): Promise<RetrievedChunk[]> {
    const { vector, usage } = await this.embeddings.embedQuery(query, signal);
    await this.usage.record(ctx, 'embed_query', this.embeddings, usage);

    const { data, error } = await ctx.db.rpc('match_chunks', {
      query_embedding: JSON.stringify(vector),
      query_text: query,
      model: this.embeddings.model,
      match_count: this.config.rag.topK,
    });
    if (error) throw toHttpError(error);

    return data
      .filter((row) => row.similarity >= this.config.rag.minSimilarity)
      .map((row) => ({
        chunkId: row.chunk_id,
        documentId: row.document_id,
        documentTitle: row.document_title,
        heading: row.heading,
        content: row.content,
        similarity: row.similarity,
        score: row.score,
      }));
  }
}
