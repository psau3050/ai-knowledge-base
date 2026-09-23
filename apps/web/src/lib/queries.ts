'use client';

import type {
  CreateDocumentInput,
  DocumentDetail,
  ListDocumentsQuery,
  UpdateDocumentInput,
} from '@kb/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

/** Server state lives in TanStack Query; these keys are the only cache vocabulary in the app. */
export const queryKeys = {
  aiMeta: ['ai-meta'] as const,
  documents: ['documents'] as const,
  documentList: (query: ListDocumentsQuery) => ['documents', 'list', query] as const,
  document: (id: string) => ['documents', 'detail', id] as const,
  conversations: ['conversations'] as const,
  conversation: (id: string) => ['conversations', 'detail', id] as const,
  usage: (days: number) => ['usage', days] as const,
};

export const useAiMeta = () =>
  useQuery({ queryKey: queryKeys.aiMeta, queryFn: api.aiMeta, staleTime: Infinity });

export const useDocuments = (query: ListDocumentsQuery) =>
  useQuery({
    queryKey: queryKeys.documentList(query),
    queryFn: () => api.documents.list(query),
    // Keep showing the current list while a new search loads instead of flashing a spinner.
    placeholderData: keepPreviousData,
  });

export const useDocument = (id: string) =>
  useQuery({ queryKey: queryKeys.document(id), queryFn: () => api.documents.get(id) });

/** After any write, the saved document is cached directly and every list refetches. */
function useDocumentWrite<TArgs>(write: (args: TArgs) => Promise<DocumentDetail>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: write,
    onSuccess: (document) => {
      queryClient.setQueryData(queryKeys.document(document.id), document);
      return queryClient.invalidateQueries({ queryKey: queryKeys.documents });
    },
  });
}

export const useCreateDocument = () =>
  useDocumentWrite((input: CreateDocumentInput) => api.documents.create(input));

export const useUpdateDocument = (id: string) =>
  useDocumentWrite((input: UpdateDocumentInput) => api.documents.update(id, input));

export const useReindexDocument = (id: string) => useDocumentWrite(() => api.documents.reindex(id));

export const useUploadDocument = () => useDocumentWrite((file: File) => api.documents.upload(file));

export function useDeleteDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.documents.remove,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.documents }),
  });
}

export function useReindexOutdated() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.documents.reindexOutdated,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.documents }),
  });
}

export const useConversations = () =>
  useQuery({ queryKey: queryKeys.conversations, queryFn: api.conversations.list });

export const useConversation = (id: string) =>
  useQuery({ queryKey: queryKeys.conversation(id), queryFn: () => api.conversations.get(id) });

export function useCreateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.conversations.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.conversations }),
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.conversations.remove,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.conversations }),
  });
}

export const useUsage = (days: number) =>
  useQuery({ queryKey: queryKeys.usage(days), queryFn: () => api.usage(days) });
