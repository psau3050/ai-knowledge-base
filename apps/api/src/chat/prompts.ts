import type { ChatTurn } from '../ai/ai.types.js';
import type { RetrievedChunk } from '../retrieval/retrieval.service.js';

const ANSWER_INSTRUCTIONS = `You answer questions using the user's own documents.

Rules:
- Use only the numbered sources below. Do not use outside knowledge.
- After each statement, cite the sources that support it with their numbers in square brackets, e.g. [1] or [2][3].
- If the sources do not contain the answer, say you could not find it in the documents. Do not guess.
- Answer in the language of the question. Be concise; use Markdown lists or code blocks when they help.`;

// Repeated right after the question: small models weigh the last instruction most, and a system prompt
// alone did not stop one of them from answering an English question in Korean.
const ANSWER_REMINDER =
  'Answer from the numbered sources only, cite them like [1], and reply in the same language as my question.';

const CONDENSE_INSTRUCTIONS = `Rewrite the user's latest message as a standalone search query for their document collection.
Resolve pronouns and references ("it", "that section", "the second one") using the conversation.
Keep the user's language and key terms. Reply with the query only, without quotes or explanations.`;

const HISTORY_EXCERPT_CHARS = 600;

/**
 * Sources are numbered so the model can cite them and the API can map `[n]` back to a chunk.
 * Each source carries its document title and section, which also helps the model judge relevance.
 */
export function buildAnswerMessages(
  history: ChatTurn[],
  question: string,
  chunks: RetrievedChunk[],
): ChatTurn[] {
  const sources =
    chunks.length > 0
      ? chunks
          .map((chunk, i) => {
            const location = chunk.heading
              ? `${chunk.documentTitle} › ${chunk.heading}`
              : chunk.documentTitle;
            return `[${i + 1}] ${location}\n${chunk.content}`;
          })
          .join('\n\n')
      : 'No relevant passages were found in the documents.';

  return [
    { role: 'system', content: `${ANSWER_INSTRUCTIONS}\n\nSources:\n\n${sources}` },
    ...history,
    { role: 'user', content: `${question}\n\n(${ANSWER_REMINDER})` },
  ];
}

/**
 * Follow-ups like "and how do I reset it?" retrieve nothing useful on their own, so they are rewritten
 * into a standalone query using the conversation before searching.
 */
export function buildCondenseMessages(history: ChatTurn[], question: string): ChatTurn[] {
  const transcript = history
    .map((turn) => `${turn.role === 'user' ? 'User' : 'Assistant'}: ${excerpt(turn.content)}`)
    .join('\n');
  return [
    { role: 'system', content: CONDENSE_INSTRUCTIONS },
    { role: 'user', content: `Conversation:\n${transcript}\n\nLatest message: ${question}` },
  ];
}

function excerpt(text: string): string {
  return text.length > HISTORY_EXCERPT_CHARS ? `${text.slice(0, HISTORY_EXCERPT_CHARS)}…` : text;
}
