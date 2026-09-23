import { z } from 'zod';

export type UsageKind = 'chat' | 'condense' | 'embed_documents' | 'embed_query';

export const usageQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});
export type UsageQuery = z.input<typeof usageQuerySchema>;

export interface UsageRow {
  day: string;
  kind: UsageKind;
  model: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface UsageSummary {
  rows: UsageRow[];
  totals: Pick<UsageRow, 'requests' | 'promptTokens' | 'completionTokens' | 'totalTokens'>;
}

/** Which providers the API is currently wired to (never includes secrets). */
export interface AiMeta {
  chat: { provider: string; model: string };
  embeddings: { provider: string; model: string; dimensions: number };
}
