import type { Citation } from '@kb/shared';
import type { RetrievedChunk } from '../retrieval/retrieval.service.js';

/** Source `[n]` in the prompt is `citations[n - 1]`. */
export function toCitations(chunks: RetrievedChunk[]): Citation[] {
  return chunks.map((chunk, i) => ({
    index: i + 1,
    chunkId: chunk.chunkId,
    documentId: chunk.documentId,
    documentTitle: chunk.documentTitle,
    heading: chunk.heading,
    snippet: chunk.content,
    score: chunk.score,
    cited: false,
  }));
}

// [2], [1][3] and [1, 3] all count.
const CITATION = /\[(\d+(?:\s*,\s*\d+)*)\]/g;

/** Flags the sources the answer actually references, so the UI can separate them from the rest. */
export function markCited(citations: Citation[], answer: string): Citation[] {
  const cited = new Set<number>();
  for (const [, numbers] of answer.matchAll(CITATION)) {
    for (const n of numbers?.split(',') ?? []) cited.add(Number(n.trim()));
  }
  return citations.map((citation) => ({ ...citation, cited: cited.has(citation.index) }));
}
