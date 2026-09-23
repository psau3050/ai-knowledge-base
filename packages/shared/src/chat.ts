import { z } from 'zod';

export const CHAT_LIMITS = {
  messageMax: 4000,
  titleMax: 120,
} as const;

export const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(CHAT_LIMITS.titleMax).optional(),
});
export type CreateConversationInput = z.input<typeof createConversationSchema>;

export const renameConversationSchema = z.object({
  title: z.string().trim().min(1).max(CHAT_LIMITS.titleMax),
});
export type RenameConversationInput = z.input<typeof renameConversationSchema>;

export const sendMessageSchema = z.object({
  content: z.string().trim().min(1).max(CHAT_LIMITS.messageMax),
});
export type SendMessageInput = z.input<typeof sendMessageSchema>;

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * A retrieved chunk shown to the model as source `[index]`.
 * A type alias (not an interface) so it stays assignable to a JSON column type.
 */
export type Citation = {
  index: number;
  chunkId: number;
  documentId: string;
  documentTitle: string;
  heading: string | null;
  snippet: string;
  score: number;
  /** True when the answer actually references `[index]`. */
  cited: boolean;
};

export type MessageRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  citations: Citation[];
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationDetail extends Conversation {
  messages: ChatMessage[];
}

/** Events streamed by `POST /conversations/:id/messages` (one JSON object per SSE `data:` line). */
export type ChatStreamEvent =
  | { type: 'sources'; citations: Citation[] }
  | { type: 'delta'; text: string }
  | { type: 'done'; message: ChatMessage; usage: TokenUsage | null }
  | { type: 'error'; message: string };
