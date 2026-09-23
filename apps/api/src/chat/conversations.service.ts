import type {
  ChatMessage,
  Citation,
  Conversation,
  ConversationDetail,
  MessageRole,
} from '@kb/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { ChatTurn } from '../ai/ai.types.js';
import type { UserContext } from '../auth/user-context.js';
import type { Database } from '../supabase/database.types.js';
import { toHttpError } from '../supabase/db-error.js';

type Tables = Database['public']['Tables'];
type ConversationRow = Pick<
  Tables['conversations']['Row'],
  'id' | 'title' | 'created_at' | 'updated_at'
>;
type MessageRow = Pick<
  Tables['messages']['Row'],
  'id' | 'role' | 'content' | 'citations' | 'created_at'
>;

const CONVERSATION_COLUMNS = 'id, title, created_at, updated_at';
const MESSAGE_COLUMNS = 'id, role, content, citations, created_at';

export interface NewMessage {
  role: MessageRole;
  content: string;
  citations?: Citation[];
  retrievalQuery?: string;
  model?: string;
}

@Injectable()
export class ConversationsService {
  async list(ctx: UserContext): Promise<Conversation[]> {
    const { data, error } = await ctx.db
      .from('conversations')
      .select(CONVERSATION_COLUMNS)
      .order('updated_at', { ascending: false });
    if (error) throw toHttpError(error);
    return data.map(toConversation);
  }

  async create(ctx: UserContext, title?: string): Promise<Conversation> {
    const { data, error } = await ctx.db
      .from('conversations')
      .insert(title ? { title } : {})
      .select(CONVERSATION_COLUMNS)
      .single();
    if (error) throw toHttpError(error);
    return toConversation(data);
  }

  async get(ctx: UserContext, id: string): Promise<ConversationDetail> {
    const [conversation, messages] = await Promise.all([
      ctx.db.from('conversations').select(CONVERSATION_COLUMNS).eq('id', id).single(),
      ctx.db
        .from('messages')
        .select(MESSAGE_COLUMNS)
        .eq('conversation_id', id)
        .order('created_at', { ascending: true }),
    ]);
    if (conversation.error) throw toHttpError(conversation.error, 'Conversation not found');
    if (messages.error) throw toHttpError(messages.error);
    return { ...toConversation(conversation.data), messages: messages.data.map(toMessage) };
  }

  async assertExists(ctx: UserContext, id: string): Promise<void> {
    const { error } = await ctx.db.from('conversations').select('id').eq('id', id).single();
    if (error) throw toHttpError(error, 'Conversation not found');
  }

  async rename(ctx: UserContext, id: string, title: string): Promise<Conversation> {
    const { data, error } = await ctx.db
      .from('conversations')
      .update({ title })
      .eq('id', id)
      .select(CONVERSATION_COLUMNS)
      .maybeSingle();
    if (error) throw toHttpError(error);
    if (!data) throw new NotFoundException('Conversation not found');
    return toConversation(data);
  }

  async remove(ctx: UserContext, id: string): Promise<void> {
    const { count, error } = await ctx.db
      .from('conversations')
      .delete({ count: 'exact' })
      .eq('id', id);
    if (error) throw toHttpError(error);
    if (!count) throw new NotFoundException('Conversation not found');
  }

  /** The last `limit` messages, oldest first, in the shape the chat model expects. */
  async recentTurns(ctx: UserContext, id: string, limit: number): Promise<ChatTurn[]> {
    const { data, error } = await ctx.db
      .from('messages')
      .select('role, content')
      .eq('conversation_id', id)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw toHttpError(error);
    return data.reverse().map((row) => ({ role: row.role, content: row.content }));
  }

  async addMessage(
    ctx: UserContext,
    conversationId: string,
    message: NewMessage,
  ): Promise<ChatMessage> {
    const { data, error } = await ctx.db
      .from('messages')
      .insert({
        conversation_id: conversationId,
        role: message.role,
        content: message.content,
        citations: message.citations ?? [],
        retrieval_query: message.retrievalQuery ?? null,
        model: message.model ?? null,
      })
      .select(MESSAGE_COLUMNS)
      .single();
    if (error) throw toHttpError(error);
    return toMessage(data);
  }
}

function toConversation(row: ConversationRow): Conversation {
  return { id: row.id, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at };
}

function toMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    // Only this service writes the column, always from a Citation[].
    citations: row.citations as unknown as Citation[],
    createdAt: row.created_at,
  };
}
