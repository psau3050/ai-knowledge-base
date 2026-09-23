import { describe, expect, it } from 'vitest';
import type { RetrievedChunk } from '../retrieval/retrieval.service.js';
import { buildAnswerMessages } from './prompts.js';

const chunk = (overrides: Partial<RetrievedChunk>): RetrievedChunk => ({
  chunkId: 1,
  documentId: 'doc',
  documentTitle: 'Handbook',
  heading: null,
  content: 'Everyone gets 28 days of paid vacation.',
  similarity: 0.8,
  score: 0.03,
  ...overrides,
});

describe('buildAnswerMessages', () => {
  it('numbers the sources with their document and section so answers can cite them', () => {
    const [system] = buildAnswerMessages([], 'How much vacation?', [
      chunk({ heading: 'Time off' }),
      chunk({ chunkId: 2, documentTitle: 'FAQ', content: 'Team costs 49 USD.' }),
    ]);

    expect(system?.role).toBe('system');
    expect(system?.content).toContain(
      '[1] Handbook › Time off\nEveryone gets 28 days of paid vacation.',
    );
    expect(system?.content).toContain('[2] FAQ\nTeam costs 49 USD.');
  });

  it('keeps history in order and ends with the question plus a reminder of the rules', () => {
    const history = [
      { role: 'user' as const, content: 'Hi' },
      { role: 'assistant' as const, content: 'Hello [1]' },
    ];

    const messages = buildAnswerMessages(history, 'How much vacation?', [chunk({})]);

    expect(messages.slice(1, 3)).toEqual(history);
    const last = messages.at(-1);
    expect(last?.role).toBe('user');
    expect(last?.content).toMatch(/^How much vacation\?\n\n\(.*same language as my question\.\)$/);
  });

  it('tells the model when nothing relevant was retrieved', () => {
    const [system] = buildAnswerMessages([], 'Office address?', []);

    expect(system?.content).toContain('No relevant passages were found in the documents.');
  });
});
