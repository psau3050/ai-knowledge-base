import { describe, expect, it } from 'vitest';
import { chunkDocument, estimateTokens, takeOverlap, type Unit } from './chunker.js';

const options = { maxTokens: 100, overlapTokens: 20 };

/** A paragraph of roughly `tokens` estimated tokens made of distinct numbered sentences. */
function paragraph(id: string, tokens: number): string {
  const sentences: string[] = [];
  for (let i = 0; estimateTokens(sentences.join(' ')) < tokens; i++) {
    sentences.push(`Fact ${id}${i} is here.`);
  }
  return sentences.join(' ');
}

const unit = (text: string, tokens: number): Unit => ({ text, tokens, separator: ' ' });

describe('chunkDocument', () => {
  it('returns nothing for an empty document', () => {
    expect(chunkDocument({ title: 'Empty', content: '  \n\n ' })).toEqual([]);
  });

  it('keeps a short document in one chunk and prefixes the title for embedding', () => {
    const [chunk, ...rest] = chunkDocument({ title: 'Notes', content: 'Supabase uses Postgres.' });

    expect(rest).toEqual([]);
    expect(chunk).toMatchObject({
      index: 0,
      heading: null,
      content: 'Supabase uses Postgres.',
      embeddingText: 'Notes\n\nSupabase uses Postgres.',
    });
  });

  it('never crosses a heading and records the heading path', () => {
    const content = [
      '# Setup',
      'Install pnpm.',
      '## Database',
      'Run supabase start.',
      '# Usage',
      'Open the app.',
    ].join('\n');

    const chunks = chunkDocument({ title: 'Guide', content });

    expect(chunks.map((c) => [c.heading, c.content])).toEqual([
      ['Setup', 'Install pnpm.'],
      ['Setup › Database', 'Run supabase start.'],
      ['Usage', 'Open the app.'],
    ]);
    expect(chunks[1]?.embeddingText).toBe('Guide › Setup › Database\n\nRun supabase start.');
  });

  it('keeps fenced code intact and ignores headings inside it', () => {
    const code = '```bash\n# not a heading\npnpm install\n```';

    const chunks = chunkDocument({ title: 'Code', content: `# Install\n\n${code}` });

    expect(chunks.map((c) => c.content)).toEqual([code]);
  });

  it('splits long sections so every chunk respects the token budget', () => {
    const content = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => paragraph(id, 45)).join('\n\n');

    const chunks = chunkDocument({ title: 'Long', content }, options);

    expect(chunks.length).toBeGreaterThan(2);
    for (const chunk of chunks) {
      expect(estimateTokens(chunk.content)).toBeLessThanOrEqual(options.maxTokens + 2);
    }
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
  });

  it('splits an oversized paragraph at sentence boundaries', () => {
    const chunks = chunkDocument({ title: 'Wall', content: paragraph('x', 250) }, options);

    expect(chunks.length).toBeGreaterThan(2);
    for (const chunk of chunks) expect(chunk.content).toMatch(/\.$/);
  });

  it('repeats the tail of the previous chunk at the start of the next one', () => {
    const chunks = chunkDocument({ title: 'Wall', content: paragraph('x', 250) }, options);

    const sentences = (text = '') => text.split(/(?<=\.)\s/);
    for (let i = 1; i < chunks.length; i++) {
      const previousLast = sentences(chunks[i - 1]?.content).at(-1);
      expect(sentences(chunks[i]?.content)).toContain(previousLast);
    }
  });
});

describe('takeOverlap', () => {
  const units = [unit('A', 10), unit('B', 8), unit('C', 6), unit('D', 5)];

  it('returns trailing units in document order within the budget', () => {
    expect(takeOverlap(units, 12).map((u) => u.text)).toEqual(['C', 'D']);
  });

  it('never exceeds the budget', () => {
    for (const budget of [0, 4, 5, 11, 19, 20, 100]) {
      const total = takeOverlap(units, budget).reduce((sum, u) => sum + u.tokens, 0);
      expect(total).toBeLessThanOrEqual(budget);
    }
  });

  it('returns nothing when the budget is zero', () => {
    expect(takeOverlap(units, 0)).toEqual([]);
  });
});
