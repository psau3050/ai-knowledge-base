import {
  createDocumentSchema,
  type DocumentDetail,
  type DocumentSummary,
  type IndexStatus,
  type ListDocumentsQuery,
  type updateDocumentSchema,
} from '@kb/shared';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { z } from 'zod';
import { EMBEDDING_MODEL, type EmbeddingModel } from '../ai/ai.types.js';
import type { UserContext } from '../auth/user-context.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { IngestionService } from '../ingestion/ingestion.service.js';
import type { Database } from '../supabase/database.types.js';
import { toHttpError } from '../supabase/db-error.js';
import { extractUploadedText } from './text-extraction.js';

type CreateDocument = z.output<typeof createDocumentSchema>;
type UpdateDocument = z.output<typeof updateDocumentSchema>;
type DocumentRow = Database['public']['Tables']['documents']['Row'];

@Injectable()
export class DocumentsService {
  constructor(
    private readonly ingestion: IngestionService,
    @Inject(EMBEDDING_MODEL) private readonly embeddings: EmbeddingModel,
  ) {}

  async list(ctx: UserContext, query: ListDocumentsQuery): Promise<DocumentSummary[]> {
    let request = ctx.db
      .from('documents')
      .select('id, title, tags, index_status, embedding_model, created_at, updated_at')
      .order('updated_at', { ascending: false });
    if (query.search) request = request.ilike('title', `%${escapeLike(query.search)}%`);
    if (query.tag) request = request.contains('tags', [query.tag]);

    const { data, error } = await request;
    if (error) throw toHttpError(error);
    return data.map((row) => this.toSummary(row));
  }

  async get(ctx: UserContext, id: string): Promise<DocumentDetail> {
    const { data, error } = await ctx.db
      .from('documents')
      .select(
        'id, title, content, tags, index_status, index_error, indexed_at, embedding_model, created_at, updated_at, document_chunks(count)',
      )
      .eq('id', id)
      .single();
    if (error) throw toHttpError(error, 'Document not found');

    return {
      ...this.toSummary(data),
      content: data.content,
      indexError: data.index_error,
      indexedAt: data.indexed_at,
      embeddingModel: data.embedding_model,
      chunkCount: data.document_chunks[0]?.count ?? 0,
    };
  }

  async create(ctx: UserContext, input: CreateDocument): Promise<DocumentDetail> {
    const { data, error } = await ctx.db.from('documents').insert(input).select('id').single();
    if (error) throw toHttpError(error);
    await this.ingestion.indexDocument(ctx, data.id);
    return this.get(ctx, data.id);
  }

  async createFromFile(
    ctx: UserContext,
    file: { originalname: string; buffer: Buffer },
  ): Promise<DocumentDetail> {
    const extracted = await extractUploadedText(file);
    // Same limits as a document typed into the editor.
    const input = new ZodValidationPipe(createDocumentSchema).transform({
      ...extracted,
      title: extracted.title.slice(0, 200),
    });
    return this.create(ctx, input);
  }

  async update(ctx: UserContext, id: string, input: UpdateDocument): Promise<DocumentDetail> {
    const { data, error } = await ctx.db
      .from('documents')
      .update(input)
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (error) throw toHttpError(error);
    if (!data) throw new NotFoundException('Document not found');

    // A no-op when only tags changed: the content hash, and therefore the chunks, stay the same.
    await this.ingestion.indexDocument(ctx, id);
    return this.get(ctx, id);
  }

  async remove(ctx: UserContext, id: string): Promise<void> {
    const { count, error } = await ctx.db.from('documents').delete({ count: 'exact' }).eq('id', id);
    if (error) throw toHttpError(error);
    if (!count) throw new NotFoundException('Document not found');
  }

  async reindex(ctx: UserContext, id: string): Promise<DocumentDetail> {
    await this.ingestion.indexDocument(ctx, id, { force: true });
    return this.get(ctx, id);
  }

  /** Re-embeds every document the current model can't search: after a provider swap, or a failed run. */
  async reindexOutdated(ctx: UserContext): Promise<{ reindexed: number }> {
    const { data, error } = await ctx.db
      .from('documents')
      .select('id, index_status, embedding_model');
    if (error) throw toHttpError(error);

    const outdated = data.filter((row) => this.indexStatus(row) !== 'ready');
    // Sequential on purpose: bursts of parallel embedding calls hit provider rate limits.
    for (const row of outdated) await this.ingestion.indexDocument(ctx, row.id);
    return { reindexed: outdated.length };
  }

  private toSummary(
    row: Pick<
      DocumentRow,
      'id' | 'title' | 'tags' | 'index_status' | 'embedding_model' | 'created_at' | 'updated_at'
    >,
  ): DocumentSummary {
    return {
      id: row.id,
      title: row.title,
      tags: row.tags,
      indexStatus: this.indexStatus(row),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /** `stale`: indexed, but by a model other than the configured one, so search can't see it. */
  private indexStatus(row: Pick<DocumentRow, 'index_status' | 'embedding_model'>): IndexStatus {
    if (row.index_status === 'ready' && row.embedding_model !== this.embeddings.model)
      return 'stale';
    return row.index_status;
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
