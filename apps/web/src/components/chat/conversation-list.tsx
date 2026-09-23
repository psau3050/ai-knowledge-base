'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Button, ErrorNotice, Spinner } from '@/components/ui';
import { useConversations, useCreateConversation, useDeleteConversation } from '@/lib/queries';

export function ConversationList() {
  const router = useRouter();
  const { id: activeId } = useParams<{ id?: string }>();
  const { data: conversations, isPending, error } = useConversations();
  const create = useCreateConversation();
  const remove = useDeleteConversation();

  function startChat() {
    create.mutate(undefined, {
      onSuccess: (conversation) => router.push(`/chat/${conversation.id}`),
    });
  }

  function deleteChat(id: string, title: string) {
    if (!window.confirm(`Delete “${title}”?`)) return;
    remove.mutate(id, { onSuccess: () => id === activeId && router.push('/chat') });
  }

  return (
    <div className="flex flex-col gap-3 border-b border-zinc-200 bg-white p-3 lg:w-64 lg:shrink-0 lg:border-r lg:border-b-0">
      <Button onClick={startChat} disabled={create.isPending}>
        New chat
      </Button>
      <ErrorNotice error={error ?? create.error ?? remove.error} />
      {isPending ? (
        <Spinner />
      ) : (
        <ul className="max-h-48 space-y-0.5 overflow-y-auto lg:max-h-none">
          {conversations?.map((conversation) => (
            <li key={conversation.id} className="group flex items-center">
              <Link
                href={`/chat/${conversation.id}`}
                className={`min-w-0 flex-1 truncate rounded-md px-2.5 py-2 text-sm ${
                  conversation.id === activeId
                    ? 'bg-indigo-50 font-medium text-indigo-700'
                    : 'text-zinc-700 hover:bg-zinc-100'
                }`}
              >
                {conversation.title}
              </Link>
              <button
                type="button"
                aria-label={`Delete ${conversation.title}`}
                onClick={() => deleteChat(conversation.id, conversation.title)}
                className="rounded px-1.5 text-zinc-400 opacity-0 group-hover:opacity-100 hover:text-red-600 focus:opacity-100"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
