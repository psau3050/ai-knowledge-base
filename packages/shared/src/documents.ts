import { z } from 'zod';

export const DOCUMENT_LIMITS = {
  titleMax: 200,
  // ~50k tokens: keeps a single synchronous indexing pass bounded in time and cost.
  contentMax: 200_000,
  tagMax: 32,
  tagsMax: 10,
} as const;

const tagSchema = z.string().trim().toLowerCase().min(1).max(DOCUMENT_LIMITS.tagMax);

const tagsSchema = z
  .array(tagSchema)
  .max(DOCUMENT_LIMITS.tagsMax)
  .transform((tags) => [...new Set(tags)]);

const documentFields = {
  title: z.string().trim().min(1).max(DOCUMENT_LIMITS.titleMax),
  content: z.string().max(DOCUMENT_LIMITS.contentMax),
  tags: tagsSchema,
};

export const createDocumentSchema = z.object({
  ...documentFields,
  tags: tagsSchema.default([]),
});
export type CreateDocumentInput = z.input<typeof createDocumentSchema>;

export const updateDocumentSchema = z
  .object(documentFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' });
export type UpdateDocumentInput = z.input<typeof updateDocumentSchema>;

export const listDocumentsQuerySchema = z.object({
  search: z.string().trim().max(DOCUMENT_LIMITS.titleMax).optional(),
  tag: tagSchema.optional(),
});
export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;

/**
 * `pending → indexing → ready | failed` are stored in the database.
 * `stale` is computed by the API: the chunks were embedded with a model other than the one configured now,
 * so they are invisible to search until the document is re-indexed.
 */
export type IndexStatus = 'pending' | 'indexing' | 'ready' | 'failed' | 'stale';

export interface DocumentSummary {
  id: string;
  title: string;
  tags: string[];
  indexStatus: IndexStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentDetail extends DocumentSummary {
  content: string;
  indexError: string | null;
  indexedAt: string | null;
  embeddingModel: string | null;
  chunkCount: number;
}
