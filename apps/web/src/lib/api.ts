import {
  readSseEvents,
  type AiMeta,
  type ApiErrorBody,
  type ChatStreamEvent,
  type Conversation,
  type ConversationDetail,
  type CreateDocumentInput,
  type DocumentDetail,
  type DocumentSummary,
  type ListDocumentsQuery,
  type UpdateDocumentInput,
  type UsageSummary,
} from '@kb/shared';
import { env } from './env';
import { createClient } from './supabase';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function accessToken(): Promise<string> {
  // getSession refreshes an expired access token using the refresh token in the cookie.
  const { data } = await createClient().auth.getSession();
  if (!data.session)
    throw new ApiError(401, 'unauthorized', 'Your session has ended. Sign in again.');
  return data.session.access_token;
}

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${await accessToken()}`);
  const response = await fetch(`${env.apiUrl}${path}`, { ...init, headers });
  if (!response.ok) throw await toApiError(response);
  return response;
}

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const { error } = (await response.json()) as ApiErrorBody;
    return new ApiError(response.status, error.code, error.message);
  } catch {
    return new ApiError(response.status, 'http_error', `Request failed (${response.status})`);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init);
  return (response.status === 204 ? undefined : await response.json()) as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

function queryString(query: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

/** Typed client for the NestJS API; request and response shapes come from @kb/shared. */
export const api = {
  aiMeta: () => request<AiMeta>('/ai/meta'),

  documents: {
    list: (query: ListDocumentsQuery) =>
      request<DocumentSummary[]>(`/documents${queryString(query)}`),
    get: (id: string) => request<DocumentDetail>(`/documents/${id}`),
    create: (input: CreateDocumentInput) =>
      request<DocumentDetail>('/documents', json('POST', input)),
    update: (id: string, input: UpdateDocumentInput) =>
      request<DocumentDetail>(`/documents/${id}`, json('PATCH', input)),
    remove: (id: string) => request<void>(`/documents/${id}`, { method: 'DELETE' }),
    reindex: (id: string) =>
      request<DocumentDetail>(`/documents/${id}/reindex`, { method: 'POST' }),
    reindexOutdated: () => request<{ reindexed: number }>('/documents/reindex', { method: 'POST' }),
    upload: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return request<DocumentDetail>('/documents/upload', { method: 'POST', body: form });
    },
  },

  conversations: {
    list: () => request<Conversation[]>('/conversations'),
    get: (id: string) => request<ConversationDetail>(`/conversations/${id}`),
    create: () => request<Conversation>('/conversations', json('POST', {})),
    rename: (id: string, title: string) =>
      request<Conversation>(`/conversations/${id}`, json('PATCH', { title })),
    remove: (id: string) => request<void>(`/conversations/${id}`, { method: 'DELETE' }),
    /** Sends a question and yields the streamed answer events. */
    async *send(id: string, content: string, signal: AbortSignal): AsyncGenerator<ChatStreamEvent> {
      const response = await apiFetch(`/conversations/${id}/messages`, {
        ...json('POST', { content }),
        signal,
      });
      if (!response.body) throw new ApiError(500, 'no_stream', 'The server returned no stream');
      yield* readSseEvents<ChatStreamEvent>(response.body);
    },
  },

  usage: (days: number) => request<UsageSummary>(`/usage?days=${days}`),
};
