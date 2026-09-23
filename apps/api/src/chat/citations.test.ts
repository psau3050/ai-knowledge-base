import type { Citation } from '@kb/shared';
import { describe, expect, it } from 'vitest';
import { markCited } from './citations.js';

const citation = (index: number): Citation => ({
  index,
  chunkId: index,
  documentId: 'doc',
  documentTitle: 'Doc',
  heading: null,
  snippet: '',
  score: 0,
  cited: false,
});

describe('markCited', () => {
  const sources = [1, 2, 3, 4].map(citation);

  it('flags every citation style the model uses', () => {
    const answer = 'Postgres [1]. Supabase adds auth [2][3], and RLS [1, 4].';

    expect(markCited(sources, answer).map((c) => c.cited)).toEqual([true, true, true, true]);
  });

  it('ignores numbers that are not citations', () => {
    const answer = 'Use port 54321 and see [2]. Arrays like [a, b] are not sources.';

    expect(markCited(sources, answer).map((c) => c.cited)).toEqual([false, true, false, false]);
  });
});
