import { Inject, Injectable, Logger } from '@nestjs/common';
import { EMBEDDING_MODEL, type EmbeddingModel } from '../ai/ai.types.js';
import type { UserContext } from '../auth/user-context.js';
import { toHttpError } from '../supabase/db-error.js';
import { UsageService } from '../usage/usage.service.js';
import { chunkDocument } from './chunker.js';

interface IndexableDocument {
  id: string;
  content_hash: string;
}

/**
 * chunk → embed → store. Runs synchronously inside the request that saved the document, but the
 * document is saved first and indexing only moves `index_status`, so a provider outage never loses a
 * user's text. Idempotent and guarded by the content hash, which makes moving this onto a durable queue
 * a transport change rather than a redesign.
 */
@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    @Inject(EMBEDDING_MODEL) private readonly embeddings: EmbeddingModel,
    private readonly usage: UsageService,
  ) {}

  async indexDocument(
    ctx: UserContext,
    documentId: string,
    { force = false }: { force?: boolean } = {},
  ): Promise<void> {
    const { data: doc, error } = await ctx.db
      .from('documents')
      .select('id, title, content, content_hash, indexed_hash, embedding_model, index_status')
      .eq('id', documentId)
      .single();
    if (error) throw toHttpError(error, 'Document not found');

    const upToDate =
      doc.index_status === 'ready' &&
      doc.indexed_hash === doc.content_hash &&
      doc.embedding_model === this.embeddings.model;
    if (upToDate && !force) return;

    await this.setStatus(ctx, doc, 'indexing', null);
    try {
      const chunks = chunkDocument({ title: doc.title, content: doc.content });
      const { vectors, usage } =
        chunks.length > 0
          ? await this.embeddings.embedDocuments(chunks.map((chunk) => chunk.embeddingText))
          : { vectors: [], usage: null };
      if (chunks.length > 0)
        await this.usage.record(ctx, 'embed_documents', this.embeddings, usage);

      const { data: applied, error: rpcError } = await ctx.db.rpc('replace_document_chunks', {
        p_document_id: doc.id,
        p_content_hash: doc.content_hash,
        p_embedding_model: this.embeddings.model,
        p_chunks: chunks.map((chunk, i) => ({
          chunk_index: chunk.index,
          heading: chunk.heading,
          content: chunk.content,
          token_count: chunk.tokenCount,
          embedding: vectors[i] ?? null,
        })),
      });
      if (rpcError) throw toHttpError(rpcError);
      if (!applied)
        this.logger.log(`Document ${doc.id} changed while indexing; the newer run wins`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Indexing failed';
      this.logger.warn(`Indexing document ${doc.id} failed: ${message}`);
      // Not rethrown: the document is saved; the failure is visible on it and can be retried.
      await this.setStatus(ctx, doc, 'failed', message);
    }
  }

  /** Guarded by the content hash so a stale run can't overwrite the status of a newer edit. */
  private async setStatus(
    ctx: UserContext,
    doc: IndexableDocument,
    status: 'indexing' | 'failed',
    indexError: string | null,
  ): Promise<void> {
    const { error } = await ctx.db
      .from('documents')
      .update({ index_status: status, index_error: indexError })
      .eq('id', doc.id)
      .eq('content_hash', doc.content_hash);
    if (error) throw toHttpError(error);
  }
}
