import type { ChatStreamEvent, TokenUsage } from '@kb/shared';
import { Inject, Injectable } from '@nestjs/common';
import { CHAT_MODEL, type ChatModel, type ChatTurn } from '../ai/ai.types.js';
import type { UserContext } from '../auth/user-context.js';
import { RetrievalService } from '../retrieval/retrieval.service.js';
import { UsageService } from '../usage/usage.service.js';
import { markCited, toCitations } from './citations.js';
import { ConversationsService } from './conversations.service.js';
import { buildAnswerMessages, buildCondenseMessages } from './prompts.js';

/** Messages of history sent with each question: enough for follow-ups, bounded in tokens. */
const HISTORY_MESSAGES = 8;
const TITLE_CHARS = 60;
const MAX_QUERY_CHARS = 500;

@Injectable()
export class ChatService {
  constructor(
    @Inject(CHAT_MODEL) private readonly chat: ChatModel,
    private readonly retrieval: RetrievalService,
    private readonly conversations: ConversationsService,
    private readonly usage: UsageService,
  ) {}

  /**
   * One RAG turn: save the question → rewrite it into a standalone query → retrieve → stream a grounded
   * answer → save the answer with its citations. Yields the events of the SSE response.
   */
  async *reply(
    ctx: UserContext,
    conversationId: string,
    question: string,
    signal: AbortSignal,
  ): AsyncGenerator<ChatStreamEvent> {
    const history = await this.conversations.recentTurns(ctx, conversationId, HISTORY_MESSAGES);
    await this.conversations.addMessage(ctx, conversationId, { role: 'user', content: question });
    if (history.length === 0) {
      await this.conversations.rename(ctx, conversationId, titleFrom(question));
    }

    const query =
      history.length > 0 ? await this.standaloneQuery(ctx, history, question, signal) : question;
    const chunks = await this.retrieval.search(ctx, query, signal);
    const citations = toCitations(chunks);
    yield { type: 'sources', citations };

    let answer = '';
    let usage: TokenUsage | null = null;
    let model = this.chat.model;
    const messages = buildAnswerMessages(history, question, chunks);
    for await (const part of this.chat.stream({ messages, signal })) {
      if (part.type === 'text') {
        answer += part.text;
        yield { type: 'delta', text: part.text };
      } else {
        usage = part.usage;
        model = part.model;
      }
    }
    await this.usage.record(ctx, 'chat', { provider: this.chat.provider, model }, usage);

    const message = await this.conversations.addMessage(ctx, conversationId, {
      role: 'assistant',
      content: answer,
      citations: markCited(citations, answer),
      retrievalQuery: query,
      model,
    });
    yield { type: 'done', message, usage };
  }

  private async standaloneQuery(
    ctx: UserContext,
    history: ChatTurn[],
    question: string,
    signal: AbortSignal,
  ): Promise<string> {
    const { text, usage, model } = await this.chat.complete({
      messages: buildCondenseMessages(history, question),
      signal,
    });
    await this.usage.record(ctx, 'condense', { provider: this.chat.provider, model }, usage);
    const query = text.trim().replace(/^["'«]+|["'»]+$/g, '');
    // A rewrite that came back empty or rambling is worse than the raw question.
    return query && query.length <= MAX_QUERY_CHARS ? query : question;
  }
}

function titleFrom(question: string): string {
  const firstLine = question.split('\n')[0]?.trim() ?? question;
  return firstLine.length > TITLE_CHARS ? `${firstLine.slice(0, TITLE_CHARS - 1)}…` : firstLine;
}
